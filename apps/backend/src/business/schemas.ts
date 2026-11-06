const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = {
  type: 'string',
  format: 'date-time',
  maxLength: 35,
  pattern:
    '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$',
} as const;
const text = (maxLength: number) => ({
  type: 'string',
  minLength: 2,
  maxLength,
  pattern: '^[^\\u0000-\\u001f\\u007f]*$',
});
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
export const idSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuid },
};
const periodProperties = { startsAt: timestamp, endsAt: timestamp };
export const periodSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['startsAt', 'endsAt'],
  properties: periodProperties,
};
export const reservationCreateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['roomId', 'startsAt', 'endsAt'],
  properties: { roomId: uuid, ...periodProperties },
};
export const adminReservationCreateSchema = {
  ...reservationCreateSchema,
  required: [...reservationCreateSchema.required, 'userId'],
  properties: { ...reservationCreateSchema.properties, userId: uuid },
};
export const emptyBodySchema = { type: 'object', additionalProperties: false };
const pagination = {
  // Queries are strings; do not enable global AJV coercion for JSON bodies.
  limit: { type: 'string', pattern: '^(?:[1-9]|[1-9][0-9]|100)$' },
  offset: { type: 'string', pattern: '^(?:0|[1-9][0-9]{0,3}|10000)$' },
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
export const availabilityQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to'],
  properties: { from: timestamp, to: timestamp },
};
export const reservationsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...availabilityQuerySchema.properties,
    ...pagination,
    roomId: uuid,
    buildingId: uuid,
    status: { type: 'string', enum: ['active', 'cancelled', 'all'] },
  },
};
export const adminReservationsQuerySchema = {
  ...reservationsQuerySchema,
  properties: { ...reservationsQuerySchema.properties, userId: uuid },
};
export interface PageQuery {
  limit?: string;
  offset?: string;
}
export interface PeriodQuery {
  from: string;
  to: string;
}
export interface ReservationsQuery extends PageQuery, Partial<PeriodQuery> {
  buildingId?: string;
  roomId?: string;
  userId?: string;
  status?: 'active' | 'cancelled' | 'all';
}

export const clientsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: { ...pagination, search: { type: 'string', maxLength: 120 } },
};

export const buildingsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: pagination,
};
