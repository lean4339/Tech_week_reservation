import {
  uuid,
  periodProperties,
  pagination,
  availabilityQuerySchema,
} from '../shared/schemas.js';
import type { PageQuery } from '../shared/pagination.js';
import type { PeriodQuery } from '../shared/period.js';
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
export interface ReservationsQuery extends PageQuery, Partial<PeriodQuery> {
  buildingId?: string;
  roomId?: string;
  userId?: string;
  status?: 'active' | 'cancelled' | 'all';
}
