import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../../apps/backend/dist/auth/password.js';

test.use({ actionTimeout: 10000 });

const password = 'Synthetic business browser passphrase!';
const pool = new pg.Pool({
  connectionString:
    'postgresql://tech_week:tech_week_test@127.0.0.1:55432/tech_week_test',
  connectionTimeoutMillis: 2000,
});
const userIds = [randomUUID(), randomUUID()];
const emails = userIds.map((id) => `${id}@example.test`);
const roomIds: string[] = [];
const buildingIds: string[] = [];
const company = `Empresa ${userIds[1].slice(0, 8)} <img src=x>`;
const buildingName = `Edificio ${userIds[0].slice(0, 8)} <img src=x>`;
const roomName = `Sala ${userIds[0].slice(0, 8)} <img src=x>`;
async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
}
async function period(page: Page, start: string, end: string, scope?: string) {
  const target = scope
    ? page.getByRole('region', { name: scope, exact: true })
    : page;
  await target.getByLabel('Inicio', { exact: true }).fill(start);
  await target.getByLabel('Fin', { exact: true }).fill(end);
}

test.beforeAll(async () => {
  const hash = await hashPassword(password);
  for (const [index, id] of userIds.entries())
    await pool.query(
      'INSERT INTO auth.users (id, email, password_hash, role, business_name) VALUES ($1,$2,$3,$4,$5)',
      [
        id,
        emails[index],
        hash,
        index === 0 ? 'admin' : 'user',
        index === 0 ? null : company,
      ],
    );
});
test.afterAll(async () => {
  try {
    await pool.query(
      'DELETE FROM public.reservations WHERE user_id = ANY($1::uuid[]) OR room_id = ANY($2::uuid[])',
      [userIds, roomIds],
    );
    await pool.query('DELETE FROM public.rooms WHERE id = ANY($1::uuid[])', [
      roomIds,
    ]);
    await pool.query(
      'DELETE FROM public.buildings WHERE id = ANY($1::uuid[])',
      [buildingIds],
    );
    await pool.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [
      userIds,
    ]);
  } finally {
    await pool.end();
  }
});

