# Revisión de seguridad / Security review

## Auditoría de dependencias — estado actualizado 2026-11-06

La revisión anterior de A03 estaba incompleta. Se ejecutó la auditoría npm completa:
8 entradas moderadas derivadas de un aviso de minimatch 10.2.6; corregido con
11.0.1 mediante override específico y lockfile actualizado. Auditorías completa y
de ejecución ahora sin hallazgos; firmas, atestaciones e instalación limpia verificadas.
La auditoría queda incorporada en `test:security`, `test:all` y `test:precommit`.

**Pendiente explícito:** ESLint 9 fuera de soporte, con plugins Next que todavía
no declaran compatibilidad con ESLint 10. No se oculta por el resultado de npm audit.
El alcance no incluye un escaneo de imágenes Docker ni del sistema operativo.
[Hallazgos, evidencia, fuentes y límites](DEPENDENCY_AUDIT.md).

English: A03 was previously incomplete. The minimatch advisory is fixed; full and
production npm audits, registry signatures and clean installation were verified.
An ESLint 9 end-of-life compatibility issue remains explicitly open. Details and
scope limits are recorded in DEPENDENCY_AUDIT.md.

## Separación de administración, cliente y dominios — 2026-11-06

Revisión del commit `38cb675fff72a56c19996426a4a74d9d52e6964b` frente a su
primer padre `1d6df6b65c7c3409c069fede0621256da71f0507`, incluyendo el registro
real de rutas y sus controles. OWASP Top 10 2025 estable, fuentes de esta misma
sesión. Sustituye los recorridos de archivos históricos
que mencionan `business/`, `admin/routes.ts` o `metrics/routes.ts` más abajo.

Frontera actual: `app.ts → http/routes.ts → authenticate (onRequest) → routers
hermanos admin/client/catalog → permiso por operación → servicio del dominio →
repositorio SQL`. Todas las rutas administrativas heredan además `admin:read`
en `onRequest`, incluyendo escrituras en URLs heredadas `/rooms` y `/buildings`.
Métricas mantiene autorización antes de leer Redis o PostgreSQL.

A01/A07: rutas cliente y admin explícitas; identidad propia tomada de sesión y
alcance SQL construido por el servidor. A02/A06: encapsulación Fastify, catálogo
solo de lectura y dependencias por dominio. A05/A08/A10: esquemas estrictos, SQL
parametrizado, restricciones y transacciones preservadas con el mismo PoolClient.
A04/A09: criptografía y auditoría conservadas; no se modifican sus mecanismos.
A03: sin cambio de dependencias; sigue pendiente el soporte de ESLint documentado.

Validación de esta refactorización: `npm test` (63 backend + 4 frontend),
`npm run test:integration` (24), `npm run test:e2e` (11), `npm run test:timing`
(1), `npm run check` y `npm run build`: aprobados. Auditoría npm completa: cero
hallazgos. La comparación del AST confirmó las mismas 26 sentencias SQL y de
transacción al dividir los repositorios. Sin vulnerabilidades nuevas comprobadas
en el alcance revisado; no se afirma cobertura exhaustiva. No se repitieron las
mutaciones de pruebas históricas ni se escanearon imágenes Docker/SO.

English: explicit admin/client adapters replace role-switching route registration.
All private routes inherit authentication; administrative routes additionally
inherit an admin guard. Domain repositories preserve owner predicates and atomic
transactions. No dependency, cryptography or logging mechanism was changed.
See [architecture and route policies](ARCHITECTURE.md).

## Alcance y metodología

- Proyecto: `Tech_week_reservation`.
- Modalidad: desarrollo acompañado y revisión del árbol de trabajo, incluyendo archivos nuevos.
- Base de esta revisión previa al commit: `e95e97685885a14a417963dc6e2cc5cc705a293a`.
- Skill aplicada: `security-review`, ubicada localmente en
  `/home/leandro/Escritorio/Security_review_skill/security-review/SKILL.md`.
