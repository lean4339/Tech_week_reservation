# Autenticación / Authentication

## Español

El frontend ofrece `/signup`, `/login`, `/dashboard` y `/admin`. El backend
valida cada permiso; ocultar enlaces en la interfaz no concede ni revoca acceso.

Cada cuenta `user` representa una empresa cliente. `auth.users.business_name`
guarda su nombre comercial, expuesto como `businessName` en login y `/auth/me`.
El registro pide un nombre de 2–120 caracteres, recorta espacios externos y rechaza
caracteres de control. No es único ni determina permisos: la identidad sigue siendo
el ID de la cuenta. Las cuentas existentes y los administradores creados por CLI
pueden tener `NULL`; la migración `002_user_business_name.sql` conserva sus datos.

### Organización y middleware

`apps/backend/src/app.ts` compone los módulos. La configuración HTTP, cabeceras,
errores, auditoría por request y healthcheck están en `http/`; las conexiones y
su ciclo de vida están en `db/`.

- `auth/middleware.ts`: `authenticate` valida sesión y usuario activo en
  `onRequest`; `requirePermission` autoriza en `preHandler`. La identidad tipada
  vive en `request.user`, sin hash de contraseña ni token.
- `http/routes.ts`: registra las rutas públicas y el grupo privado. Todas las
  rutas del grupo privado heredan autenticación; el grupo administrativo hereda
  además `admin:read`. Cada ruta declara el permiso de la operación.
- `auth/routes.ts` y `admin/routes.ts`: contratos HTTP y controles por ruta.
- `auth/controllers.ts`: transforma solicitudes y resultados en respuestas HTTP.
- `auth/service.ts`: registro, política de contraseña, login, rotación, logout
  y auditoría de autenticación; no depende de Fastify.
- `auth/stores.ts`: adaptadores PostgreSQL y Redis. `schemas.ts`, `cookies.ts`,
  `csrf.ts` y `rate-limit.ts` contienen las validaciones y controles reutilizables.

Para agregar una funcionalidad privada, registrá su módulo dentro de
`protectedRoutes` en `http/routes.ts` y declarale su permiso. No invoques la
autenticación desde el handler. Login y signup son públicos; logout admite una
sesión ausente o vencida para que sea idempotente. Todos esos POST mantienen CSRF
y límites. `/health` es público y no pertenece al grupo de autenticación.

### Base de datos y administradores

```bash
npm run db:up
npm run db:migrate
npm run admin:create
npm run dev
```

La migración `apps/backend/migrations/001_auth.sql` crea `auth.users`: UUID,
email normalizado y único, hash de contraseña, rol (`admin` o `user`), estado
activo y fecha de creación. `auth.schema_migrations` registra nombre y checksum.
Las migraciones corren en una transacción con bloqueo de concurrencia y también
se aplican automáticamente al iniciar el backend. Una migración aplicada no se
edita: se agrega otra con un número posterior.

`admin:create` pide email y contraseña por terminal, oculta la contraseña y no
modifica ni promueve cuentas existentes. El registro público siempre crea `user`;
rechaza campos como `role`, `permissions` o `id`. No hay credenciales predeterminadas.

### Contratos y permisos

| Método y ruta del backend | Acceso         | Resultado                                                                             |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `POST /auth/signup`       | Público        | Registro con `{email, password, businessName}`; 202 genérico, incluso para duplicados |
| `POST /auth/login`        | Público        | Sesión y perfil; 401 genérico ante credenciales incorrectas                           |
| `GET /auth/me`            | `profile:read` | Perfil de la sesión actual                                                            |
| `POST /auth/logout`       | Cookie actual  | Revoca la sesión y elimina la cookie; cuerpo `{}`                                     |
| `GET /admin/overview`     | `admin:read`   | Cantidad de cuentas                                                                   |
| `GET /admin/auth-events`  | `audit:read`   | Últimos 50 eventos disponibles                                                        |

`user` tiene `profile:read`; `admin` tiene los tres permisos. Los roles y el estado
activo se consultan en PostgreSQL en cada petición protegida. El navegador utiliza
el proxy de Next.js: a estas rutas les antepone `/api`.

Los POST requieren JSON, `Origin` exactamente incluido en `APP_ORIGINS` y
`X-Requested-With: tech-week-web`. No se habilita CORS. Las contraseñas aceptan
15–128 caracteres, espacios y Unicode, con un bloqueo básico de contraseñas comunes.
No se recortan ni se normalizan las contraseñas.

