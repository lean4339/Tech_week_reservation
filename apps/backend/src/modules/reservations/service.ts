import type {
  ReservationsStore,
  ReservationInput,
  ReservationScope,
} from './model.js';
import { page } from '../shared/pagination.js';
import {
  validatePeriod,
  reservationFilterPeriod,
  type Period,
} from '../shared/period.js';
import type { ReservationsQuery } from './schemas.js';
export function reservationsService(store: ReservationsStore) {
  return {
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
