# Pruebas / Testing

## Español

### Pruebas automáticas antes de cada commit

`npm ci` instala el hook local mediante `prepare`. En una copia ya instalada,
ejecutá `npm run hooks:install` una vez. Configura `core.hooksPath=.githooks` solo
para este repositorio y conserva los hooks en Git. Si hay hooks propios activos,
la instalación se detiene para evitar reemplazarlos silenciosamente.

Cada `git commit` ejecuta `npm run test:precommit`: auditoría de dependencias npm (incluye desarrollo), prueba del hook, TypeScript
de ambas apps, formato, suites unitarias/modulares/regresión/seguridad y diagnóstico
de timing. Cualquier error cancela el commit. Revisá y agregá todos los cambios
al índice antes de commitear: el hook rechaza archivos modificados sin agregar
y archivos nuevos no ignorados, para probar el mismo contenido que se confirma.

No requiere Docker. La auditoría requiere acceso al registro npm y un fallo de red
también cancela la validación; no se omite silenciosamente. ESLint y las pruebas de integración/E2E no forman parte de
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
`test:integration` incluye `reservations.integration.test.ts`, que comprueba las
tablas del negocio contra PostgreSQL real: claves foráneas, períodos válidos,
solapamientos, límites adyacentes, zonas horarias, cancelación, historial y dos
inserciones concurrentes con exactamente una reserva persistida. PostgreSQL puede
rechazar al competidor por exclusión (`23P01`) o deadlock (`40P01`); la API bloquea
la sala por transacción y transforma conflictos/contención en 409 sin reintentos
automáticos. El cliente puede volver a consultar disponibilidad e intentar otra vez.
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

Each `git commit` runs `npm run test:precommit`: npm dependency audit (including development), hook checks, both applications'
TypeScript checks, formatting, unit/modular/regression/security tests, and the
timing diagnostic. Any failure aborts the commit. Review and stage all changes
first: unstaged modifications and non-ignored untracked files are rejected so
tests exercise the content being committed.

Docker is not required. Auditing requires npm registry access; network errors also
fail validation and are not silently skipped. ESLint and integration/E2E tests are outside this hook;
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
`test:integration` also runs real PostgreSQL business-table tests for foreign keys,
valid intervals, overlaps, adjacent boundaries, time zones, cancellation/history,
and concurrent inserts with exactly one persisted winner. PostgreSQL can reject a
contender for exclusion (`23P01`) or deadlock (`40P01`); the future API must handle
conflicts and bounded retries for aborted transactions.
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

## CRUD y permisos del negocio / Business CRUD and permissions

`test/business.test.ts` entra por Fastify con sesiones/permisos reales y usa un
repositorio instrumentado para demostrar cero efectos al rechazar solicitudes.
Cubre cada método protegido (incluido HEAD), sesiones ausentes/inválidas/vencidas,
roles falsificados, cambios de rol, CSRF, asignación de propietario y otros campos,
fechas/límites inválidos y errores de almacenamiento sin filtración. Está incluido
en `npm test`, `test:modular`, `test:regression`, `test:security` y pre-commit.

`test/business.integration.test.ts` usa PostgreSQL y Redis reales, inicia sesiones
mediante login y verifica CRUD, aislamiento entre dos clientes, ausencia de cambios
ante IDOR, agenda con una sola consulta, rollback de reprogramaciones conflictivas,
reservas/reprogramaciones concurrentes y bloqueo de sala durante desactivación.
`tests/e2e/auth.spec.ts` agrega el recorrido HTTP Next.js → Fastify → PostgreSQL/Redis,
con contextos de sesión independientes. `tests/e2e/business.spec.ts` recorre las
pantallas reales con clics y formularios: creación/edición/desactivación/reactivación
de salas, reserva/reprogramación/cancelación, filtros del admin, creación para una
empresa, conflicto con disponibilidad desactualizada, rechazo de páginas admin,
HTML como texto, ancho móvil y redirección después de revocar la sesión.

