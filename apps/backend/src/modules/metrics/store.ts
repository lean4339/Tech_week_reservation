import type { Pool } from 'pg';
import type { Metrics, MetricsStore, Occupancy, Usage } from './model.js';

type Totals = {
  bookedHours: number;
  reservations: number;
  cancellations: number;
};
type RoomTotals = Totals & {
  id: string;
  name: string;
  buildingId: string | null;
  buildingName: string | null;
  capacityHours: number;
};
const zero = (): Totals => ({
  bookedHours: 0,
  reservations: 0,
  cancellations: 0,
});
const round = (value: number) => Math.round(value * 100) / 100;
function usage(row: Totals): Usage {
  return {
    ...row,
    bookedHours: round(row.bookedHours),
    cancellationRate:
      row.reservations + row.cancellations
        ? round(
            (100 * row.cancellations) / (row.reservations + row.cancellations),
          )
        : 0,
  };
}
function occupancy(row: Totals & { capacityHours: number }): Occupancy {
  return {
    ...usage(row),
    capacityHours: round(row.capacityHours),
    occupancyPercent: row.capacityHours
      ? round((100 * row.bookedHours) / row.capacityHours)
      : 0,
  };
}
const query = `
WITH bounds AS (
  SELECT $1::timestamptz AS lo, $2::timestamptz AS hi
), bookings AS MATERIALIZED (
  SELECT r.*, GREATEST(r.starts_at, lo) AS start_clip, LEAST(r.ends_at, hi) AS end_clip,
    EXTRACT(EPOCH FROM LEAST(r.ends_at, hi) - GREATEST(r.starts_at, lo))/3600 AS hours
  FROM public.reservations r CROSS JOIN bounds
  WHERE r.starts_at < hi AND r.ends_at > lo
), room_usage AS (
  SELECT room.id, room.name, room.building_id AS "buildingId", building.name AS "buildingName",
    COALESCE(SUM(b.hours) FILTER (WHERE b.cancelled_at IS NULL), 0) AS "bookedHours",
    COUNT(b.id) FILTER (WHERE b.cancelled_at IS NULL) AS reservations,
    COUNT(b.id) FILTER (WHERE b.cancelled_at IS NOT NULL) AS cancellations,
    GREATEST(0, EXTRACT(EPOCH FROM hi - GREATEST(lo, room.created_at))/3600) AS "capacityHours"
  FROM public.rooms room CROSS JOIN bounds
  LEFT JOIN public.buildings building ON building.id = room.building_id
  LEFT JOIN bookings b ON b.room_id = room.id
  GROUP BY room.id, building.name, lo, hi
), client_usage AS (
  SELECT u.id, COALESCE(u.business_name, 'Empresa sin nombre') AS name,
    COALESCE(SUM(b.hours) FILTER (WHERE b.cancelled_at IS NULL), 0) AS "bookedHours",
    COUNT(b.id) FILTER (WHERE b.cancelled_at IS NULL) AS reservations,
    COUNT(b.id) FILTER (WHERE b.cancelled_at IS NOT NULL) AS cancellations
  FROM auth.users u LEFT JOIN bookings b ON b.user_id = u.id
  WHERE u.role = 'user'
  GROUP BY u.id
  ORDER BY "bookedHours" DESC, u.id LIMIT 100
), last_booking AS (
  SELECT r.user_id, MAX(r.starts_at) AS last_start FROM public.reservations r CROSS JOIN bounds
  WHERE r.cancelled_at IS NULL AND r.starts_at < hi GROUP BY r.user_id
), days AS (
  SELECT day, GREATEST(day, lo) AS lo, LEAST(day + interval '1 day', hi) AS hi
  FROM bounds, generate_series(date_trunc('day', lo), hi - interval '1 microsecond', interval '1 day') day
), day_capacity AS (
  SELECT day, COALESCE(SUM(EXTRACT(EPOCH FROM d.hi - GREATEST(d.lo, room.created_at))/3600) FILTER (WHERE room.id IS NOT NULL),0) AS capacity
  FROM days d LEFT JOIN public.rooms room ON room.created_at < d.hi GROUP BY day
), day_booked AS (
  SELECT day, COALESCE(SUM(EXTRACT(EPOCH FROM LEAST(d.hi, b.end_clip) - GREATEST(d.lo, b.start_clip))/3600) FILTER (WHERE b.id IS NOT NULL),0) AS hours
  FROM days d LEFT JOIN bookings b ON b.cancelled_at IS NULL AND b.start_clip < d.hi AND b.end_clip > d.lo
  GROUP BY day
), hourly AS (
  SELECT EXTRACT(HOUR FROM slot)::integer AS hour,
    SUM(EXTRACT(EPOCH FROM LEAST(b.end_clip, slot + interval '1 hour') - GREATEST(b.start_clip, slot))/3600) AS hours
  FROM bookings b CROSS JOIN LATERAL generate_series(date_trunc('hour', b.start_clip), b.end_clip - interval '1 microsecond', interval '1 hour') slot
  WHERE b.cancelled_at IS NULL GROUP BY hour
)
SELECT
  COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."bookedHours" DESC, r.id) FROM room_usage r), '[]') AS rooms,
  COALESCE((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object('lastReservation', l.last_start) ORDER BY c."bookedHours" DESC, c.id) FROM client_usage c LEFT JOIN last_booking l ON l.user_id = c.id), '[]') AS clients,
  (SELECT count(DISTINCT user_id)::integer FROM bookings WHERE cancelled_at IS NULL) AS "clientCount",
  (SELECT jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'bookedHours', b.hours, 'capacityHours', c.capacity) ORDER BY d.day) FROM days d JOIN day_capacity c USING(day) JOIN day_booked b USING(day)) AS days,
  (SELECT jsonb_agg(jsonb_build_object('hour', hour, 'bookedHours', COALESCE(h.hours,0)) ORDER BY hour) FROM generate_series(0,23) hour LEFT JOIN hourly h USING(hour)) AS hours
`;

