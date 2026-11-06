import type { Pool, PoolClient } from 'pg';
import type {
  ReservationsStore,
  Reservation,
  ReservationScope,
} from './model.js';
import { BusinessError, required } from '../shared/errors.js';
import { transaction } from '../../db/transaction.js';
import { lockRoom } from '../rooms/store.js';
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
export function postgresReservations(pool: Pool): ReservationsStore {
  return {
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
      return transaction(pool, async (client) => {
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
      return transaction(pool, async (client) => {
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
      return transaction(pool, async (client) => {
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
