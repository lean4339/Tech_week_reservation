import { uuid, text, pagination, timestamp } from '../shared/schemas.js';
const roomProperties = {
  buildingId: uuid,
  name: text(120),
  location: { anyOf: [text(254), { type: 'null' }] },
  capacity: { type: 'integer', minimum: 1, maximum: 100000 },
  active: { type: 'boolean' },
};
export const roomCreateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'capacity', 'buildingId'],
  properties: roomProperties,
};
export const roomUpdateSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: roomProperties,
};
export const roomsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...pagination,
    from: timestamp,
    to: timestamp,
    buildingId: uuid,
  },
  dependencies: { from: ['to'], to: ['from'] },
};