English: `business.test.ts` exercises the real Fastify authentication/permission
boundary, including HEAD, with an observed repository to verify denied requests have
no business effects. It covers CSRF, mass assignment, invalid inputs and sanitized
storage failures and runs in the local/pre-commit suites. `business.integration.test.ts`
uses actual PostgreSQL/Redis, login sessions, two clients, ownership checks with
unchanged-row assertions, a single-query admin agenda, rollback and simultaneous
writes, including room deactivation locks. The added E2E scenario crosses the actual
Next proxy and backend with independent sessions. `business.spec.ts` drives the
actual browser forms for room and booking management, company/date/room filters,
stale availability conflicts, admin-page denial, literal HTML rendering, mobile
width and revoked-session redirects.

`npm run test:frontend` ejecuta las pruebas unitarias de fechas del frontend:
hora local argentina ↔ UTC, intervalos inválidos/pasados, rango inclusivo de días,
cambios de mes y salto horario de verano. Se incluye en `npm test` y, por esa vía,
en el hook pre-commit. English: frontend date tests cover local/UTC conversion,
invalid/past periods, inclusive calendar ranges and daylight-saving transitions;
they run through `npm test` and the pre-commit hook.

Para aislar los escenarios E2E, `tests/e2e/fixtures.ts` limpia únicamente los
contadores `tech-week:rate:*` del Redis de prueba fijo (56379, DB 15) antes de cada
escenario. El middleware y sus límites siguen activos. La suite backend prueba
rechazos por límites sin esta fixture. English: E2E scenarios start with fresh
rate counters in the fixed test Redis only; thresholds and actual middleware stay
enabled. Backend rate-limit tests run without this fixture.

### Edificios / Buildings

`buildings-migration.integration.test.ts` crea una base temporal aislada con el
esquema exacto 001–003, inserta una sala y una reserva antiguas y ejecuta el runner
de migraciones real dos veces. Comprueba conservación de datos, FK y borrado
restringido. El nombre temporal es generado por el test y termina en `_test`;
la base se elimina al terminar. El rol del contenedor de pruebas necesita permiso
para crear bases, como el rol configurado en `compose.test.yaml`.

Las suites de negocio verifican permisos de edificios (incluido HEAD), rechazo de
campos manipulados, filtros sin N+1, bloqueo de nuevas reservas al desactivar un
edificio, conservación de historial y la primera asignación de salas heredadas.
El E2E también crea/edita/desactiva/reactiva edificios desde los formularios, asigna
salas y filtra catálogo y agenda. English: migration testing upgrades an isolated
pre-building database using the actual runner and checks preservation and FK rules.
Business tests cover building authorization, validated assignments, one-query filters,
concurrent deactivation, retained history and legacy assignment. Browser tests manage
buildings and room assignments and filter the catalogue and agenda.

Fechas opcionales: integración verifica consultas sin fechas, límites independientes,
rangos amplios, paginación, JOIN único y aislamiento entre clientes. E2E verifica que
la reserva aparece en la agenda del cliente y del admin sin completar fechas, y que
“Quitar filtros” vuelve a mostrarla tras filtrar por una fecha sin resultados.
English: tests cover date-free and one-sided lists, wide ranges, pagination, ownership,
and browser default/clear-filter behavior. Booking date validation remains covered.

La simplificación del frontend agrega un escenario de reserva directa sin búsqueda
previa, con viewport móvil, errores visibles dentro del diálogo, conservación de
fechas tras un error, cierre con Escape y restauración del foco. Los recorridos
existentes verifican filtros plegados al entrar y cambio de estado sin aplicar
el formulario. La suite completa tiene 9 escenarios E2E.

English: the simplified UI adds direct booking without a prior search, mobile
layout, in-dialog errors, retained inputs, Escape dismissal and focus restoration.
Existing flows also check collapsed filters and immediate status changes.
The full E2E suite contains 9 scenarios.

## Métricas con Redis / Redis metrics

`metrics.test.ts` forma parte de `npm test`, `test:security`, `test:modular` y
`test:regression`: autentica GET/HEAD antes de efectos, exige rol admin, rechaza
identidad falsificada y fechas inválidas, y comprueba caché, generaciones y fallos.
`metrics.integration.test.ts` forma parte de `test:integration`: crea una base
PostgreSQL temporal aislada, aplica migraciones, usa Redis real y comprueba sumas,
recortes, días vacíos, cancelaciones, TTL, hits, invalidación de reservas/salas/
edificios/empresas, rollback y reconstrucción de caché borrada o corrupta.
`metrics.spec.ts` recorre el tablero real, verifica resultados tras una cancelación,
restricciones de acceso, nombres tratados como texto y presentación móvil.

