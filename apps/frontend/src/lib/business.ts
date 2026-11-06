export interface Building {
  id: string;
  name: string;
  address: string;
  active: boolean;
}
export interface Room {
  buildingId: string | null;
  buildingName: string | null;
  buildingAddress: string | null;
  buildingActive: boolean | null;
  id: string;
  name: string;
  location: string | null;
  capacity: number;
  active: boolean;
  available?: boolean | null;
}
export interface ClientBusiness {
  id: string;
  businessName: string | null;
}
export interface Reservation {
  buildingId: string | null;
  buildingName: string | null;
  id: string;
  roomId: string;
  userId: string;
  roomName: string;
  businessName: string | null;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
}

export class SessionExpiredError extends Error {}

export async function businessRequest<T>(
  path: string,
  options: { method?: string; body?: object; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'tech-week-web',
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
  });
  if (response.status === 401) {
    throw new SessionExpiredError(
      'Tu sesión venció. Iniciá sesión nuevamente.',
    );
  }
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body.message === 'string'
        ? body.message
        : 'No se pudo completar la solicitud.',
    );
  return body as T;
}
export function errorMessage(error: unknown) {
  return error instanceof Error && error.name === 'Error'
    ? error.message
    : 'No pudimos confirmar la operación. Actualizá los datos antes de volver a intentar.';
}
export function inputDate(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export function reservationPeriod(data: FormData) {
  const from = String(data.get('startsAt')),
    to = String(data.get('endsAt'));
  const start = new Date(from),
    end = new Date(to);
  if (
    !from ||
    !to ||
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    +start >= +end
  )
    throw new Error('El fin debe ser posterior al inicio.');
  if (+end - +start > 366 * 86400000)
    throw new Error('El período no puede superar 366 días.');
  if (+start <= Date.now())
    throw new Error('Elegí una fecha y hora de inicio futura.');
  // Reject a nonexistent local time (for example a daylight-saving clock jump).
  if (
    inputDate(start.toISOString()) !== from ||
    inputDate(end.toISOString()) !== to
  )
    throw new Error('Ese horario no existe en tu zona horaria. Elegí otro.');
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}
export function dateRange(from: string, to: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (from) {
    const start = new Date(`${from}T00:00:00`);
    if (!Number.isFinite(+start)) throw new Error('Fecha de inicio inválida.');
    result.from = start.toISOString();
  }
  if (to) {
    const end = new Date(`${to}T00:00:00`);
    if (!Number.isFinite(+end)) throw new Error('Fecha de fin inválida.');
    end.setDate(end.getDate() + 1);
    result.to = end.toISOString();
  }
  if (result.from && result.to && result.from >= result.to)
    throw new Error(
      'La fecha hasta debe ser igual o posterior a la fecha desde.',
    );
  return result;
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(value));
}
