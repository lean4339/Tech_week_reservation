import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';

export interface CurrentUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  permissions: string[];
}
export async function backendGet(
  path:
    | '/auth/me'
    | '/admin/overview'
    | '/admin/auth-events'
    | '/admin/request-events',
) {
  const jar = await cookies();
  const cookie = ['tech_week_session', '__Host-tech_week_session']
    .map((name) => jar.get(name))
    .filter((item) => item !== undefined)
    .map((item) => `${item.name}=${item.value}`)
    .join('; ');
  const response = await fetch(
    `${process.env.BACKEND_URL ?? 'http://127.0.0.1:3001'}${path}`,
    {
      headers: { cookie },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    },
  );
  if (response.status === 401) redirect('/login');
  if (response.status === 403) notFound();
  if (!response.ok)
    throw new Error('No se pudo contactar al servicio de autenticación.');
  return response;
}
export async function requireUser(
  permission = 'profile:read',
): Promise<CurrentUser> {
  const { user } = (await (await backendGet('/auth/me')).json()) as {
    user: CurrentUser;
  };
  if (!user.permissions.includes(permission)) notFound();
  return user;
}