English: metrics tests cover authenticated GET/HEAD boundaries, administrator-only
access, input limits, cache generations and failure paths. Integration tests use
a dedicated temporary PostgreSQL database and real Redis for calculations, clipping,
zero-use days, TTL, cache hits, transactional invalidation, rollback and recovery.
The browser test checks the dashboard, cancellation updates, access isolation,
text rendering and mobile layout. See [metrics definitions](METRICS.md).

## Ampliación de seguridad / Additional security coverage

Se agregaron 11 casos: seis en `metrics-security.test.ts`, dos criptográficos en
`security.test.ts`, dos subtests de integración y un escenario E2E de revocación.
Las suites locales y el hook pre-commit incluyen el nuevo archivo. `test:security`
lo ejecuta junto con las regresiones y las pruebas existentes.

- Sesiones inactivas, revocadas, vencidas por inactividad y errores de los stores,
  verificando ausencia de lecturas de métricas y redacción de errores.
- Parámetros duplicados, objetos de query, SQL/CRLF codificados y cabeceras de IP
  falsas: rechazo antes del cálculo o la caché.
- Ocho solicitudes concurrentes comparten un cálculo; una falla no publica datos
  y permite reintentar. Períodos y generaciones diferentes no comparten resultados.
- Redis/PostgreSQL reales: revocación de rol, desactivación, logout y replay no leen
  caché. Dos bases con igual contador y un Redis compartido mantienen separación.
- Contraseñas multibyte, NUL y Unicode; encodings manipulados no pueden cambiar
  el algoritmo, debilitar el costo ni pedir parámetros de costo desmedido.
- Navegador: payload XSS almacenado se renderiza como texto; un admin degradado
  con el tablero abierto recibe 403 al actualizar y 404 al volver a la página.

Se ejecutaron dos experimentos de mutación en copias temporales de `dist` y los
fixtures, sin modificar el código de la aplicación: quitar la comprobación de
cuenta activa produjo `200 !== 401`; quitar la generación/revisión de la clave
Redis hizo fallar la prueba de separación. Las copias se eliminaron al terminar.

English: 11 new cases cover authentication failures, query pollution, IP spoofing,
cache concurrency/recovery, namespace and period isolation, real role/account/session
revocation, multibyte/KDF tampering, stored XSS and browser permission changes.
Two isolated mutation experiments confirmed that the tests detect disabled-account
access and removal of Redis namespace separation. Application code was unchanged.

## Auditoría de dependencias / Dependency auditing

`npm run test:dependencies` audita el árbol npm completo, incluyendo desarrollo,
opcionales y peers. Falla ante vulnerabilidades de nivel low o superior o ante un
error de auditoría. `npm run test:dependencies:prod` permite consultar el alcance
de ejecución por separado. `test:security`, `test:all` y `test:precommit` ejecutan
la auditoría completa primero. No usar `npm audit fix --force` sin revisar los
cambios: puede proponer downgrades incompatibles en otros paquetes.

Controles adicionales ejecutables:

```bash
npm audit signatures
npm sbom --package-lock-only --sbom-format=cyclonedx > sbom.cdx.json
```

English: full dependency auditing includes development, optional and peer packages,
fails on low-or-higher advisories and registry errors, and runs before security,
full-suite and pre-commit checks. Production-only auditing is available separately.
Signature verification and lockfile-based CycloneDX generation are shown above.
See [dependency audit and remediation](DEPENDENCY_AUDIT.md).

## Separación de rutas y módulos / Router and module separation

Las suites existentes ejercitan la composición real de `buildApp`, con los
repositorios por dominio. `business.test.ts` cubre además el propietario derivado
de sesión en cada operación, el alcance administrativo explícito, HEAD de catálogo
y reservas, y la independencia del catálogo respecto del rechazo administrativo.
Las pruebas de integración conservan PostgreSQL y Redis reales, IDOR sin efectos,
concurrencia y conteo de consultas; los E2E conservan los contratos del frontend.

Existing suites exercise the actual application composition with separate domain
repositories. Additional checks observe session-derived ownership, explicit admin
scope, HEAD protection and sibling-router isolation. Real database integration
and browser tests verify the unchanged SQL guarantees and frontend contracts.
