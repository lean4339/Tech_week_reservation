import type { Pool, PoolClient } from 'pg';
import {
  BusinessError,
  type BusinessStore,
  type Building,
  type ClientBusiness,
  type Reservation,
  type ReservationScope,
  type Room,
} from './model.js';

const buildingFields = 'id, name, address, active, created_at AS "createdAt"';
const roomFields = `room.id, room.name, room.location, room.capacity, room.active, room.created_at AS "createdAt",
  room.building_id AS "buildingId", building.name AS "buildingName", building.address AS "buildingAddress", building.active AS "buildingActive"`;
const roomJoin =
  'FROM public.rooms room LEFT JOIN public.buildings building ON building.id = room.building_id';
const roomVisible = '(room.active AND COALESCE(building.active, false))';
const reservationFields = `r.id, r.room_id AS "roomId", r.user_id AS "userId",
  r.starts_at AS "startsAt", r.ends_at AS "endsAt", r.created_at AS "createdAt",
  r.cancelled_at AS "cancelledAt", room.name AS "roomName", u.business_name AS "businessName",
  room.building_id AS "buildingId", building.name AS "buildingName"`;
const reservationJoin =
  'FROM public.reservations r JOIN public.rooms room ON room.id = r.room_id JOIN auth.users u ON u.id = r.user_id LEFT JOIN public.buildings building ON building.id = room.building_id';
function owner(scope: ReservationScope): string | null {
  if (
    'ownerId' in scope &&
    typeof scope.ownerId === 'string' &&
    scope.ownerId.length
  )
    return scope.ownerId;
  if ('admin' in scope && scope.admin === true) return null;
  throw new Error('Missing reservation authorization scope');
}
function required<T>(row: T | undefined): T {
  if (!row) throw new BusinessError(404, 'Recurso no encontrado.');
  return row;
}

