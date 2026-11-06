import type { BuildingsStore } from './buildings/model.js';
import type { ClientsStore } from './clients/model.js';
import type { RoomsStore } from './rooms/model.js';
import type { ReservationsStore } from './reservations/model.js';
export interface ProductStores {
  buildings: BuildingsStore;
  rooms: RoomsStore;
  reservations: ReservationsStore;
  clients: ClientsStore;
}
