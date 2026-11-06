import { BusinessError } from './errors.js';
export interface Period {
  startsAt: string;
  endsAt: string;
}
export interface PeriodQuery {
  from: string;
  to: string;
}
export function validatePeriod(period: Period, future = false): Period {
  const start = Date.parse(period.startsAt);
  const end = Date.parse(period.endsAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    end - start > 366 * 86400000
  )
    throw new BusinessError(
      400,
      'El período debe ser válido y no superar 366 días.',
    );
  if (future && start <= Date.now())
    throw new BusinessError(400, 'La reserva debe comenzar en el futuro.');
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
  };
}
export function period(query: PeriodQuery) {
  return validatePeriod({ startsAt: query.from, endsAt: query.to });
}
export function reservationFilterPeriod(
  query: Partial<PeriodQuery>,
): Partial<Period> {
  const result: Partial<Period> = {};
  for (const [source, target] of [
    ['from', 'startsAt'],
    ['to', 'endsAt'],
  ] as const) {
    const value = query[source];
    if (value === undefined) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time))
      throw new BusinessError(400, 'Fecha de filtro inválida.');
    result[target] = new Date(time).toISOString();
  }
  if (result.startsAt && result.endsAt && result.startsAt >= result.endsAt)
    throw new BusinessError(
      400,
      'El fin del filtro debe ser posterior al inicio.',
    );
  return result;
}
