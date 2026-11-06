import { text, pagination } from '../shared/schemas.js';
const buildingProperties = {
  name: text(120),
  address: text(254),
  active: { type: 'boolean' },
};
export const buildingCreateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'address'],
  properties: buildingProperties,
};
export const buildingUpdateSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: buildingProperties,
};
export const buildingsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: pagination,
};