- Marco: **OWASP Top 10:2025**, edición publicada, vigencia comprobada el **2026-11-06**
  en el [proyecto oficial](https://owasp.org/projects/top-ten).
- Se revisaron entradas HTTP, SQL, cookies, permisos, sesiones, frontend, logs,
  migraciones, configuración, dependencias y errores. Se agregaron pruebas negativas
  y un experimento de mutación aislado. La skill queda activa en esta sesión;
  no se instaló un observador. Por pedido explícito del usuario se agregó un hook
  local pre-commit que ejecuta pruebas; no invoca automáticamente esta skill.

## Ejecución de seguridad solicitada — 2026-11-06

Ejecutada sobre el árbol de trabajo actual, incluidos los cambios sin commit:

- `npm run test:security`: 36 aprobadas, 0 fallidas, 0 omitidas.
- `npm run test:timing`: 1 aprobada. Medianas: usuario inexistente 259,73 ms;
  contraseña incorrecta al inicio 254,43 ms; al final 257,40 ms; cuenta inactiva
  254,71 ms. Relación máxima/mínima: 1,0208; 7 muestras por caso tras calentamiento.
- `npm run test:integration`: 21 aprobadas, 0 fallidas, 0 omitidas, con PostgreSQL
  y Redis aislados en los puertos 55432 y 56379.

Cobertura ejecutada: autenticación previa a efectos, roles y propiedad/IDOR,
CSRF, asignación masiva, entradas manipuladas, cookies y revocación, límites de
requests, IP real y logs, fallos de almacenamiento, parámetros y alteración de
scrypt, expiración de sesiones, restricciones SQL, rollback y concurrencia.
El diagnóstico de timing usa HTTP en proceso y almacenamiento en memoria con
scrypt real; no demuestra tiempo constante ni ausencia de canales laterales.
No se realizó una auditoría completa de dependencias ni un pentest externo en
esta ejecución. Los E2E de navegador no se repitieron en esta tanda.

English: the current working tree passed 36 security tests, 1 timing diagnostic
and 21 real PostgreSQL/Redis integration tests, with no failures or skips.
The timing median ratio was 1.0208 across four invalid-login paths (7 measured
samples each). This is a regression diagnostic, not proof of constant-time
execution or absence of side channels. Dependency auditing, external penetration
testing and browser E2E were not performed in this run.

## Incidencias encontradas y corregidas durante la implementación

### Ampliación de pruebas de seguridad — 2026-11-06

Se agregaron **11 casos** (8 locales, 2 subtests de integración y 1 E2E) y se
reforzó el payload XSS del navegador. El código funcional no se modificó.

Resultados ejecutados sobre el árbol de trabajo:

- `npm run test:security`: **47 aprobadas**, sin fallos ni omitidas.
- `npm run test:integration`: **24 aprobadas**, con PostgreSQL/Redis de prueba.
- `npm run test:e2e`: **11 escenarios aprobados** por navegador/proxy real.
- `npm run test:timing`: **1 aprobada**. Medianas: inexistente 258,41 ms,
  contraseña errónea al inicio 256,74 ms, al final 259,89 ms, cuenta inactiva
  256,85 ms. Relación máxima/mínima 1,0123, con siete muestras por caso.
- ESLint, TypeScript y formato aprobados.

A01/A07: revocación del rol con el tablero abierto, desactivación de cuenta,
logout y replay impiden leer la caché; las aserciones verifican ausencia de efectos.
A04/A10: límites antes del cálculo, concurrencia compartida, recuperación tras
rechazo sin publicar caché y fallos de almacenamiento sin exposición de detalles.
A05: query pollution, SQL/CRLF codificados y XSS almacenado; nombres son texto y
el payload `onerror` no se ejecuta. A08: dos bases reales con igual contador y Redis
compartido no cruzan métricas, y un período incorrecto en caché se descarta.
A04/A07: Unicode y NUL no truncan contraseñas; alterar algoritmo/costo/encoding
se rechaza sin ocupar la capacidad de hashing.

Dos mutaciones controladas en directorios temporales confirmaron la sensibilidad
de las pruebas: retirar `user.active` permitió 200 donde se esperaba 401; retirar
la generación/revisión de la clave produjo colisión detectada por el test. Ambas
corridas fallaron por la aserción esperada, no por problemas de infraestructura.
Las copias se eliminaron; no se debilitó la aplicación ni se alteraron datos reales.

El timing sigue siendo un diagnóstico en proceso con scrypt real y almacenamiento
en memoria, no una prueba de tiempo constante. No se realizó un pentest externo,
fuzzing exhaustivo, auditoría de dependencias ni prueba de carga masiva. No se
identificaron fallos en los escenarios ejecutados; esto no certifica ausencia de
otras vulnerabilidades.

English: 11 new cases and stronger stored-XSS assertions passed. Executed suites:
47 security, 24 integration, 11 browser E2E and 1 timing diagnostic (median ratio
1.0123), plus lint, TypeScript and formatting. Real role/account/session revocation,
cache separation across databases, parameter pollution, failure/concurrency recovery
and KDF/Unicode checks were covered. Two isolated mutations were detected by the
expected assertions. Application code was unchanged; no claim of exhaustive
security or constant-time behavior is made.

### Actualización: métricas PostgreSQL con caché Redis

GET/HEAD `/admin/metrics` se monta en `protectedRoutes`: `auth.authenticate`
se ejecuta antes de validación y de los efectos; `requirePermission('admin:read')`
se ejecuta antes del servicio. El control no se omite en cache hits. La página
`/admin/metrics` también exige `admin:read`. Se revisó el recorrido
`app.ts → db/plugins.ts → http/routes.ts → metrics/routes.ts → cache.ts/store.ts`.
No hay escrituras públicas de métricas ni acceso del navegador a Redis.

A01/A07 (OWASP 2025): pruebas reales de middleware para GET y HEAD anónimos,
cookies falsas/vencidas, usuario común y rol cambiado; rechazo antes de lecturas
de métricas. Integración y navegador comprueban denegación aun con caché caliente.
A05: fechas parametrizadas, esquema cerrado, rango máximo de 366 días, nombres
renderizados como texto. El reporte no contiene emails, hashes ni sesiones.
A06/A10: snapshot consistente, revisión transaccional, rollback sin invalidación,
namespace por base, TTL de 60 segundos y reconstrucción ante caché perdida/corrupta.
Las fallas de autenticación y PostgreSQL siguen cerrando el acceso. A04: límite de
período, rankings de 100, timeout SQL de 5 segundos y cálculo compartido en proceso;
no se certifica capacidad bajo carga ni se descarta contención en el contador.

Migraciones 006/007 aplicadas en local. La 007 agrega la generación sin modificar
la 006 ya aplicada por el servidor de desarrollo. Se probaron también desde bases
vacías y actualizaciones del esquema anterior. No se modificaron checksums guardados.

Evidencia de esta tanda: **53 backend + 4 frontend locales, 22 integración y
10 E2E aprobados**, además de lint, TypeScript y build de producción. La integración
verifica horas recortadas, cancelaciones, días sin uso, TTL/hits, invalidación tras
cambios de reservas/salas/edificios/empresas y rollback. El E2E verifica actualización
tras cancelar, permisos, renderizado literal y viewport móvil. La prueba de timing
no se repitió en esta tanda; su resultado anterior está documentado arriba.

English: administrator metrics authenticate and authorize both GET/HEAD before
cache or database access. Parameterized bounded queries, transactional snapshot
revisions and per-database cache namespaces prevent cross-role access and stale
cache publication. Redis report loss is recoverable; authentication and PostgreSQL
failures remain closed. Migrations 006/007 preserve applied checksums. Validation:
53 backend and 4 frontend local tests, 22 integration tests and 10 E2E scenarios
passed, plus lint, TypeScript and production build. Large-scale load and a fresh
timing run are outside this change. See [definitions and limits](METRICS.md).

### Actualización: reserva directa y formularios en diálogos

El catálogo permite reservar sin una consulta previa de disponibilidad; el POST
existente sigue validando sesión, permiso, propietario, fechas y solapamientos en
el servidor. No se agregaron endpoints ni se modificó el backend en este cambio.
Los diálogos muestran los errores dentro del formulario y conservan los campos
para corregirlos. Las acciones quedan bloqueadas mientras se guarda.

Validación de este cambio: 9 E2E aprobados sobre PostgreSQL/Redis reales de prueba,
4 unitarias de frontend, lint, TypeScript y compilación Next de producción.
Los E2E incluyen conflicto por disponibilidad obsoleta, controles de roles/CSRF,
logout y reserva directa desde móvil con validación y restauración del foco.

English: direct booking uses the existing authenticated and authorized POST;
server-side ownership, date and overlap checks remain authoritative. No new
endpoints or backend changes. Nine E2E scenarios, four frontend unit tests,
lint, TypeScript and the Next production build passed for this UI change.

### Actualización: fechas opcionales en las agendas

GET `/reservations` y `/admin/reservations` ya no requieren fechas. `from` y `to`
son independientes; si están ambos se verifica el orden, sin exigir amplitud máxima
al consultar. Crear/reprogramar reservas y consultar disponibilidad conservan sus
fechas obligatorias y reglas. El frontend abre con fechas vacías, permite quitar
filtros y no impone un rango después de guardar. Se conserva el estado vigente por
defecto, con filtro explícito para canceladas/todas.

Revisión A01/A05/A06: los predicados de propietario y filtros por empresa/sala/edificio
siguen aplicándose en el mismo JOIN parametrizado, independientemente de las fechas.
Se mantienen autorización por operación, limit 1–100 y offset 0–10000. La migración
005 agrega `(starts_at, id)` para paginación cronológica sin filtro temporal. No
introduce cambios en tablas de identidad, permisos, cookies o escrituras de reservas.

Se aprobaron 50 pruebas backend, 4 de frontend, 21 de integración y 8 E2E.
La regresión verifica períodos de 2001 a 2040, consulta sin fechas y con un solo
límite, paginación, filtro administrativo por empresa y aislamiento entre clientes.
El navegador encuentra las reservas al abrir cada agenda sin completar fechas y
restaura la lista con “Quitar filtros”. El índice se verifica en la prueba de
migraciones. Estos resultados no sustituyen una prueba de carga con datos masivos.

English: reservation agendas now support omitted or independent date bounds.
Ownership predicates, per-operation permissions, parameterized JOINs and pagination
remain enforced. Mutation/availability date rules remain unchanged. Migration 005
indexes chronological pagination. 50 backend, 4 frontend, 21 integration and 8 E2E
tests passed, including date-free/open-ended reads, ownership and browser reset behavior.

### Actualización: edificios, migración y asignación de salas

Se agregó `004_buildings.sql` sin editar migraciones anteriores. Crea edificios
con nombre/dirección validados y estado; agrega FK nullable e índice en salas.
La nulabilidad conserva las salas heredadas hasta una asignación explícita del
admin: no se crean edificios ficticios ni se eliminan salas/reservas. Las altas
por API exigen edificio activo. Las reservas siguen referenciando solo la sala.

Frontera verificada: `http/routes.ts` monta `businessRoutes` dentro del grupo con
`authenticate` en `onRequest`; este registra `buildingRoutes`. GET/HEAD `/buildings`
y `/buildings/:id` requieren `buildings:read`; POST `/buildings` y PATCH/DELETE
`/buildings/:id` requieren `buildings:write` (solo admin) antes del handler/repositorio.
`/admin/buildings` además exige ese permiso en el servidor Next. Las pruebas de
frontera incluyen todos esos métodos con sesiones ausentes, inválidas y vencidas,
y operaciones sin permiso, verificando cero efectos de repositorio.

- A01/A05/A07: esquemas estrictos, asignación por UUID validado, consultas
  parametrizadas y rol actual. Los clientes solo consultan edificios activos y
  salas con edificio activo; pueden consultar y cancelar su historial aun si
  el edificio fue desactivado. JSON no admite roles, propietarios ni campos extra.
- A06/A08: JOINs agregan edificio sin N+1. Crear/reprogramar bloquea la sala y
  toma `FOR SHARE` sobre el edificio dentro de la misma transacción. Desactivar
  el edificio espera esas operaciones; una reserva que espera una desactivación
  comprueba el nuevo estado antes de persistir. Un test observa el bloqueo real.
  Cambiar de edificio una sala asignada con reservas devuelve 409 para conservar
  su asociación histórica; la primera asignación de una sala heredada sí se admite.
- A09/A10: se conservan CSRF, rate limiting y logs existentes; las excepciones
  internas no se serializan. Las bajas son lógicas y no borran reservas vigentes.
  Esta ampliación no cambia criptografía ni dependencias (A02/A03/A04 sin nueva
  auditoría integral). Sigue vigente el alcance y las limitaciones anteriores.

Evidencia: suite local previa de 49 backend + 4 frontend y la nueva prueba de
entradas de edificios, ejecutada con la suite de negocio (7/7), para **54 casos
locales únicos**; **20 pruebas de integración** (incluidos grupos padre) y
**8 escenarios E2E** aprobados. La prueba de migración crea una base temporal
con las migraciones exactas 001–003, inserta sala/reserva y usa el runner real
para aplicar 004 dos veces. Comprueba historial intacto, ausencia de asignaciones
inventadas, FK y restricción de borrado; al terminar elimina esa base temporal.
El E2E comprueba edificios y asignación desde formularios, filtros de edificio,
HTML literal, rechazo de la página admin y reactivación visible al cliente.

Se aplicó `004_buildings.sql` a la base local y se verificaron la tabla y el registro
de migración. ESLint, TypeScript, formato y build de producción de Next pasan.

El escenario anterior de navegador se dividió en dos flujos independientes de
negocio para no consumir más de 120 requests dentro de un único escenario.
Se mantiene la fixture de contadores frescos entre escenarios, sin modificar
el límite real ni reiniciarlo dentro de un flujo en ejecución.

English: migration 004 adds buildings and an indexed room FK while preserving
legacy rooms/bookings without invented assignments. New rooms require an active
building; unassigned legacy rooms remain administratively visible and cannot accept
new bookings until assigned. Building routes inherit authentication and explicit
read/admin-write permissions; Next checks the admin page too. Row locks serialize
booking and deactivation; foreign-key rules, ownership and one-query filters remain
intact. 54 unique local cases, 20 integration tests and 8 E2E scenarios passed,
including an actual upgrade from the previous schema and browser building CRUD.
These are scoped results, not a guarantee against every vulnerability.

### Actualización: gestión desde el frontend

La agenda y los formularios están conectados al backend: `/admin`, `/admin/rooms`,
`/dashboard` y `/reservations`. Los registros se movieron a `/admin/activity`.
Se conserva `requireUser` con el permiso específico en cada página del servidor;
los formularios no sustituyen ni debilitan los controles de Fastify y PostgreSQL.
Una sesión revocada provoca 401 y navegación fija a `/login`, sin tomar destinos
externos de entradas del usuario. Los componentes separan navegación, consultas,
formularios, selección de entidades y reglas de fechas.

Se revisaron además dos extensiones de lectura:

- `GET/HEAD /admin/clients`: autenticación compartida y `reservations:manage` antes
  del repositorio; solo cuentas cliente activas, proyección `id/businessName`,
  paginación acotada y búsqueda literal parametrizada. Los tests verifican rechazo
  al usuario común, ausencia de efectos antes de autorización y datos reales sin
  administradores, emails ni credenciales. Mapeo A01/A05/A07:2025.
- `GET /rooms?from=...&to=...`: exige ambos límites o ninguno y valida el período;
  calcula disponibilidad en una sola consulta SQL y no expone las reservas ni
  identidades que ocupan la sala. Una prueba de integración cuenta las consultas
  y comprueba salas libres/ocupadas. Mapeo A01/A05/A06:2025.

Las entradas se renderizan como texto de React; los formularios usan cookies
HttpOnly mediante el proxy y mantienen JSON/cabecera CSRF. Las consultas descartan
respuestas obsoletas al cambiar filtros o desmontar componentes. Las fechas locales
se convierten a UTC; se rechazan intervalos inválidos y horarios inexistentes por
cambio de horario de verano. Confirmar una reserva siempre vuelve a validar en el
backend: una disponibilidad consultada antes no concede un turno. Los fallos se
muestran sin afirmar que una operación incierta haya sido exitosa.

Pruebas locales: **49 backend + 4 unitarias de frontend**. Integración real:
**16 pruebas** con PostgreSQL/Redis, incluidos grupos padre. ESLint, TypeScript,
formato y compilación de producción de Next pasan. El recorrido E2E de negocio usa
navegadores independientes con admin/cliente: salas, reservas, filtros, conflicto
real tras disponibilidad desactualizada, HTML literal, ancho móvil y sesión revocada.
**La corrida conjunta aprobó los 7 escenarios E2E.**

La fixture E2E reinicia únicamente `tech-week:rate:*` en el Redis de prueba fijo
`127.0.0.1:56379/15` antes de cada escenario, para evitar que escenarios anteriores
consuman su cupo. No modifica umbrales ni desactiva el middleware durante el escenario.
La prueba de límites permanece en las suites backend; esta fixture no demuestra
persistencia de contadores entre escenarios. No se toca Redis de desarrollo.

English: room/reservation management screens now use the secured API, with per-page
server permissions and backend checks on every operation. A bounded admin-only
client directory and single-query room availability support the forms. React renders
names as text; revoked sessions navigate to the fixed login path; stale reads are
ignored and local dates convert to UTC. 49 backend and 4 frontend tests, 16 integration
tests, all 7 E2E scenarios, lint, TypeScript, formatting and Next production build
passed. E2E rate counters
are isolated in the fixed test Redis between scenarios; production controls remain
unchanged. Earlier sections describing missing management screens are historical.

### Etapa anterior: CRUD del backend con autorización por operación

Revisión del árbol de trabajo sobre `dedca4aa3b8776ac66a43b830f3c694e1f87ca9d`,
sin crear un commit. Se reutiliza la comprobación OWASP Top 10:2025 de esta tanda
(2026-11-06). Se aplicó también `references/auth-boundaries.md` de la skill.

Recorrido comprobado: `app.ts` → `connectStores`/`registerApi` → grupo
`protectedRoutes` con `authenticate` en `onRequest` → módulo `business/routes.ts`
con permisos por operación en `onRequest` → servicio → repositorio PostgreSQL.
La instancia de producción registra el repositorio real; las pruebas de frontera
sustituyen únicamente el almacenamiento/observación de efectos. El escenario E2E
verifica el montaje completo, incluyendo el proxy de Next y los servicios reales.

| Entradas protegidas                                                                  | Permiso                           | Primer efecto del negocio y autorización                                                | Evidencia                                                                    |
| ------------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET/HEAD `/rooms`, `/rooms/:id`, `/rooms/:id/availability`                           | `rooms:read`                      | SELECT; un cliente solo consulta salas activas, disponibilidad sin datos ajenos         | Frontera local + integración + E2E                                           |
| POST `/rooms`, PATCH/DELETE `/rooms/:id`                                             | `rooms:write`, solo admin         | INSERT/UPDATE; DELETE desactiva y conserva historial                                    | Rechazo antes del repositorio y verificaciones SQL reales                    |
| GET/HEAD/POST `/reservations`, GET/HEAD/PATCH/DELETE `/reservations/:id`             | `reservations:own`, solo cliente  | Propietario de sesión; SELECT/UPDATE con `user_id` y validación de cuenta al crear      | Dos clientes reales, 404 para ID ajeno, fila intacta tras intentos de cambio |
| GET/HEAD/POST `/admin/reservations`, GET/HEAD/PATCH/DELETE `/admin/reservations/:id` | `reservations:manage`, solo admin | Agenda global o reserva explícita para un cliente activo; no permite asignar a un admin | Permisos de todos los métodos + CRUD administrativo real                     |

- **A01/A07:** permisos consultados desde el usuario actual; ningún rol/propietario
  se acepta de cabeceras del cliente. El ámbito administrativo se construye en el
  registro de rutas, nunca con un parámetro HTTP. La frontera rechaza sesiones
  ausentes, inválidas y vencidas antes de ejecutar efectos del negocio.
- **A05/A08:** JSON estricto, UUID/fechas con zona, campos permitidos y SQL parametrizado.
  La proyección del repositorio no devuelve emails ni hashes. Los intentos de
  asignación masiva o inyección se rechazan o permanecen como texto literal.
- **A06/A08:** fechas/listas acotadas, agenda con un único JOIN, propiedad aplicada
  en SQL y cancelación lógica. Creación/reprogramación bloquean la sala y vuelven
  a comprobar que esté activa; la exclusión GiST conserva la no superposición.
  Conflictos, deadlocks y contención por bloqueo se traducen a 409, con rollback;
  no se reintenta automáticamente una escritura. Se comprobó una reserva esperando
  efectivamente el lock de una desactivación antes de rechazarla.
- **A09/A10:** hereda auditoría por request/denegaciones y rate limiting; los fallos
  inesperados devuelven 503 sin SQL, credenciales o detalles del almacenamiento.
- **A02/A03/A04:** conserva configuración HTTP, dependencias y criptografía existentes;
  esta ampliación no constituye una revisión nueva de avisos de dependencias.

Validación ejecutada: **49 pruebas locales**, **15 pruebas de integración**
(incluidos los grupos padre del runner) con PostgreSQL y Redis de prueba, y
**6 escenarios E2E**. El nuevo escenario de negocio usa HTTP por Next; los otros
cinco ejercitan el navegador. ESLint y TypeScript de ambas apps pasan.
Una mutación aislada que elimina el filtro SQL de propietario hace fallar la prueba
IDOR con `200 !== 404`; el árbol original no fue modificado por ese experimento.
Evidencia temporal: `/tmp/tech-week-business-idor-mutation.txt`.

No se encontraron bypasses en los recorridos ejercitados. Los permisos son de la API,
no políticas RLS o cuentas PostgreSQL por usuario. No hay pantallas de reservas,
recurrencias ni horarios de apertura. Las pruebas no demuestran ausencia de todos
los canales laterales o vulnerabilidades; los límites de autenticación y despliegue
previos siguen documentados. Los resultados históricos siguientes se conservan
como etapas anteriores y no describen la cobertura actual del CRUD.

English: business CRUD now runs behind shared authentication and explicit operation
permissions. Clients can only read/write their own reservations; admins manage rooms
and all client reservations. SQL ownership predicates, strict input schemas, bounded
queries, room locks, exclusion constraints and sanitized errors were exercised.
49 local tests, 15 real PostgreSQL/Redis integration tests and 6 E2E scenarios passed,
as did both apps' ESLint/TypeScript checks. An isolated ownership-filter mutation was
caught by the IDOR test. Authorization is API-level; no RLS, booking screens or
recurrence rules were added. This is scoped evidence, not a general security guarantee.

### Etapa anterior: tablas del negocio, antes del CRUD

La migración `003_rooms_reservations.sql` agrega `public.rooms` y
`public.reservations`, con referencias a sala y cuenta cliente. PostgreSQL rechaza
períodos vacíos, invertidos o infinitos, y mediante exclusión GiST impide que dos
reservas no canceladas ocupen simultáneamente la misma sala. La cancelación conserva
historial; las referencias usan `ON DELETE RESTRICT`. Mapeo A06/A08/A10:2025.

La integración real aprobó **8 pruebas**, incluyendo el grupo de autenticación y
las pruebas del negocio: validaciones, referencias, solapamientos entre clientes,
zonas horarias, adyacencia, cancelación, reactivación, consultas con JOIN y dos
inserciones concurrentes con un único resultado persistido. La migración también
se aplicó a la base local de desarrollo. No se agregaron endpoints de reservas:
las claves foráneas no sustituyen permisos por cuenta, y la futura API deberá
validar salas activas y gestionar conflictos y reintentos acotados ante deadlocks.

English: real PostgreSQL integration passed 8 tests covering authentication and
business tables, including overlapping/concurrent reservations and history.
Migration 003 was applied locally. No booking endpoints or UI were added; account
authorization, active-room validation and bounded transaction retry handling
remain application-layer work. Database constraints are not an authorization policy.

### Actualización: nombre de empresa en la cuenta

Se agregó `auth.users.business_name` mediante una migración nueva, conservando
las cuentas existentes con `NULL`. El registro requiere `businessName`; valida
tipo, longitud y caracteres de control, y normaliza espacios externos. El nombre
no modifica la identidad, el rol ni los permisos. Las consultas usan parámetros
SQL, los registros duplicados no reemplazan el nombre y el frontend renderiza
el valor como texto de React. Mapeo principal: A01/A05/A07/A08:2025.

Con el acceso local disponible se aplicó la migración de desarrollo y se ejecutó
la integración en contenedores de prueba independientes: **2 pruebas aprobadas**,
incluidas las restricciones reales de PostgreSQL, el nombre con contenido similar
a SQL, la compatibilidad con nombres nulos y sesiones Redis. Pasaron también
**43 pruebas locales y 5 escenarios E2E completos**, incluyendo un nombre con
marcado HTML que se muestra como texto sin crear elementos. El test de registro
y login necesitaba esperar la navegación a `/login` antes de completar los campos;
esa sincronización fue corregida. TypeScript, ESLint de ambas apps y formato pasan.

Estos resultados actualizan los bloqueos históricos de integración, navegador
y ESLint registrados más abajo. No reemplazan la revisión pendiente de avisos
de dependencias ni demuestran ausencia de todas las vulnerabilidades.

English: business names are stored on existing user accounts, validated at signup,
queried with SQL parameters, and rendered as React text. Existing accounts retain
null names; names never grant permissions. The development migration was applied.
43 local tests, 2 real integration tests, 5 complete browser E2E scenarios, both
TypeScript/ESLint checks and formatting passed. These results supersede the earlier
environment limitations for those checks; dependency advisories remain unverified.

### Diagnóstico y pruebas de arranque

Se comprobó vía HTTP que `/login` responde 200, el backend en 3001 rechaza la
conexión y el proxy `/api/health` devuelve 500. Las URLs y puertos locales de
configuración coinciden. Desde esta sesión, Docker rechaza el acceso a su socket
y la conexión Redis falla con `EPERM`; esto impide afirmar que el backend se haya
levantado o identificar la causa de su caída en una terminal externa.

Se corrigió una pérdida de diagnóstico: ioredis emitía el error original y luego
rechazaba `connect()` con `Connection is closed`. `db/redis.ts` conserva ahora el
error inicial. `startup.ts` registra etapa, código de una lista permitida y una
indicación fija; nunca mensajes crudos, SQL ni credenciales. Mapeo A09/A10:2025.
Cuatro pruebas de arranque pasan. Una copia temporal que vuelve a descartar el
error original hace fallar la regresión, sin modificar el árbol del proyecto.

English: HTTP checks confirmed the frontend is available and the backend is not
listening. This session cannot access Docker or connect to Redis (`EPERM`), so
backend recovery is not verified. Startup now preserves the original Redis error
and emits only a known code, stage and fixed hint. Four startup tests pass; an
isolated mutation reverting error preservation is detected by the regression.

### Refactorización posterior: middleware y módulos

Sobre `3af4c374a0e3c1a77dcbb16afed83319be145105` se separaron la composición,
infraestructura HTTP, middleware de autenticación/permisos, controladores,
servicio y rutas administrativas. Esta sección corresponde a cambios del árbol
de trabajo, no a un nuevo commit. Se conservan las condiciones de sesión, CSRF,
rate limiting, cookies, auditoría y acceso a almacenamiento.

El grupo privado ejecuta `authenticate` en `onRequest`; los permisos se aplican
en `preHandler`, antes de los handlers. El grupo admin exige además `admin:read`.
Las pruebas nuevas verifican que un rechazo no ejecute la operación, que los hooks
se hereden en rutas anidadas, que las identidades concurrentes no se mezclen y que
un permiso sin autenticación previa rechace el acceso. La política de contraseñas
ahora se verifica también en el servicio sin pasar por un controlador HTTP.
El mapeo principal de este cambio es A01/A06/A07/A10:2025. Se consultaron los
documentos de Hooks y Encapsulation incluidos en el paquete Fastify instalado.

Validación de esta refactorización: `npm run test:precommit` aprobado, incluyendo
36 pruebas (6 unitarias, 6 modulares, 9 de regresión, 10 de seguridad y 5 de
middleware), TypeScript de ambas apps, formato, pruebas del hook y diagnóstico
de timing. Este último registró medianas de 255,78–259,73 ms y cociente 1,0155.
En una copia temporal se anuló deliberadamente `authenticate`: la nueva prueba
falló con 400 recibido frente a 401 esperado, demostrando que detecta la omisión
del control previo a la validación. No se modificó el código original para ese
experimento. ESLint del backend volvió a fallar por el paquete `globals` ausente.
Integración y E2E mantienen los bloqueos del entorno registrados abajo.

En inglés: this working-tree refactor adds reusable authentication/permission
hooks and separates route composition, controllers, services and infrastructure.
New tests exercise real Fastify hooks, stopping handlers on denial, nested scope
inheritance, concurrent principal isolation and service-level password policy.
All 36 local tests, type checks, formatting, hook checks and the timing diagnostic
passed. A temporary mutation disabling authentication was detected by the new
test. It is not a new commit review; existing real-service validation limits and
the missing backend lint dependency still apply.

### P2 — Cierre de Redis al fallar la conexión

Confianza alta. El intento end-to-end mostró una excepción al ejecutar `QUIT`
sobre un cliente sin conexión. La inicialización ahora conecta antes de registrar
el plugin y libera el cliente mediante `disconnect` incluso cuando falla el arranque.
Evidencia de la corrección: [src/db/redis.ts](apps/backend/src/db/redis.ts).
La prueba modular simula el fallo de conexión y comprueba liberación del cliente y
ausencia de `QUIT`. Corresponde a **A10:2025**; afecta la terminación controlada y
la disponibilidad, sin demostrar un bypass de autenticación.

### P2 — Registro prematuro de login exitoso

Confianza alta. La primera implementación emitía `login_succeeded` antes de guardar
la sesión. Un fallo de escritura dejaba un evento de éxito engañoso. Ahora se registra
después de crear la sesión; si falla la auditoría, se revoca la sesión y no se envía
la cookie. Evidencia: [src/auth/service.ts](apps/backend/src/auth/service.ts).
Pruebas de regresión y modulares verifican tanto el fallo de sesión como el de auditoría.
Corresponde a **A09:2025 / A10:2025**. El fallo fue encontrado en código aún no confirmado.

## Cobertura de las diez categorías

“Revisada” significa controles inspeccionados y pruebas concretas en este alcance;
no significa que toda la categoría esté resuelta ni que todas sus variantes hayan
sido probadas. Los límites pendientes se indican en cada fila.

| OWASP 2025                                                                                                                    | Estado y evidencia                                                                                                                                                                                                                            | Límites                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [A01 — Broken Access Control](https://top10.owasp.org/2025/A01_2025-Broken_Access_Control/)                                   | RBAC en servidor, permisos leídos del usuario actual, rechazo de autoasignación de admin, acceso entre identidades, CSRF, protección de auditorías. Pruebas de regresión y seguridad.                                                         | No hay modelo de empresas/tenants ni permisos de reservas. No hay URLs de destino proporcionadas por el usuario que activen un flujo SSRF.                                                                                    |
| [A02 — Security Misconfiguration](https://top10.owasp.org/2025/A02_2025-Security_Misconfiguration/)                           | Esquemas estrictos, límite de cuerpo, errores genéricos, cookies, cabeceras, CORS cerrado, IP reenviada no confiable, Docker en loopback.                                                                                                     | Configuración local; falta revisar despliegue, proxy, TLS y ACL de servicios antes de producción.                                                                                                                             |
| [A03 — Software Supply Chain Failures](https://top10.owasp.org/2025/A03_2025-Software_Supply_Chain_Failures/)                 | Manifiestos y lockfile revisados; integridad de paquetes usados desde caché contrastada contra el lockfile.                                                                                                                                   | `npm audit` intentado, sin resultado por `EAI_AGAIN`. No se afirma que las dependencias estén libres de vulnerabilidades.                                                                                                     |
| [A04 — Cryptographic Failures](https://top10.owasp.org/2025/A04_2025-Cryptographic_Failures/)                                 | scrypt N=131072, r=8, p=1; salt aleatorio de 128 bits; hash de 64 bytes; comparación con `timingSafeEqual`; tokens aleatorios de 256 bits y digest SHA-256 como clave de sesión. Pruebas de sal, coste, alteración, no truncamiento y claves. | No se prueba la implementación interna de OpenSSL, el generador del SO, TLS ni cifrado de discos. HTTP solo para el modo local autorizado.                                                                                    |
| [A05 — Injection](https://top10.owasp.org/2025/A05_2025-Injection/)                                                           | SQL parametrizado inspeccionado; pruebas de rechazo de HTML, email malformado tipo SQLi, CRLF, objetos y contaminación de prototipos; JSX sin HTML crudo.                                                                                     | La prueba SQL contra PostgreSQL real está bloqueada por conexión. No hay intérpretes de shell, plantillas dinámicas, XML, LDAP ni NoSQL alimentados por el usuario. No se declara una prueba exhaustiva de XSS del framework. |
| [A06 — Insecure Design](https://top10.owasp.org/2025/A06_2025-Insecure_Design/)                                               | Admin solo por CLI, duplicados protegidos por unicidad, límites por cuenta/IP, dos hashes simultáneos como máximo, expiración de sesión y capacidad limitada de streams. Prueba de ráfaga pequeña y recuperación.                             | El rate limit local comparte la IP del proxy Next.js; ataques distribuidos y pruebas de carga extensivas quedan pendientes.                                                                                                   |
| [A07 — Authentication Failures](https://top10.owasp.org/2025/A07_2025-Authentication_Failures/)                               | Login uniforme para credenciales inválidas, hash ficticio para cuenta desconocida, rotación, revocación, vencimiento, inhabilitación, cookies y diagnóstico de timing.                                                                        | No hay MFA, verificación de email ni recuperación de contraseña. La lista de contraseñas comunes es básica. El diagnóstico no prueba ausencia de canales laterales.                                                           |
| [A08 — Software or Data Integrity Failures](https://top10.owasp.org/2025/A08_2025-Software_or_Data_Integrity_Failures/)       | Migraciones con checksum, bloqueo y transacción; JSON estricto y sesión resuelta en servidor, sin aceptar un rol del cliente.                                                                                                                 | Validación real de migraciones pendiente. No hay webhooks, cargas de ejecutables ni actualizaciones remotas para analizar. Redis/PostgreSQL pertenecen al límite de confianza local.                                          |
| [A09 — Security Logging and Alerting Failures](https://top10.owasp.org/2025/A09_2025-Security_Logging_and_Alerting_Failures/) | Eventos de autenticación y requests con IP de socket, ID, fecha, ruta de servidor, método, estado y duración; límites de retención; no cuerpos, consultas, contraseñas ni tokens. Acceso solo admin y pruebas de falsificación de IP.         | Persistencia real de streams pendiente de integración. No hay SIEM, alertas, bloqueo automático ni almacenamiento inmutable. Si falla el log HTTP posterior a la respuesta, hay fallback de metadatos a consola.              |
| [A10 — Mishandling of Exceptional Conditions](https://top10.owasp.org/2025/A10_2025-Mishandling_of_Exceptional_Conditions/)   | Denegación ante fallo de almacenamiento, tiempos límite, cierre de Redis, revocación de sesión sin auditoría y rechazo al agotar la capacidad de hashing. Pruebas con fallos inducidos.                                                       | No se simuló una partición real, agotamiento de disco ni caída del host.                                                                                                                                                      |

## Timing y criptografía

`npm run test:timing` ejecuta scrypt real con cuatro rutas inválidas: usuario
desconocido, contraseña con primer carácter incorrecto, contraseña con último
carácter incorrecto y cuenta inactiva. Realiza calentamiento, intercala casos y
conserva siete muestras por caso. En la ejecución del 2026-11-06, las medianas
fueron aproximadamente **257,2–258,3 ms**, con cociente máximo/mínimo **1,0042**.

Es un diagnóstico HTTP dentro del proceso con almacenamiento en memoria y un
umbral amplio para detectar que una ruta omitió el hash. No es un análisis
estadístico de canales laterales, no mide la base real ni la red y no garantiza
tiempo constante de toda la aplicación. La comparación del hash usa una primitiva
de tiempo constante; el flujo completo incluye I/O y trabajo variable.

## Evidencia de que una regresión detecta el defecto

Se copió el código compilado y las pruebas a un directorio temporal aislado y se
otorgaron deliberadamente permisos administrativos al rol `user`. La prueba RBAC
falló con **200 recibido frente a 403 esperado**. El árbol del proyecto no se
alteró para ese experimento. La suite sin esa mutación pasa.

## Ejecución y límites del entorno

- Suite local: **30 pruebas aprobadas**: 5 unitarias, 6 modulares, 9 de regresión
  y 10 de seguridad explícita.
- Timing: ejecutado y aprobado dentro del alcance limitado descrito arriba.
- TypeScript de ambas apps, compilación del backend, ESLint del frontend,
  formato y validación de ambos archivos Compose: aprobados.
- Integración: intentada, falla por `connect EPERM 127.0.0.1:55432`. No se cuenta como aprobada.
- E2E: cinco escenarios escritos y enumerados; ejecución intentada, detenida al no
  poder iniciar los servicios del backend. No se cuentan como escenarios ejecutados.
- Docker: acceso al socket denegado. El comando de migración tampoco pudo conectarse
  desde esta sesión; no se afirma haber verificado la tabla en la base real.
- ESLint del backend: no ejecutable por falta del paquete local `globals`, ya declarado
  en el manifiesto y lockfile. Requiere completar `npm ci` en un entorno con acceso al registro.
- Build del frontend: intentado; la ejecución hija de TypeScript mediante `spawnSync`
  recibe `EPERM`, aunque `tsc --showConfig` directo y typecheck funcionan.
- Dependencias: consulta de avisos intentada, bloqueada por resolución de red.

No hay otros fallos explotables confirmados en el código inspeccionado, pero los
bloqueos anteriores impiden cerrar la validación integral. Esto no certifica el
sistema ni afirma cobertura de todas las vulnerabilidades posibles.

## English summary

This is a working-tree review against `e95e97685885a14a417963dc6e2cc5cc705a293a`,
using the local `security-review` skill and the published OWASP Top 10:2025,
checked on 2026-11-06. This report records the pre-commit review. At the user's
explicit request, a local pre-commit hook runs automated tests; it does not invoke
the skill or replace the exact-SHA review performed after committing.

Two issues were found and fixed during implementation: shutdown attempted `QUIT`
without a live Redis connection, and successful-login auditing preceded session
persistence. Regression/module tests cover both fixes. A separate authorization
mutation was detected by the RBAC test, which rejected an unexpected 200 instead
of the required 403.

Coverage addresses authorization/CSRF, configuration, dependency integrity,
password and token cryptography, input injection, abuse controls, authentication,
migration integrity, request/authentication auditing, and failure handling. It is
partial coverage of each applicable category, not a claim to cover every vulnerability.
No tenant model, public URL fetcher, XML/LDAP/NoSQL interpreter, upload executable,
or webhook feature exists in this scope.

Request logs use the verified socket IP and ignore attacker-supplied forwarding
headers. In local mode, requests through Next.js show the local proxy IP. Logs
contain no request bodies, query strings, passwords, hashes, or bearer tokens.
Operational alerting, immutable log storage, MFA, email verification, full breached
password screening, production TLS, and production service access controls remain
outside the current implementation.

All 30 local unit/modular/regression/security tests and the separate timing diagnostic passed.
Timing medians were approximately 257.2–258.3 ms, maximum/minimum ratio 1.0042,
with seven samples per failure case. This is an in-process diagnostic using real
scrypt and in-memory storage, not proof of constant-time behavior or absence of
side channels. Real integration and five browser E2E scenarios remain unverified
because of environment restrictions. Backend lint, frontend production build,
and dependency advisory checks have the limitations listed above.

## Fuentes / Sources

- [OWASP Top 10:2025](https://top10.owasp.org/2025/)
- [Secure Code Review](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html)
- [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
