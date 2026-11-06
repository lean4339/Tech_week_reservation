import { test, expect } from './fixtures';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../../apps/backend/dist/auth/password.js';

const password = 'Synthetic browser test passphrase!';
const headers = {
  Origin: 'http://127.0.0.1:3100',
  'X-Requested-With': 'tech-week-web',
};
const pool = new pg.Pool({
  connectionString:
    'postgresql://tech_week:tech_week_test@127.0.0.1:55432/tech_week_test',
  connectionTimeoutMillis: 2000,
});
const emails: string[] = [];
let adminEmail: string;

test.beforeAll(async () => {
  // Local fixture creation only. The public API never grants administrative roles.
  adminEmail = `admin-${randomUUID()}@example.test`;
  emails.push(adminEmail);
  await pool.query(
    'INSERT INTO auth.users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
    [randomUUID(), adminEmail, await hashPassword(password), 'admin'],
  );
});
test.afterAll(async () => {
  try {
    await pool.query('DELETE FROM auth.users WHERE email = ANY($1::text[])', [
      emails,
    ]);
  } finally {
    await pool.end();
  }
});

test('visitor is redirected from protected pages to login', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
});

test('user signs up, logs in, cannot access admin, logs out and cannot replay the session', async ({
  page,
  context,
}) => {
  const email = `user-${randomUUID()}@example.test`;
  emails.push(email);
  await page.goto('/signup');
  const businessName = "Café O'Connor <img src=x onerror=alert(1)>";
  await page
    .getByLabel('Nombre de la empresa', { exact: true })
    .fill(businessName);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Registro procesado');
  await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('heading', { name: 'Bienvenido de nuevo', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/login') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  expect((await loginResponse).status()).toBe(200);
  expect((await context.request.get('/api/auth/me')).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('main')).toContainText(businessName);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: `Hola, ${email}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Abrir administración/ }),
  ).toHaveCount(0);
  const session = (await context.cookies()).find(
    (c) => c.name === 'tech_week_session',
  )!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    session.value,
  );
  expect((await context.request.get('/api/admin/auth-events')).status()).toBe(
    403,
  );
  const blocked = await page.goto('/admin');
  expect(blocked?.status()).toBe(404);
  await page.goto('/dashboard');
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await context.request.get('/api/auth/me', {
        headers: { Cookie: `${session.name}=${session.value}` },
      })
    ).status(),
  ).toBe(401);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('admin can log in and read real Redis authentication events', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(adminEmail);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link', { name: /Abrir administración/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole('heading', { name: 'Acceso y actividad' }),
  ).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Eventos de autenticación' }),
  ).toContainText('login_succeeded');
  await expect(
    page.getByRole('table', { name: 'Eventos de autenticación' }),
  ).not.toContainText(password);
  await expect(
    page.getByRole('table', { name: 'Solicitudes HTTP' }),
  ).toContainText('127.0.0.1');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('backend rejects forged roles and cross-origin writes through the real Next.js proxy', async ({
  request,
}) => {
  const email = `rejected-${randomUUID()}@example.test`;
  const elevation = await request.post('/api/auth/signup', {
    headers,
    data: { email, password, businessName: 'Empresa de prueba', role: 'admin' },
  });
  expect(elevation.status()).toBe(400);
  const csrf = await request.post('/api/auth/signup', {
    headers: { ...headers, Origin: 'https://attacker.invalid' },
    data: { email, password, businessName: 'Empresa de prueba' },
  });
  expect(csrf.status()).toBe(403);
  const records = await pool.query(
    'SELECT id FROM auth.users WHERE email = $1',
    [email],
  );
  expect(records.rows).toHaveLength(0);
});

test('login displays a generic credentials error without creating a session', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`unknown-${randomUUID()}@example.test`);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Email o contraseña incorrectos.' }),
  ).toBeVisible();
  expect(
    (await context.cookies()).filter((c) =>
      c.name.includes('tech_week_session'),
    ),
  ).toHaveLength(0);
});