### Redis y sesiones

- `tech-week:session:<sha256>`: sesión de un token aleatorio de 256 bits; Redis
  conserva el digest del token como clave, nunca el token de la cookie.
- Inactividad máxima: 30 minutos. Duración absoluta máxima: 8 horas.
- Cookie `HttpOnly`, `SameSite=Lax`, sin `Domain`. En HTTPS se usa el prefijo
  `__Host-` y `Secure`. `NODE_ENV=production` exige `APP_ORIGINS` con HTTPS.
- Login reemplaza la sesión anterior de ese navegador; logout la revoca.
- `tech-week:rate:<sha256>`: contadores atómicos. Login: 10 intentos por cuenta y
  30 por IP cada 15 minutos. Registro: 10 por IP por hora. Rutas de autenticación
  y administración: 120 solicitudes por IP por minuto.
- `tech-week:audit:YYYY-MM-DD`: Redis Streams con eventos de login, registro,
  logout, límites y accesos denegados; máximo 10.000 eventos por día y TTL de 7 días.
  Se guardan evento, fecha, IP de conexión, ID de solicitud y, cuando corresponde, ID de usuario.
  No se guardan emails, contraseñas, hashes de contraseña ni cookies en estos eventos.

Si falla Redis o PostgreSQL, la API rechaza la operación; no inventa sesiones
ni concede permisos. Los errores HTTP no incluyen detalles internos del almacenamiento.
En el entorno local, Next.js comparte su IP al llamar al backend: los límites por
IP pueden compartirse entre usuarios. No se confía en cabeceras de proxy arbitrarias.

### IP y auditoría de cada request

`tech-week:requests:YYYY-MM-DD` registra cada request HTTP que procesa Fastify:
IP de socket, ID propio, fecha, método, patrón de ruta, estado y duración. Los
streams tienen un máximo de 100.000 entradas por día y expiran siete días después
del inicio UTC de ese día. Los eventos de autenticación mantienen su propio stream
con límite de 10.000, para que el tráfico HTTP no los desplace.

No se registran cuerpos, query strings ni rutas desconocidas crudas. Las cabeceras
`X-Forwarded-For` y `X-Real-IP` no se usan como identidad: la aplicación es local y
las peticiones del proxy Next.js muestran su IP local. El administrador puede leer
los últimos 50 registros con `GET /admin/request-events` y en `/admin`. Estos
registros ayudan a investigar; no constituyen un detector automático de ataques.
Si falla Redis después de enviar la respuesta HTTP, se conserva la metadata en
consola y se informa el fallo de auditoría. Los fallos al auditar el login impiden
emitir su cookie.

No se implementaron recuperación de contraseña, verificación de email, MFA,
gestión de empresas, cambios de roles desde la web ni alertas operativas. El bloqueo
de contraseñas comunes no sustituye una base completa de credenciales comprometidas.
El uso en producción requiere diseñar esos controles y la infraestructura correspondiente.

## English

The frontend provides `/signup`, `/login`, `/dashboard`, and `/admin`. The backend
enforces permissions on every protected request, independently of visible links.

### Organization and middleware

`apps/backend/src/app.ts` composes modules. `http/` owns HTTP configuration,
security headers, errors, request auditing, route composition and health checks;
`db/` owns connection setup and lifecycle.

`auth/middleware.ts` provides `authenticate` as an `onRequest` hook and
`requirePermission` as a `preHandler` hook. A typed, per-request `request.user`
contains the principal without password hashes or session tokens. `http/routes.ts`
registers public routes and a protected scope that inherits authentication; the
admin scope also inherits `admin:read`. Routes declare operation permissions.

`auth/routes.ts` and `admin/routes.ts` declare HTTP contracts. Auth controllers
translate HTTP requests/responses; `auth/service.ts` owns signup, password policy,
login, session rotation, logout and authentication auditing without depending on
Fastify. `auth/stores.ts` implements PostgreSQL/Redis adapters. Schemas, cookies,
CSRF and rate limiting are separate reusable modules.

Register future private modules inside `protectedRoutes` and declare their
permissions instead of checking authentication in handlers. Signup and login
remain public; idempotent logout accepts missing/expired sessions. Their POST
routes still enforce CSRF and rate limits. `/health` remains public in its own scope.

Start the containers, run migrations, provision an administrator interactively,
and start both applications using the four commands above. The backend also runs
migrations automatically at startup.

