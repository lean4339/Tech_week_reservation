# Pruebas / Testing

## Español

### Pruebas automáticas antes de cada commit

`npm ci` instala el hook local mediante `prepare`. En una copia ya instalada,
ejecutá `npm run hooks:install` una vez. Configura `core.hooksPath=.githooks` solo
para este repositorio y conserva los hooks en Git. Si hay hooks propios activos,
la instalación se detiene para evitar reemplazarlos silenciosamente.

Cada `git commit` ejecuta `npm run test:precommit`: prueba del hook, TypeScript
de ambas apps, formato, suites unitarias/modulares/regresión/seguridad y diagnóstico
de timing. Cualquier error cancela el commit. Revisá y agregá todos los cambios
al índice antes de commitear: el hook rechaza archivos modificados sin agregar
y archivos nuevos no ignorados, para probar el mismo contenido que se confirma.

No requiere Docker. ESLint y las pruebas de integración/E2E no forman parte de
este hook; ejecutá `npm run check` y `npm run test:all` con las dependencias y los
servicios disponibles para la validación completa. Los hooks son un control local,
no una política impuesta por el servidor remoto.

`npm run test:hooks` verifica en un repositorio temporal que un fallo de pruebas
bloquee el commit, que un resultado exitoso lo permita y que los cambios fuera del
índice se rechacen. Solo sustituye el comando npm de esa fixture; el commit del
proyecto ejecuta las suites reales.

Las suites están separadas por propósito. Las pruebas modulares y de regresión
ejecutan Fastify, sus validadores, autenticación, hashing y permisos reales mediante
`inject`; reemplazan únicamente los adaptadores de almacenamiento por memoria.
No demuestran el comportamiento de PostgreSQL o Redis: eso se verifica en integración.

`test/middleware.test.ts` usa Fastify real para verificar herencia de hooks,
interrupción antes del handler, permisos y roles actuales, aislamiento entre
solicitudes concurrentes y rechazo cuando falta autenticación. Se incluye en
`npm test`, `test:modular` y `test:security`, por lo tanto también en pre-commit.
Las pruebas del servicio verifican la política de contraseña fuera de HTTP.

`test/startup.test.ts` verifica la carga real de plugins y registro de rutas
reemplazando solo el transporte Redis, conservación del error de conexión original,
diagnósticos sin secretos y cierre ante fallo sin abrir el puerto. Se incluye en
las suites local, modular y de seguridad. No demuestra conexión a servicios reales.

| Suite            | Comando                    | Cobertura                                                                                           |
| ---------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| Unitarias        | `npm run test:unit`        | Hashing, política de contraseñas, proyección pública, claves de sesión y configuración HTTPS        |
| Modulares        | `npm run test:modular`     | Registro, login, logout, cookies, duplicados y fallo de auditoría                                   |
| Regresión        | `npm run test:regression`  | CSRF, escalamiento de roles, tokens inválidos, rotación, vencimiento, límites y fallos de servicios |
| Integración real | `npm run test:integration` | Migraciones, restricciones SQL, duplicados concurrentes, Redis, TTL y roles actuales                |
| End-to-end       | `npm run test:e2e`         | Navegador → Next.js → Fastify → PostgreSQL y Redis                                                  |

Desde la raíz, `npm test` ejecuta unitarias, modulares, regresión y seguridad explícita.
No necesita Docker. `npm run test:security` ejecuta la suite de seguridad y regresión.
`npm run test:timing` ejecuta el diagnóstico de diferencias de tiempo con scrypt real;
no demuestra ausencia de canales laterales. Estos casos incluyen IP falsificada,
filtración en logs, criptografía, contaminación de prototipos y abuso de recursos.

Para las suites con servicios reales:

```bash
npm ci
npx playwright install chromium
npm run test:services:up
npm run test:integration
npm run test:e2e
npm run test:services:down
```

Los servicios de prueba son independientes: PostgreSQL en 55432 con base
`tech_week_test` y Redis en 56379, DB 15. Los datos de esos contenedores son
temporales. `test:integration` rechaza una base cuyo nombre no termine en `_test`
o un Redis que no use DB 15. No utiliza la base de desarrollo.

Playwright inicia sus propias apps en 3100/3101 y no reutiliza servidores existentes.
Next.js usa `.next-e2e` para no compartir el directorio de compilación normal.
Cada escenario tiene un contexto de navegador aislado. Las cuentas son sintéticas;
la cuenta admin se crea directamente como fixture en la base de prueba, nunca mediante
una ruta pública. Las cuentas se eliminan al terminar.

