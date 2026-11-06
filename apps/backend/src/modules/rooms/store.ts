import type { Pool, PoolClient } from 'pg';
import type { RoomsStore, Room } from './model.js';
import { BusinessError, required } from '../shared/errors.js';
import { transaction } from '../../db/transaction.js';
import { lockBuilding } from '../buildings/store.js';
const roomFields = `room.id, room.name, room.location, room.capacity, room.active, room.created_at AS "createdAt",
  room.building_id AS "buildingId", building.name AS "buildingName", building.address AS "buildingAddress", building.active AS "buildingActive"`;
const roomJoin =
  'FROM public.rooms room LEFT JOIN public.buildings building ON building.id = room.building_id';
const roomVisible = '(room.active AND COALESCE(building.active, false))';
export async function lockRoom(client: PoolClient, id: string) {
  const { rows } = await client.query<{
    active: boolean;
    building_id: string | null;
  }>('SELECT active, building_id FROM public.rooms WHERE id = $1 FOR UPDATE', [
    id,
  ]);
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
export function postgresRooms(pool: Pool): RoomsStore {
  return {
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
      return transaction(pool, async (client) => {
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
      return transaction(pool, async (client) => {
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
  };
}