test('browser admin manages rooms and agenda; client books, reschedules and cancels through forms', async ({
  page: admin,
  browser,
  baseURL,
}) => {
  const clientContext = await browser.newContext({ baseURL });
  const client = await clientContext.newPage();
  try {
    await login(admin, emails[0]);
    await expect(admin).toHaveURL(/\/admin$/);
    await expect(
      admin
        .getByRole('heading', { name: 'Agenda de reservas', exact: true })
        .first(),
    ).toBeVisible();
    await admin
      .getByRole('link', { name: 'Administrar edificios', exact: true })
      .click();
    await admin
      .getByRole('button', { name: 'Crear edificio', exact: true })
      .click();
    await admin
      .getByLabel('Nombre del edificio', { exact: true })
      .fill(buildingName);
    await admin.getByLabel('Dirección', { exact: true }).fill('Calle 123');
    const buildingResponse = admin.waitForResponse(
      (response) =>
        response.url().endsWith('/api/buildings') &&
        response.request().method() === 'POST',
    );
    await admin
      .getByRole('button', { name: 'Guardar edificio', exact: true })
      .click();
    const createdBuilding = await buildingResponse;
    expect(createdBuilding.status()).toBe(201);
    buildingIds.push((await createdBuilding.json()).building.id);
    const buildingRow = admin
      .getByRole('table', { name: 'Edificios', exact: true })
      .getByRole('row')
      .filter({ hasText: buildingName });
    await expect(buildingRow).toContainText('Calle 123');
    await buildingRow
      .getByRole('button', { name: 'Editar', exact: true })
      .click();
    await admin.getByLabel('Dirección', { exact: true }).fill('Calle 456');
    await admin
      .getByRole('button', { name: 'Guardar edificio', exact: true })
      .click();
    await expect(buildingRow).toContainText('Calle 456');
    await admin
      .getByRole('link', { name: 'Administrar salas', exact: true })
      .click();
    await admin
      .getByRole('button', { name: 'Crear sala', exact: true })
      .click();
    await admin.getByLabel('Nombre de la sala', { exact: true }).fill(roomName);
    await expect(
      admin
        .getByLabel('Edificio de la sala')
        .locator('option', { hasText: buildingName }),
    ).toHaveCount(1);
    await admin.getByLabel('Edificio de la sala').selectOption(buildingIds[0]);
    await admin
      .getByLabel('Piso o ubicación dentro del edificio', { exact: true })
      .fill('Piso 2');
    await admin.getByLabel('Capacidad', { exact: true }).fill('12');
    const roomResponse = admin.waitForResponse(
      (response) =>
        response.url().endsWith('/api/rooms') &&
        response.request().method() === 'POST',
    );
    await admin
      .getByRole('button', { name: 'Guardar sala', exact: true })
      .click();
    const created = await roomResponse;
    expect(created.status()).toBe(201);
    roomIds.push((await created.json()).room.id);
    await expect(admin.locator('.success[role="status"]')).toContainText(
      'Sala creada',
    );
    const roomRow = admin.getByRole('row').filter({ hasText: roomName });
    await expect(roomRow).toContainText('12 personas');
    await expect(admin.locator('img[src="x"]')).toHaveCount(0);
    await roomRow.getByRole('button', { name: 'Editar', exact: true }).click();
    await admin.getByLabel('Capacidad', { exact: true }).fill('16');
    await admin
      .getByRole('button', { name: 'Guardar sala', exact: true })
      .click();
    await expect(roomRow).toContainText('16 personas');

    await login(client, emails[1]);
    await expect(client).toHaveURL(/\/dashboard$/);
    await expect(
      client.getByRole('link', { name: 'Administrar salas' }),
    ).toHaveCount(0);
    await client
      .getByText('Buscar por edificio u horario', { exact: true })
      .click();
    await expect(
      client
        .getByLabel('Edificio', { exact: true })
        .locator('option', { hasText: buildingName }),
    ).toHaveCount(1);
    await client
      .getByLabel('Edificio', { exact: true })
      .selectOption(buildingIds[0]);
    await period(client, '2035-05-10T09:00', '2035-05-10T10:00');
    await client
      .getByRole('button', { name: 'Consultar disponibilidad', exact: true })
      .click();
    const roomCard = client.getByRole('article').filter({ hasText: roomName });
    await expect(roomCard).toContainText('Disponible');
    const apiHeaders = {
      Origin: 'http://127.0.0.1:3100',
      'X-Requested-With': 'tech-week-web',
    };
    const occupiedPeriod = await client.evaluate(() => ({
      startsAt: new Date('2035-05-10T09:00').toISOString(),
      endsAt: new Date('2035-05-10T10:00').toISOString(),
    }));
    const concurrent = await admin
      .context()
      .request.post('/api/admin/reservations', {
        headers: apiHeaders,
        data: { roomId: roomIds[0], userId: userIds[1], ...occupiedPeriod },
      });
    expect(concurrent.status()).toBe(201);
    const concurrentId = (await concurrent.json()).reservation.id;
    // The client's availability is now stale: the API must decide the final outcome.
    await roomCard
      .getByRole('button', { name: `Reservar ${roomName}`, exact: true })
      .click();
    await client
      .getByRole('region', { name: 'Confirmar reserva', exact: true })
      .getByRole('button', { name: 'Confirmar', exact: true })
      .click();
    await expect(client.locator('.error[role="alert"]')).toContainText(
      'ya está reservada',
    );
    await client.getByRole('button', { name: 'Cerrar formulario' }).click();
    expect(
      (
        await admin
          .context()
          .request.delete(`/api/admin/reservations/${concurrentId}`, {
            headers: apiHeaders,
            data: {},
          })
      ).status(),
    ).toBe(200);
    await client
      .getByRole('button', { name: 'Actualizar disponibilidad', exact: true })
      .click();
    await expect(roomCard).toContainText('Disponible');

    await roomCard
      .getByRole('button', { name: `Reservar ${roomName}`, exact: true })
      .click();
    await client
      .getByRole('region', { name: 'Confirmar reserva', exact: true })
      .getByRole('button', { name: 'Confirmar', exact: true })
      .click();
    await expect(client.locator('.success[role="status"]')).toContainText(
      'Reserva confirmada',
    );
    await expect(roomCard).toContainText('Ocupada en este horario');
    await client
      .getByRole('link', { name: 'Mis reservas', exact: true })
      .click();
    await expect(client.getByLabel('Desde', { exact: true })).toHaveValue('');
    await expect(client.getByLabel('Hasta', { exact: true })).toHaveValue('');
    const clientRow = client
      .getByRole('table', { name: 'Mis reservas', exact: true })
      .getByRole('row')
      .filter({ hasText: roomName });
    await expect(clientRow).toContainText('Vigente');
    await expect(client.getByLabel('Desde', { exact: true })).not.toBeVisible();
    await client
      .locator('summary')
      .filter({ hasText: 'Filtrar reservas' })
      .click();
    await client.getByLabel('Desde', { exact: true }).fill('2040-01-01');
    await client
      .getByRole('button', { name: 'Aplicar filtros', exact: true })
      .click();
    await expect(
      client.getByText('No hay reservas para estos filtros.', { exact: false }),
    ).toBeVisible();
    await client
      .getByRole('button', { name: 'Quitar filtros', exact: true })
      .click();
    await expect(client.getByLabel('Desde', { exact: true })).toHaveValue('');
    await expect(clientRow).toContainText('Vigente');

    await clientRow.getByRole('button', { name: 'Reprogramar' }).click();
    await period(
      client,
      '2035-05-10T11:00',
      '2035-05-10T12:00',
      'Reprogramar reserva',
    );
    await client.getByRole('button', { name: 'Guardar reserva' }).click();
    await expect(client.locator('.success[role="status"]')).toContainText(
      'Reserva reprogramada',
    );
    await expect(clientRow).toContainText('11:00');

    await admin
      .getByRole('link', { name: 'Agenda de reservas', exact: true })
      .click();
    await expect(admin.getByLabel('Desde', { exact: true })).toHaveValue('');
    await expect(admin.getByLabel('Hasta', { exact: true })).toHaveValue('');
    await expect(
      admin.getByRole('table', { name: 'Agenda de reservas', exact: true }),
    ).toContainText(roomName);
    await expect(admin.getByLabel('Desde', { exact: true })).not.toBeVisible();
    await admin
      .locator('summary')
      .filter({ hasText: 'Filtrar reservas' })
      .click();
    await expect(
      admin
        .getByLabel('Sala', { exact: true })
        .locator('option', { hasText: roomName }),
    ).toHaveCount(1);
    await expect(
      admin
        .getByLabel('Edificio', { exact: true })
        .locator('option', { hasText: buildingName }),
    ).toHaveCount(1);
    await admin
      .getByLabel('Edificio', { exact: true })
      .selectOption(buildingIds[0]);
    await expect(
      admin
        .getByLabel('Sala', { exact: true })
        .locator('option', { hasText: roomName }),
    ).toHaveCount(1);
    await admin.getByLabel('Sala', { exact: true }).selectOption(roomIds[0]);
    await expect(
      admin
        .getByLabel('Empresa', { exact: true })
        .locator('option', { hasText: company }),
    ).toHaveCount(1);
    await admin.getByLabel('Empresa', { exact: true }).selectOption(userIds[1]);
    await admin.getByRole('button', { name: 'Aplicar filtros' }).click();
    const adminRow = admin
      .getByRole('table', { name: 'Agenda de reservas', exact: true })
      .getByRole('row')
      .filter({ hasText: roomName });
    await expect(adminRow).toContainText(company);
    await expect(adminRow).toContainText(buildingName);
    await expect(adminRow).toContainText('11:00');
    await expect(admin.locator('img[src="x"]')).toHaveCount(0);
    await clientRow
      .getByRole('button', { name: 'Cancelar', exact: true })
      .click();
    await client
      .getByRole('region', { name: 'Cancelar reserva', exact: true })
      .getByRole('button', { name: 'Confirmar' })
      .click();
    await expect(client.locator('.success[role="status"]')).toContainText(
      'Reserva cancelada',
    );
    await client
      .getByLabel('Estado', { exact: true })
      .selectOption('cancelled');
    await expect(clientRow.first()).toContainText('Cancelada');
    await expect(clientRow.getByRole('button')).toHaveCount(0);

    await admin
      .getByRole('button', { name: 'Crear reserva', exact: true })
      .click();
    await expect(
      admin
        .getByLabel('Sala de la reserva')
        .locator('option', { hasText: roomName }),
    ).toHaveCount(1);
    await admin.getByLabel('Sala de la reserva').selectOption(roomIds[0]);
    await expect(
      admin
        .getByLabel('Empresa de la reserva', { exact: true })
        .locator('option', { hasText: company }),
    ).toHaveCount(1);
    await admin
      .getByLabel('Empresa de la reserva', { exact: true })
      .selectOption(userIds[1]);
    await period(
      admin,
      '2035-05-10T13:00',
      '2035-05-10T14:00',
      'Crear reserva',
    );
    await admin.getByRole('button', { name: 'Guardar reserva' }).click();
    await expect(admin.locator('.success[role="status"]')).toContainText(
      'Reserva creada',
    );
    await expect(adminRow).toContainText('13:00');
    await adminRow
      .getByRole('button', { name: 'Cancelar', exact: true })
      .click();
    await admin
      .getByRole('region', { name: 'Cancelar reserva', exact: true })
      .getByRole('button', { name: 'Confirmar' })
      .click();
    await expect(admin.locator('.success[role="status"]')).toContainText(
      'Reserva cancelada',
    );

    await admin
      .getByRole('link', { name: 'Administrar salas', exact: true })
      .click();
    await roomRow
      .getByRole('button', { name: 'Desactivar', exact: true })
      .click();
    await admin
      .getByRole('region', { name: 'Desactivar sala', exact: true })
      .getByRole('button', { name: 'Confirmar' })
      .click();
    await expect(roomRow).toContainText('Inactiva');
    await client.goto('/dashboard');
    await expect(
      client.getByRole('article').filter({ hasText: roomName }),
    ).toHaveCount(0);
    await roomRow.getByRole('button', { name: 'Editar', exact: true }).click();
    await admin.getByLabel('Activa para nuevas reservas').check();
    await admin
      .getByRole('button', { name: 'Guardar sala', exact: true })
      .click();
    await expect(roomRow).toContainText('Activa');
    await admin.setViewportSize({ width: 390, height: 844 });
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const denied = await client.goto('/admin/rooms');
    expect(denied?.status()).toBe(404);
    await expect(
      client.getByRole('button', { name: 'Crear sala', exact: true }),
    ).toHaveCount(0);
  } finally {
    await clientContext.close().catch(() => {});
  }
});