Las trazas, videos y capturas automáticas están deshabilitadas para no almacenar
credenciales de prueba en artefactos. El reporte HTML se guarda en `playwright-report/`.
Para listar casos sin ejecutarlos: `npm run test:e2e -- --list`.

Después de iniciar los servicios de prueba, `npm run test:all` ejecuta todas las suites.
La revisión de resultados y sus limitaciones se registra en [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## English

### Automatic tests before every commit

`npm ci` installs the local hook through `prepare`. For an existing installation,
run `npm run hooks:install` once. It sets `core.hooksPath=.githooks` for this
repository only; the hooks are tracked in Git. Installation stops if custom hooks
are already active, rather than silently replacing them.

Each `git commit` runs `npm run test:precommit`: hook checks, both applications'
TypeScript checks, formatting, unit/modular/regression/security tests, and the
timing diagnostic. Any failure aborts the commit. Review and stage all changes
first: unstaged modifications and non-ignored untracked files are rejected so
tests exercise the content being committed.

Docker is not required. ESLint and integration/E2E tests are outside this hook;
run `npm run check` and `npm run test:all` with dependencies and test services
available for full validation. Local hooks are not a remote enforcement policy.

`npm run test:hooks` uses a temporary repository to verify that failed tests block
a commit, passing tests allow it, and unstaged/untracked changes are rejected.
Only that fixture substitutes npm; real project commits execute the actual suites.

Suites are separated by purpose. Modular and regression tests exercise real Fastify
validation, authentication, hashing, and authorization through HTTP injection, using
in-memory storage adapters. Real PostgreSQL and Redis behavior belongs to integration
tests rather than being inferred from those adapters.

`test/middleware.test.ts` exercises real Fastify hook inheritance, rejection
before handlers, current roles and permissions, concurrent request isolation,
and denial when authentication is missing. It runs in `npm test`, `test:modular`
and `test:security`, including pre-commit. Service tests also enforce the password
policy independently of HTTP.

`test/startup.test.ts` checks actual plugin loading and route registration with
only the Redis transport replaced, original connection-error preservation,
redacted diagnostics, and cleanup without listening after a failure. It runs in
the local, modular and security suites; it does not verify real service connectivity.

| Suite       | Command                    | Coverage                                                                                   |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| Unit        | `npm run test:unit`        | Hashing, password policy, public profile, session keys, HTTPS configuration                |
| Modular     | `npm run test:modular`     | Signup, login, logout, cookies, duplicates, audit failures                                 |
| Regression  | `npm run test:regression`  | CSRF, privilege escalation, invalid tokens, rotation, expiration, limits, service failures |
| Integration | `npm run test:integration` | Migrations, SQL constraints, concurrent duplicates, Redis, TTLs, current roles             |
| End-to-end  | `npm run test:e2e`         | Browser → Next.js → Fastify → PostgreSQL and Redis                                         |

`npm test` runs unit, modular, regression, and explicit security suites without Docker.
`npm run test:security` selects security and regression tests. `npm run test:timing`
runs a real-scrypt timing diagnostic; it does not prove absence of side channels.
Security cases include forged IPs, log disclosure, cryptography, prototype pollution,
and resource abuse. Use the command
sequence above to install Chromium, start isolated test services, run integration
and E2E tests, and stop the services afterward.

Test PostgreSQL uses port 55432 and database `tech_week_test`; test Redis uses port
56379 and DB 15. These containers use temporary data. Integration tests reject a
database name that does not end in `_test` or a Redis URL outside DB 15.

Playwright starts dedicated application servers on ports 3100/3101, never reuses
existing servers, and gives each test an isolated browser context. Next.js writes
to `.next-e2e`. Test accounts are synthetic and removed afterward. The administrator
is provisioned directly in the test database, never through a public route.

Traces, videos, and automatic screenshots are disabled to avoid storing test
credentials in artifacts. HTML reports are written to `playwright-report/`.
`npm run test:e2e -- --list` lists scenarios without executing them.

Once test services are running, `npm run test:all` runs every suite. See
[SECURITY_REVIEW.md](SECURITY_REVIEW.md) for observed results and limitations.

La suite incorpora validación del nombre de empresa, persistencia sin inyección SQL, privacidad de credenciales y reintentos del comando de admin. English: tests cover company-name validation/persistence, credential privacy and local administrator password retries.
