import type { Page } from '../shared/pagination.js';
import type { Period } from '../shared/period.js';
export interface ReservationInput extends Period {
  roomId: string;
}
export interface Reservation {
  startsAt: Date;
  endsAt: Date;
  id: string;
  roomId: string;
  userId: string;
  roomName: string;
  buildingId: string | null;
  buildingName: string | null;
  businessName: string | null;
  createdAt: Date;
  cancelledAt: Date | null;
}
export interface ReservationFilter extends Page, Partial<Period> {
  buildingId?: string;
  roomId?: string;
  userId?: string;
  status: 'active' | 'cancelled' | 'all';
}
// This scope is constructed by server code, never from a request body/query.
export type ReservationScope = { ownerId: string } | { admin: true };
export interface ReservationsStore {
  reservations(
    filter: ReservationFilter,
    scope: ReservationScope,
  ): Promise<Reservation[]>;
  reservation(id: string, scope: ReservationScope): Promise<Reservation>;
  createReservation(
    input: ReservationInput,
    userId: string,
  ): Promise<Reservation>;
  updateReservation(
    id: string,
    period: Period,
    scope: ReservationScope,
  ): Promise<Reservation>;
  cancelReservation(id: string, scope: ReservationScope): Promise<Reservation>;
}
