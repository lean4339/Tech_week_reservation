import type { Page } from '../shared/pagination.js';
import type { Period } from '../shared/period.js';
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
export interface RoomsStore {
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
}