export function postgresMetrics(pool: Pool): MetricsStore {
  return {
    async revision() {
      return (
        await pool.query<{ revision: string }>(
          "SELECT generation::text || ':' || revision::text AS revision FROM public.metrics_revision WHERE singleton",
        )
      ).rows[0]!.revision;
    },
    async calculate(period) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query("SET LOCAL TIME ZONE 'UTC'");
        await client.query("SET LOCAL statement_timeout = '5s'");
        const revision = (
          await client.query<{ revision: string }>(
            "SELECT generation::text || ':' || revision::text AS revision FROM public.metrics_revision WHERE singleton",
          )
        ).rows[0]!.revision;
        const result = await client.query<{
          rooms: RoomTotals[];
          clients: (Totals & {
            id: string;
            name: string;
            lastReservation: string | null;
          })[];
          clientCount: number;
          days: Omit<Metrics['days'][number], 'occupancyPercent'>[];
          hours: Metrics['hours'];
        }>(query, [period.from, period.to]);
        const data = result.rows[0]!;
        const totals = { ...zero(), capacityHours: 0 };
        const buildings = new Map<
          string | null,
          typeof totals & { id: string | null; name: string }
        >();
        for (const room of data.rooms) {
          const building = buildings.get(room.buildingId) ?? {
            ...zero(),
            capacityHours: 0,
            id: room.buildingId,
            name: room.buildingName ?? 'Sin edificio asignado',
          };
          for (const key of [
            'bookedHours',
            'reservations',
            'cancellations',
            'capacityHours',
          ] as const) {
            totals[key] += room[key];
            building[key] += room[key];
          }
          buildings.set(room.buildingId, building);
        }
        const metrics: Metrics = {
          period,
          generatedAt: new Date().toISOString(),
          timezone: 'UTC',
          capacityBasis: 'registered-rooms-24h',
          rankingLimit: 100,
          summary: {
            ...occupancy(totals),
            rooms: data.rooms.length,
            clients: data.clientCount,
          },
          rooms: data.rooms.slice(0, 100).map((room) => ({
            id: room.id,
            name: room.name,
            buildingName: room.buildingName,
            ...occupancy(room),
          })),
          buildings: [...buildings.values()]
            .sort(
              (a, b) =>
                b.bookedHours - a.bookedHours ||
                (a.id ?? '').localeCompare(b.id ?? ''),
            )
            .slice(0, 100)
            .map((building) => ({
              id: building.id,
              name: building.name,
              ...occupancy(building),
            })),
          clients: data.clients.map((row) => ({ ...row, ...usage(row) })),
          days: data.days.map((day) => ({
            ...day,
            bookedHours: round(day.bookedHours),
            capacityHours: round(day.capacityHours),
            occupancyPercent: day.capacityHours
              ? round((100 * day.bookedHours) / day.capacityHours)
              : 0,
          })),
          hours: data.hours.map((hour) => ({
            ...hour,
            bookedHours: round(hour.bookedHours),
          })),
        };
        await client.query('COMMIT');
        return { revision, metrics };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