export function postgresBusiness(pool: Pool): BusinessStore {
  async function transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Bound lock/resource contention; no endless waits under concurrent writes.
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      const code = (error as { code?: string }).code;
      if (code === '23P01')
        throw new BusinessError(
          409,
          'La sala ya está reservada en ese período.',
        );
      if (code === '40P01' || code === '55P03')
        throw new BusinessError(
          409,
          'La sala está siendo modificada. Volvé a intentar.',
        );
      throw error;
    } finally {
      client.release();
    }
  }
  async function getReservation(
    db: Pool | PoolClient,
    id: string,
    scope: ReservationScope,
  ) {
    const { rows } = await db.query<Reservation>(
      `SELECT ${reservationFields} ${reservationJoin} WHERE r.id = $1 AND ($2::uuid IS NULL OR r.user_id = $2)`,
      [id, owner(scope)],
    );
    return required(rows[0]);
  }
  async function lockBuilding(client: PoolClient, id: string | null) {
    if (!id)
      throw new BusinessError(
        409,
        'La sala todavía no tiene un edificio asignado.',
      );
    const { rows } = await client.query<{ active: boolean }>(
      'SELECT active FROM public.buildings WHERE id = $1 FOR SHARE',
      [id],
    );
    if (!required(rows[0]).active)
      throw new BusinessError(409, 'El edificio está desactivado.');
  }
  async function lockRoom(client: PoolClient, id: string) {
    const { rows } = await client.query<{
      active: boolean;
      building_id: string | null;
    }>(
      'SELECT active, building_id FROM public.rooms WHERE id = $1 FOR UPDATE',
      [id],
    );
    const row = required(rows[0]);
    if (!row.active) throw new BusinessError(409, 'La sala está desactivada.');
    // SHARE serializes booking against deactivation without locking other rooms.
    await lockBuilding(client, row.building_id);
  }
  async function getRoom(
    db: Pool | PoolClient,
    id: string,
    includeInactive: boolean,
  ) {
    return required(
      (
        await db.query<Room>(
          `SELECT ${roomFields} ${roomJoin} WHERE room.id = $1 AND (${roomVisible} OR $2::boolean)`,
          [id, includeInactive],
        )
      ).rows[0],
    );
  }
  return {
    async buildings(page, includeInactive) {
      return (
        await pool.query<Building>(
          `SELECT ${buildingFields} FROM public.buildings WHERE (active OR $1::boolean) ORDER BY name, id LIMIT $2 OFFSET $3`,
          [includeInactive, page.limit, page.offset],
        )
      ).rows;
    },
    async building(id, includeInactive) {
      return required(
        (
          await pool.query<Building>(
            `SELECT ${buildingFields} FROM public.buildings WHERE id = $1 AND (active OR $2::boolean)`,
            [id, includeInactive],
          )
        ).rows[0],
      );
    },
    async createBuilding(input) {
      return required(
        (
          await pool.query<Building>(
            `INSERT INTO public.buildings (name, address, active) VALUES ($1,$2,$3) RETURNING ${buildingFields}`,
            [input.name, input.address, input.active],
          )
        ).rows[0],
      );
    },
    async updateBuilding(id, input) {
      return transaction(async (client) =>
        required(
          (
            await client.query<Building>(
              `UPDATE public.buildings SET name = COALESCE($2, name), address = COALESCE($3, address), active = COALESCE($4::boolean, active) WHERE id = $1 RETURNING ${buildingFields}`,
              [
                id,
                input.name ?? null,
                input.address ?? null,
                input.active ?? null,
              ],
            )
          ).rows[0],
        ),
      );
    },
    async clients(page, search) {
      return (
        await pool.query<ClientBusiness>(
          `SELECT id, business_name AS "businessName"
        FROM auth.users WHERE role = 'user' AND active
        AND ($1 = '' OR strpos(lower(COALESCE(business_name, '')), lower($1)) > 0)
        ORDER BY business_name NULLS LAST, id LIMIT $2 OFFSET $3`,
          [search, page.limit, page.offset],
        )
      ).rows;
    },
    async rooms(page, includeInactive, period, buildingId) {
      return (
        await pool.query<Room>(
          `SELECT ${roomFields}, CASE WHEN $4::timestamptz IS NULL THEN NULL ELSE ${roomVisible} AND NOT EXISTS (
        SELECT 1 FROM public.reservations r WHERE r.room_id = room.id AND r.cancelled_at IS NULL
        AND ($5::timestamptz IS NULL OR r.starts_at < $5)
        AND ($4::timestamptz IS NULL OR r.ends_at > $4)
      ) END AS available ${roomJoin}
      WHERE (${roomVisible} OR $1::boolean) AND ($6::uuid IS NULL OR room.building_id = $6)
      ORDER BY room.name, room.id LIMIT $2 OFFSET $3`,
          [
            includeInactive,
            page.limit,
            page.offset,
            period?.startsAt ?? null,
            period?.endsAt ?? null,
            buildingId ?? null,
          ],
        )
      ).rows;
    },
    room: (id, includeInactive) => getRoom(pool, id, includeInactive),
    createRoom(input) {
      return transaction(async (client) => {
        await lockBuilding(client, input.buildingId);
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO public.rooms (name, location, capacity, active, building_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [
            input.name,
            input.location,
            input.capacity,
            input.active,
            input.buildingId,
          ],
        );
        return getRoom(client, rows[0]!.id, true);
      });
    },
    updateRoom(id, input) {
      return transaction(async (client) => {
        const existing = required(
          (
            await client.query<{ building_id: string | null }>(
              'SELECT building_id FROM public.rooms WHERE id = $1 FOR UPDATE',
              [id],
            )
          ).rows[0],
        );
        if (
          input.buildingId !== undefined &&
          input.buildingId !== existing.building_id
        ) {
          if (existing.building_id) {
            const history = await client.query(
              'SELECT 1 FROM public.reservations WHERE room_id = $1 LIMIT 1',
              [id],
            );
            if (history.rows.length)
              throw new BusinessError(
                409,
                'Una sala con reservas no puede cambiar de edificio. Creá otra sala para la nueva ubicación.',
              );
          }
          await lockBuilding(client, input.buildingId);
        }
        await client.query(
          `UPDATE public.rooms SET
          name = CASE WHEN $2::boolean THEN $3 ELSE name END,
          location = CASE WHEN $4::boolean THEN $5 ELSE location END,
          capacity = CASE WHEN $6::boolean THEN $7::integer ELSE capacity END,
          active = CASE WHEN $8::boolean THEN $9::boolean ELSE active END,
          building_id = COALESCE($10::uuid, building_id)
          WHERE id = $1`,
          [
            id,
            input.name !== undefined,
            input.name ?? null,
            input.location !== undefined,
            input.location ?? null,
            input.capacity !== undefined,
            input.capacity ?? null,
            input.active !== undefined,
            input.active ?? null,
            input.buildingId ?? null,
          ],
        );
        return getRoom(client, id, true);
      });
    },
    async availability(id, period, includeInactive) {
      const { rows } = await pool.query<{ available: boolean }>(
        `SELECT ${roomVisible} AND NOT EXISTS (
        SELECT 1 FROM public.reservations r WHERE r.room_id = room.id AND r.cancelled_at IS NULL
        AND r.starts_at < $3::timestamptz AND r.ends_at > $2::timestamptz
      ) AS available ${roomJoin} WHERE room.id = $1 AND (${roomVisible} OR $4::boolean)`,
        [id, period.startsAt, period.endsAt, includeInactive],
      );
      return required(rows[0]).available;
    },
    async reservations(filter, scope) {
      // One bounded query for rooms AND companies, including all authorization predicates.
      return (
        await pool.query<Reservation>(
          `SELECT ${reservationFields} ${reservationJoin}
        WHERE ($1::uuid IS NULL OR r.user_id = $1)
        AND ($2::uuid IS NULL OR r.room_id = $2) AND ($3::uuid IS NULL OR r.user_id = $3)
        AND ($5::timestamptz IS NULL OR r.starts_at < $5)
        AND ($4::timestamptz IS NULL OR r.ends_at > $4)
        AND ($6 = 'all' OR ($6 = 'active' AND r.cancelled_at IS NULL) OR ($6 = 'cancelled' AND r.cancelled_at IS NOT NULL))
        AND ($9::uuid IS NULL OR room.building_id = $9)
        ORDER BY r.starts_at, r.id LIMIT $7 OFFSET $8`,
          [
            owner(scope),
            filter.roomId ?? null,
            filter.userId ?? null,
            filter.startsAt ?? null,
            filter.endsAt ?? null,
            filter.status,
            filter.limit,
            filter.offset,
            filter.buildingId ?? null,
          ],
        )
      ).rows;
    },
    reservation: (id, scope) => getReservation(pool, id, scope),
    createReservation(input, userId) {
      return transaction(async (client) => {
        await lockRoom(client, input.roomId);
        // Admin may book for active client accounts, never assign bookings to an admin.
        const clientAccount = await client.query(
          "SELECT id FROM auth.users WHERE id = $1 AND active AND role = 'user' FOR SHARE",
          [userId],
        );
        required(clientAccount.rows[0]);
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO public.reservations (room_id, user_id, starts_at, ends_at)
          VALUES ($1, $2, $3, $4) RETURNING id`,
          [input.roomId, userId, input.startsAt, input.endsAt],
        );
        return getReservation(client, rows[0]!.id, { ownerId: userId });
      });
    },
    updateReservation(id, period, scope) {
      return transaction(async (client) => {
        const { rows } = await client.query<{
          room_id: string;
          cancelled_at: Date | null;
          starts_at: Date;
        }>(
          'SELECT room_id, cancelled_at, starts_at FROM public.reservations WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2) FOR UPDATE',
          [id, owner(scope)],
        );
        const row = required(rows[0]);
        if (row.cancelled_at || row.starts_at.getTime() <= Date.now())
          throw new BusinessError(
            409,
            'No se puede reprogramar una reserva cancelada o iniciada.',
          );
        await lockRoom(client, row.room_id);
        await client.query(
          'UPDATE public.reservations SET starts_at = $3, ends_at = $4 WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2)',
          [id, owner(scope), period.startsAt, period.endsAt],
        );
        return getReservation(client, id, scope);
      });
    },
    cancelReservation(id, scope) {
      return transaction(async (client) => {
        // Ownership is checked by the modifying statement itself; repeated cancel is idempotent.
        const result = await client.query(
          'UPDATE public.reservations SET cancelled_at = COALESCE(cancelled_at, now()) WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2) RETURNING id',
          [id, owner(scope)],
        );
        required(result.rows[0]);
        return getReservation(client, id, scope);
      });
    },
  };
}
