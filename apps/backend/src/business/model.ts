export class BusinessError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export interface BuildingInput {
  name: string;
  address: string;
  active: boolean;
}
export interface Building extends BuildingInput {
  id: string;
  createdAt: Date;
}
export interface RoomInput {
  buildingId: string;
  name: string;
  location: string | null;
  capacity: number;
  active: boolean;
}
export interface Room extends Omit<RoomInput, 'buildingId'> {
  buildingId: string | null;
  buildingName: string | null;
  buildingAddress: string | null;
  buildingActive: boolean | null;
  id: string;
  createdAt: Date;
  available?: boolean | null;
}
export interface Period {
  startsAt: string;
  endsAt: string;
}
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
export interface Page {
  limit: number;
  offset: number;
}
export interface ReservationFilter extends Page, Partial<Period> {
  buildingId?: string;
  roomId?: string;
  userId?: string;
  status: 'active' | 'cancelled' | 'all';
}
// This scope is constructed by server code, never from a request body/query.
export type ReservationScope = { ownerId: string } | { admin: true };
export interface ClientBusiness {
  id: string;
  businessName: string | null;
}
export interface BusinessStore {
  buildings(page: Page, includeInactive: boolean): Promise<Building[]>;
  building(id: string, includeInactive: boolean): Promise<Building>;
  createBuilding(input: BuildingInput): Promise<Building>;
  updateBuilding(id: string, input: Partial<BuildingInput>): Promise<Building>;
  clients(page: Page, search: string): Promise<ClientBusiness[]>;
  rooms(
    page: Page,
    includeInactive: boolean,
    period?: Period,
    buildingId?: string,
  ): Promise<Room[]>;
  room(id: string, includeInactive: boolean): Promise<Room>;
  createRoom(input: RoomInput): Promise<Room>;
  updateRoom(id: string, input: Partial<RoomInput>): Promise<Room>;
  availability(
    id: string,
    period: Period,
    includeInactive: boolean,
  ): Promise<boolean>;
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
