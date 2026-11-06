import type { Pool } from 'pg';
import type { ClientsStore, ClientBusiness } from './model.js';
export function postgresClients(pool: Pool): ClientsStore {
  return {
    async clients(page, search) {
      return (
        await pool.query<ClientBusiness>(
          `SELECT id, business_name AS "businessName"
        FROM auth.users WHERE role = 'user' AND active
        AND ($1 = '' OR strpos(lower(COALESCE(business_name, '')), lower($1)) > 0)
        ORDER BY business_name NULLS LAST, id LIMIT $2 OFFSET $3`,
          [search, page.limit, page.offset],
        )
      ).rows;
    },
  };
}
