import type { Page } from '../shared/pagination.js';
export interface ClientBusiness {
  id: string;
  businessName: string | null;
}
export interface ClientsStore {
  clients(page: Page, search: string): Promise<ClientBusiness[]>;
}
