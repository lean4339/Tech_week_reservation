import type { Page } from '../shared/pagination.js';
export interface BuildingInput {
  name: string;
  address: string;
  active: boolean;
}
export interface Building extends BuildingInput {
  id: string;
  createdAt: Date;
}
export interface BuildingsStore {
  buildings(page: Page, includeInactive: boolean): Promise<Building[]>;
  building(id: string, includeInactive: boolean): Promise<Building>;
  createBuilding(input: BuildingInput): Promise<Building>;
  updateBuilding(id: string, input: Partial<BuildingInput>): Promise<Building>;
}
