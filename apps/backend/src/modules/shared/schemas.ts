export const uuid = { type: 'string', format: 'uuid' } as const;
export const timestamp = {
  type: 'string',
  format: 'date-time',
  maxLength: 35,
  pattern:
    '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?(?:Z|[+-]\\d{2}:\\d{2})$',
} as const;
export const text = (maxLength: number) => ({
  type: 'string',
  minLength: 2,
  maxLength,
  pattern: '^[^\\u0000-\\u001f\\u007f]*$',
});
export const idSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: uuid },
};
export const periodProperties = { startsAt: timestamp, endsAt: timestamp };
export const periodSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['startsAt', 'endsAt'],
  properties: periodProperties,
};
export const emptyBodySchema = { type: 'object', additionalProperties: false };
export const pagination = {
  // Queries are strings; do not enable global AJV coercion for JSON bodies.
  limit: { type: 'string', pattern: '^(?:[1-9]|[1-9][0-9]|100)$' },
  offset: { type: 'string', pattern: '^(?:0|[1-9][0-9]{0,3}|10000)$' },
};
export const availabilityQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to'],
  properties: { from: timestamp, to: timestamp },
};
