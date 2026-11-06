import type { Pool } from 'pg';
import type { ProductStores } from '../modules/stores.js';
import { postgresBuildings } from '../modules/buildings/store.js';
import { postgresClients } from '../modules/clients/store.js';
import { postgresRooms } from '../modules/rooms/store.js';
import { postgresReservations } from '../modules/reservations/store.js';
export function postgresProduct(pool: Pool): ProductStores {
  return {
    buildings: postgresBuildings(pool),
    clients: postgresClients(pool),
    rooms: postgresRooms(pool),
    reservations: postgresReservations(pool),
  };
}
