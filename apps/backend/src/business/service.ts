import {
  BusinessError,
  type BusinessStore,
  type BuildingInput,
  type Period,
  type ReservationInput,
  type ReservationScope,
  type RoomInput,
} from './model.js';
import type { PageQuery, PeriodQuery, ReservationsQuery } from './schemas.js';

export function validatePeriod(period: Period, future = false): Period {
  const start = Date.parse(period.startsAt);
  const end = Date.parse(period.endsAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    end - start > 366 * 86400000
  )
    throw new BusinessError(
      400,
      'El período debe ser válido y no superar 366 días.',
    );
  if (future && start <= Date.now())
    throw new BusinessError(400, 'La reserva debe comenzar en el futuro.');
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
  };
}
function page(query: PageQuery) {
  return {
    limit: Number(query.limit ?? 50),
    offset: Number(query.offset ?? 0),
  };
}
function period(query: PeriodQuery) {
  return validatePeriod({ startsAt: query.from, endsAt: query.to });
}
function reservationFilterPeriod(query: Partial<PeriodQuery>): Partial<Period> {
  const result: Partial<Period> = {};
  for (const [source, target] of [
    ['from', 'startsAt'],
    ['to', 'endsAt'],
  ] as const) {
    const value = query[source];
    if (value === undefined) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time))
      throw new BusinessError(400, 'Fecha de filtro inválida.');
    result[target] = new Date(time).toISOString();
  }
  if (result.startsAt && result.endsAt && result.startsAt >= result.endsAt)
    throw new BusinessError(
      400,
      'El fin del filtro debe ser posterior al inicio.',
    );
  return result;
}
function roomInput(input: Partial<RoomInput>): Partial<RoomInput> {
  const result = { ...input };
  for (const key of ['name', 'location'] as const) {
    const value = result[key];
    if (typeof value === 'string') {
      result[key] = value.trim();
      if ([...result[key]].length < 2)
        throw new BusinessError(
          400,
          'Nombre y ubicación deben tener al menos 2 caracteres.',
        );
    }
  }
  return result;
}
function buildingInput(input: Partial<BuildingInput>) {
  const result = { ...input };
  for (const key of ['name', 'address'] as const) {
    if (result[key] !== undefined) {
      result[key] = result[key]!.trim();
      if ([...result[key]!].length < 2)
        throw new BusinessError(
          400,
          'Nombre y dirección deben tener al menos 2 caracteres.',
        );
    }
  }
  return result;
}
export function businessService(store: BusinessStore) {
  return {
    buildings: (query: PageQuery, admin: boolean) =>
      store.buildings(page(query), admin),
    building: (id: string, admin: boolean) => store.building(id, admin),
    createBuilding: (input: BuildingInput) =>
      store.createBuilding(
        buildingInput({
          ...input,
          active: input.active ?? true,
        }) as BuildingInput,
      ),
    updateBuilding: (id: string, input: Partial<BuildingInput>) =>
      store.updateBuilding(id, buildingInput(input)),
    deactivateBuilding: (id: string) =>
      store.updateBuilding(id, { active: false }),
    rooms: (
      query: PageQuery & Partial<PeriodQuery> & { buildingId?: string },
      admin: boolean,
    ) =>
      store.rooms(
        page(query),
        admin,
        query.from && query.to
          ? period({ from: query.from, to: query.to })
          : undefined,
        query.buildingId,
      ),
    room: (id: string, admin: boolean) => store.room(id, admin),
    createRoom: (
      input: Pick<RoomInput, 'name' | 'capacity' | 'buildingId'> &
        Partial<RoomInput>,
    ) =>
      store.createRoom(
        roomInput({ location: null, active: true, ...input }) as RoomInput,
      ),
    updateRoom: (id: string, input: Partial<RoomInput>) =>
      store.updateRoom(id, roomInput(input)),
    deactivateRoom: (id: string) => store.updateRoom(id, { active: false }),
    availability: (id: string, query: PeriodQuery, admin: boolean) =>
      store.availability(id, period(query), admin),
    reservations: (query: ReservationsQuery, scope: ReservationScope) =>
      store.reservations(
        {
          ...page(query),
          ...reservationFilterPeriod(query),
          roomId: query.roomId,
          buildingId: query.buildingId,
          userId: query.userId,
          status: query.status ?? 'active',
        },
        scope,
      ),
    reservation: (id: string, scope: ReservationScope) =>
      store.reservation(id, scope),
    createReservation: (input: ReservationInput, userId: string) =>
      store.createReservation(
        { roomId: input.roomId, ...validatePeriod(input, true) },
        userId,
      ),
    updateReservation: (id: string, input: Period, scope: ReservationScope) =>
      store.updateReservation(id, validatePeriod(input, true), scope),
    cancelReservation: (id: string, scope: ReservationScope) =>
      store.cancelReservation(id, scope),
  };
}
