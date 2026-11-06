import type { RoomsStore, RoomInput } from './model.js';
import { BusinessError } from '../shared/errors.js';
import { page, type PageQuery } from '../shared/pagination.js';
import { period, type PeriodQuery } from '../shared/period.js';
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
export function roomsService(store: RoomsStore) {
  return {
    rooms: (
      query: PageQuery & Partial<PeriodQuery> & { buildingId?: string },
      includeInactive: boolean,
    ) =>
      store.rooms(
        page(query),
        includeInactive,
        query.from && query.to
          ? period({ from: query.from, to: query.to })
          : undefined,
        query.buildingId,
      ),
    room: (id: string, includeInactive: boolean) =>
      store.room(id, includeInactive),
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
    availability: (id: string, query: PeriodQuery, includeInactive: boolean) =>
      store.availability(id, period(query), includeInactive),
  };
}