`001_auth.sql` creates `auth.users` with a UUID, normalized unique email, password
hash, `admin`/`user` role, active flag, and creation timestamp. `auth.schema_migrations`
tracks checksums. Migrations run transactionally with a concurrency lock. Add a new
migration instead of editing an applied one.

`admin:create` hides password input and never promotes or overwrites an existing
account. Public signup creates only `user` accounts and rejects extra fields such
as `role`, `permissions`, or `id`. There are no default administrator credentials.

### API and authorization

| Backend method and path  | Required access | Result                                                              |
| ------------------------ | --------------- | ------------------------------------------------------------------- |
| `POST /auth/signup`      | Public          | `{email, password, businessName}`; generic 202 including duplicates |
| `POST /auth/login`       | Public          | Session cookie and profile; generic 401 for invalid credentials     |
| `GET /auth/me`           | `profile:read`  | Current session profile                                             |
| `POST /auth/logout`      | Current cookie  | Revokes session and clears cookie; body `{}`                        |
| `GET /admin/overview`    | `admin:read`    | Account count                                                       |
| `GET /admin/auth-events` | `audit:read`    | Latest 50 available events                                          |

Users have `profile:read`; administrators have all three permissions. PostgreSQL
is checked for the current role and active status on each protected request.
Browser requests use the same-origin Next.js `/api` proxy.

POST requests require JSON, an exact trusted `Origin` from `APP_ORIGINS`, and
`X-Requested-With: tech-week-web`. CORS is not enabled. Passwords accept 15–128
characters, spaces and Unicode, with a basic common-password blocklist. Passwords
are neither trimmed nor normalized.

### Sessions, limits, and audit

Redis session keys use `tech-week:session:<sha256>` for random 256-bit bearer tokens.
Only the token digest is stored as the key. Sessions expire after 30 minutes of
inactivity or 8 hours absolutely. Login rotates the current browser session;
logout revokes it. Cookies are `HttpOnly`, `SameSite=Lax`, and host-only; HTTPS
uses `__Host-` and `Secure`. Production configuration requires HTTPS origins.

Atomic `tech-week:rate:<sha256>` counters allow 10 login attempts per account and
30 per IP over 15 minutes, 10 signups per IP per hour, and 120 authentication/admin
requests per IP per minute. In local proxy mode, callers may share the same backend
IP. Arbitrary forwarding headers are not trusted.

Daily `tech-week:audit:YYYY-MM-DD` streams record login, signup, logout, throttling,
and denied-access events. Each stream is capped at 10,000 entries and expires after
7 days. Records include event, time, socket IP, request ID, and an optional user ID. They never
include email, passwords, password hashes, cookies, or bearer tokens.

Storage failures deny the operation rather than bypassing authentication. HTTP
errors do not expose internal storage details. Password recovery, email verification,
MFA, company isolation, web-based role management, and operational alerting are not
implemented. The basic password blocklist is not a complete breached-password
database. Production use requires those controls and appropriate infrastructure.

### Per-request IP auditing

`tech-week:requests:YYYY-MM-DD` records each HTTP request handled by Fastify:
socket IP, generated request ID, timestamp, method, route pattern, status, and
duration. Streams are capped at 100,000 entries per day and expire seven days after
the UTC start of that day. Authentication events use separate streams capped at
10,000 entries. Bodies, query strings, and raw unmatched URLs are excluded.

Forwarded IP headers are not trusted. This local deployment records the direct
peer address, so traffic through Next.js shows the local proxy IP. Administrators
can read the latest 50 entries through `GET /admin/request-events` and `/admin`.
These records support investigation; they are not automatic attack detection.
If request logging fails after the HTTP response, metadata falls back to console.
Failure to audit login prevents issuance of the session cookie.

## References / Referencias

- [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

## Nombre de empresa y alta local / Company name and local admin creation

Public signup requires `businessName` (2–120 characters); each user account represents one client company. Migration 002 preserves legacy accounts. The local admin command explains password rules before prompting and retries invalid passwords or mismatched confirmations without exposing secrets.

El registro requiere nombre de empresa. El comando local de admin explica las reglas de contraseña antes de pedirla y permite reintentos sin exponerla.

Los permisos de negocio separan escritura administrativa y reservas propias; ver [BUSINESS_API.md](BUSINESS_API.md). Business permissions separate administrator writes from client-owned bookings.
