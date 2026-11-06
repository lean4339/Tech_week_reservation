import { pagination } from '../shared/schemas.js';
export const clientsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: { ...pagination, search: { type: 'string', maxLength: 120 } },
};
