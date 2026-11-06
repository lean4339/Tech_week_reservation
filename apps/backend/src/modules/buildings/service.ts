import type { BuildingsStore, BuildingInput } from './model.js';
import { BusinessError } from '../shared/errors.js';
import { page, type PageQuery } from '../shared/pagination.js';
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
export function buildingsService(store: BuildingsStore) {
  return {
    buildings: (query: PageQuery, includeInactive: boolean) =>
      store.buildings(page(query), includeInactive),
    building: (id: string, includeInactive: boolean) =>
      store.building(id, includeInactive),
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
  };
}
