export class BusinessError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export function required<T>(row: T | undefined): T {
  if (!row) throw new BusinessError(404, 'Recurso no encontrado.');
  return row;
}