test('building deactivation hides its rooms, reactivation restores them and revoked sessions return to login', async ({
  page: admin,
  browser,
  baseURL,
}) => {
  const clientContext = await browser.newContext({ baseURL });
  const client = await clientContext.newPage();
  const headers = {
    Origin: 'http://127.0.0.1:3100',
    'X-Requested-With': 'tech-week-web',
  };
  const name = `Edificio independiente ${randomUUID().slice(0, 8)}`;
  const nameOfRoom = `Sala de ${name}`;
  try {
    await login(admin, emails[0]);
    await expect(admin).toHaveURL(/\/admin$/);
    const building = await admin.context().request.post('/api/buildings', {
      headers,
      data: { name, address: 'Calle 789' },
    });
    expect(building.status()).toBe(201);
    const buildingId = (await building.json()).building.id;
    buildingIds.push(buildingId);
    const room = await admin.context().request.post('/api/rooms', {
      headers,
      data: { name: nameOfRoom, capacity: 8, buildingId },
    });
    expect(room.status()).toBe(201);
    roomIds.push((await room.json()).room.id);
    await login(client, emails[1]);
    await expect(client).toHaveURL(/\/dashboard$/);
    const roomCard = client
      .getByRole('article')
      .filter({ hasText: nameOfRoom });
    await expect(roomCard).toBeVisible();
    await admin
      .getByRole('link', { name: 'Administrar edificios', exact: true })
      .click();
    const row = admin
      .getByRole('table', { name: 'Edificios', exact: true })
      .getByRole('row')
      .filter({ hasText: name });
    await row.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await admin
      .getByRole('region', { name: 'Desactivar edificio', exact: true })
      .getByRole('button', { name: 'Confirmar', exact: true })
      .click();
    await expect(row).toContainText('Inactivo');
    await client
      .getByRole('button', { name: 'Actualizar disponibilidad', exact: true })
      .click();
    await expect(
      client.getByRole('button', {
        name: 'Actualizar disponibilidad',
        exact: true,
      }),
    ).toBeEnabled();
    await expect(roomCard).toHaveCount(0);
    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    await admin.getByLabel('Edificio activo', { exact: true }).check();
    await admin
      .getByRole('button', { name: 'Guardar edificio', exact: true })
      .click();
    await expect(row).toContainText('Activo');
    await client
      .getByRole('button', { name: 'Actualizar disponibilidad', exact: true })
      .click();
    await expect(roomCard).toBeVisible();
    expect((await client.goto('/admin/buildings'))?.status()).toBe(404);
    await client.goto('/dashboard');
    await expect(
      client.getByRole('heading', {
        name: 'Salas y disponibilidad',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await clientContext.request.post('/api/auth/logout', {
          headers,
          data: {},
        })
      ).status(),
    ).toBe(204);
    await client
      .getByRole('button', { name: 'Actualizar disponibilidad', exact: true })
      .click();
    await expect(client).toHaveURL(/\/login$/);
  } finally {
    await clientContext.close().catch(() => {});
  }
});

test('direct booking needs no search; dialogs retain errors, support Escape and restore focus', async ({
  page: admin,
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  const client = await context.newPage();
  const headers = {
    Origin: 'http://127.0.0.1:3100',
    'X-Requested-With': 'tech-week-web',
  };
  const name = `Reserva directa ${randomUUID().slice(0, 8)}`;
  try {
    await login(admin, emails[0]);
    await expect(admin).toHaveURL(/\/admin$/);
    const building = await admin.context().request.post('/api/buildings', {
      headers,
      data: { name, address: 'Calle 100' },
    });
    expect(building.status()).toBe(201);
    const buildingId = (await building.json()).building.id;
    buildingIds.push(buildingId);
    const room = await admin.context().request.post('/api/rooms', {
      headers,
      data: { name, buildingId, capacity: 4 },
    });
    expect(room.status()).toBe(201);
    const roomId = (await room.json()).room.id;
    roomIds.push(roomId);
    await login(client, emails[1]);
    await expect(client).toHaveURL(/\/dashboard$/);
    await expect(
      client.getByLabel('Inicio', { exact: true }),
    ).not.toBeVisible();
    const trigger = client.getByRole('button', {
      name: `Reservar ${name}`,
      exact: true,
    });
    await trigger.click();
    const dialog = client.getByRole('dialog', { name: 'Confirmar reserva' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Cerrar formulario' }),
    ).toBeFocused();
    await client.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByLabel('Inicio', { exact: true }).fill('2036-06-10T09:00');
    await dialog.getByLabel('Fin', { exact: true }).fill('2036-06-10T08:00');
    await dialog
      .getByRole('button', { name: 'Confirmar', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByLabel('Inicio', { exact: true })).toHaveValue(
      '2036-06-10T09:00',
    );
    await dialog.getByLabel('Fin', { exact: true }).fill('2036-06-10T10:00');
    const response = client.waitForResponse(
      (r) =>
        r.url().endsWith('/api/reservations') &&
        r.request().method() === 'POST',
    );
    await dialog
      .getByRole('button', { name: 'Confirmar', exact: true })
      .click();
    expect((await response).status()).toBe(201);
    await expect(dialog).toHaveCount(0);
    await expect(client.locator('.success[role="status"]')).toContainText(
      'Reserva confirmada',
    );
    await client
      .locator('summary')
      .filter({ hasText: 'Buscar por edificio u horario' })
      .click();
    await client
      .getByLabel('Edificio', { exact: true })
      .selectOption(buildingId);
    await period(client, '2036-06-10T11:00', '2036-06-10T12:00');
    await client
      .getByRole('button', { name: 'Consultar disponibilidad', exact: true })
      .click();
    await expect(
      client.getByRole('article').filter({ hasText: name }),
    ).toContainText('Disponible');
    await client
      .getByRole('button', { name: 'Quitar horario', exact: true })
      .click();
    await expect(client.getByLabel('Inicio', { exact: true })).toHaveValue('');
    await expect(client.getByLabel('Fin', { exact: true })).toHaveValue('');
    await expect(client.getByLabel('Edificio', { exact: true })).toHaveValue(
      buildingId,
    );
    await client
      .getByRole('link', { name: 'Mis reservas', exact: true })
      .click();
    await expect(
      client.getByRole('table', { name: 'Mis reservas', exact: true }),
    ).toContainText(name);
    await expect(client.getByLabel('Desde', { exact: true })).not.toBeVisible();
    expect(
      await client.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close().catch(() => {});
  }
});
