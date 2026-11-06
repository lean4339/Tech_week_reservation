import { test, expect } from './fixtures';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../../apps/backend/dist/auth/password.js';

const pool = new pg.Pool({
  connectionString:
    'postgresql://tech_week:tech_week_test@127.0.0.1:55432/tech_week_test',
});
const adminId = randomUUID(),
  userId = randomUUID(),
  buildingId = randomUUID(),
  roomId = randomUUID(),
  reservationId = randomUUID();
const adminEmail = `${adminId}@example.test`,
  userEmail = `${userId}@example.test`;
const password = 'Synthetic metrics browser passphrase!';
const company = `Empresa métricas ${userId.slice(0, 8)} <img src=x onerror="window.__metricsXss=1">`;
const roomName = `Sala métricas ${roomId.slice(0, 8)}`;
test.beforeAll(async () => {
  const hash = await hashPassword(password);
  await pool.query(
    'INSERT INTO auth.users (id,email,password_hash,role,business_name) VALUES ($1,$2,$3,$4,$5),($6,$7,$3,$8,$9)',
    [
      adminId,
      adminEmail,
      hash,
      'admin',
      null,
      userId,
      userEmail,
      'user',
      company,
    ],
  );
  await pool.query(
    "INSERT INTO public.buildings (id,name,address) VALUES ($1,'Sede Métricas','Calle 123')",
    [buildingId],
  );
  await pool.query(
    "INSERT INTO public.rooms (id,name,capacity,building_id,created_at) VALUES ($1,$2,10,$3,'2029-01-01')",
    [roomId, roomName, buildingId],
  );
  await pool.query(
    "INSERT INTO public.reservations (id,room_id,user_id,starts_at,ends_at) VALUES ($1,$2,$3,'2035-01-01T09:00Z','2035-01-01T11:00Z')",
    [reservationId, roomId, userId],
  );
});
test.afterAll(async () => {
  try {
    await pool.query('DELETE FROM public.reservations WHERE id=$1', [
      reservationId,
    ]);
    await pool.query('DELETE FROM public.rooms WHERE id=$1', [roomId]);
    await pool.query('DELETE FROM public.buildings WHERE id=$1', [buildingId]);
    await pool.query('DELETE FROM auth.users WHERE id=ANY($1::uuid[])', [
      [adminId, userId],
    ]);
  } finally {
    await pool.end();
  }
});
test('admin reads metrics without filters, changes period and sees cancellation invalidate Redis; clients are denied', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(adminEmail);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Métricas', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Métricas de utilización', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Horas reservadas', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Desde', { exact: true })).not.toBeVisible();
  await page
    .locator('summary')
    .filter({ hasText: 'Elegir otras fechas' })
    .click();
  await page.getByLabel('Desde', { exact: true }).fill('2035-01-01');
  await page.getByLabel('Hasta inclusive', { exact: true }).fill('2035-01-02');
  await page.getByRole('button', { name: 'Ver período', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Horas reservadas', exact: true }),
  ).toContainText('2 h');
  await expect(
    page.getByRole('table', { name: 'Utilización', exact: true }),
  ).toContainText(roomName);
  await page.getByRole('button', { name: 'Empresas', exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Utilización', exact: true }),
  ).toContainText(company);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => Reflect.get(window, '__metricsXss')),
  ).toBeUndefined();
  await page
    .getByRole('button', { name: 'Actualizar métricas', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Horas reservadas', exact: true }),
  ).toContainText('2 h');
  const response = await page
    .context()
    .request.delete(`/api/admin/reservations/${reservationId}`, {
      headers: {
        Origin: 'http://127.0.0.1:3100',
        'X-Requested-With': 'tech-week-web',
      },
      data: {},
    });
  expect(response.status()).toBe(200);
  await page
    .getByRole('button', { name: 'Actualizar métricas', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Horas reservadas', exact: true }),
  ).toContainText('0 h');
  await expect(
    page.getByRole('region', { name: 'Cancelaciones', exact: true }),
  ).toContainText('1');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const context = await browser.newContext({ baseURL });
  try {
    const client = await context.newPage();
    await client.goto('/login');
    await client.getByLabel('Email', { exact: true }).fill(userEmail);
    await client.getByLabel('Contraseña', { exact: true }).fill(password);
    await client
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(client).toHaveURL(/\/dashboard$/);
    await expect(
      client.getByRole('link', { name: 'Métricas', exact: true }),
    ).toHaveCount(0);
    expect((await context.request.get('/api/admin/metrics')).status()).toBe(
      403,
    );
    expect((await client.goto('/admin/metrics'))?.status()).toBe(404);
  } finally {
    await context.close();
  }
});

test('an administrator demoted with the dashboard open cannot refresh or replay access to private metrics', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(adminEmail);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Métricas', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Horas reservadas', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Empresas', exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Utilización', exact: true }),
  ).toContainText(company);
  try {
    await pool.query("UPDATE auth.users SET role='user' WHERE id=$1", [
      adminId,
    ]);
    const rejected = page.waitForResponse(
      (response) =>
        response.url().includes('/api/admin/metrics') &&
        response.status() === 403,
    );
    await page
      .getByRole('button', { name: 'Actualizar métricas', exact: true })
      .click();
    await rejected;
    await expect(
      page.getByRole('alert').filter({ hasText: 'No tenés permiso' }),
    ).toBeVisible();
    await expect(
      page.getByRole('table', { name: 'Utilización', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Horas reservadas', exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await page.context().request.get('/api/admin/metrics', {
          headers: { 'X-Role': 'admin', 'X-User-Id': adminId },
        })
      ).status(),
    ).toBe(403);
    expect((await page.goto('/admin/metrics'))?.status()).toBe(404);
  } finally {
    await pool.query("UPDATE auth.users SET role='admin' WHERE id=$1", [
      adminId,
    ]);
  }
});
