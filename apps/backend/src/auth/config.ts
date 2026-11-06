export interface AuthConfig {
  origins: string[];
  secureCookies: boolean;
  cookieName: string;
}
export function authConfig(): AuthConfig {
  const production = process.env.NODE_ENV === 'production';
  const value =
    process.env.APP_ORIGINS ??
    (production ? '' : 'http://127.0.0.1:3000,http://localhost:3000');
  const origins = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!origins.length) throw new Error('APP_ORIGINS is required');
  for (const origin of origins) {
    const url = new URL(origin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        (production || !local || url.protocol !== 'http:'))
    ) {
      throw new Error(
        'APP_ORIGINS must contain exact HTTPS origins (HTTP is allowed locally)',
      );
    }
  }
  const secureCookies =
    production || origins.every((o) => o.startsWith('https:'));
  return {
    origins,
    secureCookies,
    cookieName: secureCookies
      ? '__Host-tech_week_session'
      : 'tech_week_session',
  };
}
