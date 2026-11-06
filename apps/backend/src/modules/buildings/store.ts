import type { Pool, PoolClient } from 'pg';
import type { BuildingsStore, Building } from './model.js';
import { BusinessError, required } from '../shared/errors.js';
import { transaction } from '../../db/transaction.js';
const buildingFields = 'id, name, address, active, created_at AS "createdAt"';
export async function lockBuilding(client: PoolClient, id: string | null) {
  if (!id)
    throw new BusinessError(
      409,
      'La sala todavía no tiene un edificio asignado.',
    );
  const { rows } = await client.query<{ active: boolean }>(
    'SELECT active FROM public.buildings WHERE id = $1 FOR SHARE',
    [id],
  );
  if (!required(rows[0]).active)
    throw new BusinessError(409, 'El edificio está desactivado.');
}
export function postgresBuildings(pool: Pool): BuildingsStore {
  return {
    async buildings(page, includeInactive) {
      return (
        await pool.query<Building>(
          `SELECT ${buildingFields} FROM public.buildings WHERE (active OR $1::boolean) ORDER BY name, id LIMIT $2 OFFSET $3`,
          [includeInactive, page.limit, page.offset],
        )
      ).rows;
    },
    async building(id, includeInactive) {
      return required(
        (
          await pool.query<Building>(
            `SELECT ${buildingFields} FROM public.buildings WHERE id = $1 AND (active OR $2::boolean)`,
            [id, includeInactive],
          )
        ).rows[0],
      );
    },
    async createBuilding(input) {
      return required(
        (
          await pool.query<Building>(
            `INSERT INTO public.buildings (name, address, active) VALUES ($1,$2,$3) RETURNING ${buildingFields}`,
            [input.name, input.address, input.active],
          )
        ).rows[0],
      );
    },
    async updateBuilding(id, input) {
      return transaction(pool, async (client) =>
        required(
          (
            await client.query<Building>(
              `UPDATE public.buildings SET name = COALESCE($2, name), address = COALESCE($3, address), active = COALESCE($4::boolean, active) WHERE id = $1 RETURNING ${buildingFields}`,
              [
                id,
                input.name ?? null,
                input.address ?? null,
                input.active ?? null,
              ],
            )
          ).rows[0],
        ),
      );
    },
  };
}
