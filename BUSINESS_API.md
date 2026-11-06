# API de salas y reservas / Rooms and reservations API

## Español

El backend expone estos endpoints; desde Next.js se usa el prefijo `/api`.
Se requiere la cookie de sesión en todos. Las escrituras (`POST`, `PATCH`, `DELETE`)
requieren `Content-Type: application/json`, un `Origin` incluido en `APP_ORIGINS`
y `X-Requested-With: tech-week-web`. En `DELETE` enviá `{}` como cuerpo JSON.

| Método y ruta                                 | Usuario común      | Admin                           | Resultado                   |
| --------------------------------------------- | ------------------ | ------------------------------- | --------------------------- |
| `GET /rooms`                                  | Salas activas      | Todas las salas                 | `{rooms: [...]}`            |
| `GET /rooms/:id`                              | Sala activa        | Cualquier sala                  | `{room: {...}}`             |
| `GET /rooms/:id/availability?from=...&to=...` | Sala activa        | Cualquier sala                  | `{available: boolean}`      |
| `POST /rooms`                                 | 403                | Crear                           | `{room: {...}}`, 201        |
| `PATCH /rooms/:id`                            | 403                | Editar/reactivar                | `{room: {...}}`             |
| `DELETE /rooms/:id`                           | 403                | Desactivar                      | `{room: {...}}`             |
| `GET /reservations?from=...&to=...`           | Solo propias       | 403: usar `/admin/reservations` | `{reservations: [...]}`     |
| `GET /reservations/:id`                       | Solo propia        | 403: usar ruta admin            | `{reservation: {...}}`      |
| `POST /reservations`                          | Crear propia       | 403: usar ruta admin            | `{reservation: {...}}`, 201 |
| `PATCH /reservations/:id`                     | Reprogramar propia | 403: usar ruta admin            | `{reservation: {...}}`      |
| `DELETE /reservations/:id`                    | Cancelar propia    | 403: usar ruta admin            | `{reservation: {...}}`      |
| `GET /admin/reservations?from=...&to=...`     | 403                | Agenda de todos los clientes    | `{reservations: [...]}`     |
| `GET /admin/reservations/:id`                 | 403                | Cualquier reserva               | `{reservation: {...}}`      |
| `POST /admin/reservations`                    | 403                | Crear para un cliente activo    | `{reservation: {...}}`, 201 |
| `PATCH /admin/reservations/:id`               | 403                | Reprogramar                     | `{reservation: {...}}`      |
| `DELETE /admin/reservations/:id`              | 403                | Cancelar                        | `{reservation: {...}}`      |

Crear sala requiere `{name, capacity, buildingId}`; admite `location` (texto o `null`) y
`active` (por defecto `true`). Editar admite esos mismos campos, al menos uno.
Nombre y ubicación se recortan, rechazan controles y admiten 2–120 y 2–254
caracteres respectivamente. La capacidad es un entero entre 1 y 100000.
Desactivar conserva la sala y sus reservas: impide nuevas reservas y
reprogramaciones, pero no cancela automáticamente las existentes.

Crear reserva requiere `{roomId, startsAt, endsAt}`. El propietario sale de la
sesión: enviar `userId`, `role`, `permissions`, `cancelledAt` o campos extra se
rechaza. Solo el POST administrativo admite y exige `userId`, que debe identificar
una cuenta cliente activa, nunca un admin. Reprogramar requiere `{startsAt, endsAt}`;
no permite cambiar sala ni propietario. Para cambiar de sala, cancelá y reservá otra.
No se reprograman reservas canceladas o ya iniciadas. Cancelar es idempotente y
conserva historial; no hay borrado físico ni reactivación de reservas canceladas.

Fechas con zona horaria explícita, por ejemplo `2035-04-10T09:00:00-03:00` o
`2035-04-10T12:00:00Z`; al construir una URL, codificá `+` como `%2B`.
El inicio debe preceder al fin y el período no puede superar 366 días. Crear o
reprogramar exige inicio futuro. Las respuestas usan UTC. Los intervalos son
`[inicio, fin)`, por lo que se admiten reservas consecutivas sin solapamiento.

Las listas aceptan `limit` (1–100, por defecto 50) y `offset` (0–10000, por defecto 0).
En las listas de reservas, `from` y `to` son opcionales e independientes.
Sin fechas se consulta cualquier fecha; con una sola se filtra desde o hasta ese
límite; con ambas se consulta la intersección, sin límite de amplitud del filtro. Admiten `roomId` y `status=active|cancelled|all`
(por defecto `active`). La agenda administrativa agrega `userId` para filtrar por
empresa. Devuelve nombre de sala y `businessName` en un único JOIN, sin N+1.
No devuelve email ni credenciales. La disponibilidad devuelve solamente un booleano;
no revela identidades, IDs ni horarios de reservas ajenas y es una consulta puntual,
no una garantía de que el período siga libre al reservar.

La autenticación compartida corre antes de los handlers. Cada ruta exige un permiso;
las consultas y escrituras de reservas propias incluyen el ID de la sesión en SQL.
Un ID ajeno y uno inexistente devuelven el mismo 404. JSON estricto y SQL parametrizado
impiden asignación de campos no autorizados e interpolación de entradas en SQL.
Las escrituras bloquean la sala en una transacción para volver a verificar su estado;
la exclusión PostgreSQL impide superposiciones aun con concurrencia. Conflictos o
contención devuelven 409; fallos inesperados devuelven 503 sin detalles internos.
Los permisos se aplican en la API; no se agregaron cuentas PostgreSQL por usuario ni RLS.

La implementación está en `apps/backend/src/business/`: `routes.ts` monta permisos
por operación, `schemas.ts` valida HTTP, `service.ts` aplica reglas de negocio,
`store.ts` ejecuta SQL y transacciones, y `model.ts` define contratos y errores.
Estas operaciones están conectadas a las pantallas `/admin`, `/admin/rooms`,
`/dashboard` y `/reservations`. Los logs están en `/admin/activity`.
No hay recurrencias ni horarios de apertura.

`GET /admin/clients` requiere `reservations:manage`: devuelve `{clients: [{id,
businessName}]}` de cuentas cliente activas, sin emails ni credenciales. Acepta
`limit`, `offset` y `search` (nombre literal, hasta 120 caracteres). Alimenta los
selectores de empresa del admin, con búsqueda y paginación.
`GET /rooms` admite `from` y `to` opcionales, siempre juntos: agrega `available`
a cada sala con una sola consulta SQL, sin consultas por sala ni datos de terceros.
Sin período, `available` es `null`. Las reglas de período son las mismas que para
la disponibilidad individual.

## English

The backend exposes the routes in the table above; Next.js forwards them under
`/api`. All routes require the session cookie. Writes (`POST`, `PATCH`, `DELETE`)
require JSON, an exact allowed `Origin` and `X-Requested-With: tech-week-web`.
Send `{}` as the JSON body for DELETE requests.

Clients may read active rooms and availability and create, read, reschedule and
cancel only their own reservations through `/reservations`. Administrators may
create/update/deactivate rooms and manage any client's reservations through
`/admin/reservations`. Admins use those explicit administrative reservation routes;
they do not receive the client-only `reservations:own` permission.

Room creation requires `{name, capacity, buildingId}`, with optional `location` (text or null)
and `active` (default true). PATCH accepts any nonempty subset of those fields.
Names/locations are trimmed, reject control characters and allow 2–120/2–254
characters. Capacity must be an integer from 1 to 100000. DELETE deactivates a room;
it preserves existing bookings and prevents new bookings and rescheduling until
reactivated. Existing bookings are not automatically cancelled.

Reservation creation requires `{roomId, startsAt, endsAt}`. Clients cannot assign
ownership or privileged fields; the owner comes from the authenticated session.
Only administrative creation requires `userId`, referring to an active client account,
never an administrator. PATCH requires `{startsAt, endsAt}` and cannot change the
owner or room. Changing rooms requires cancellation and a new booking. Cancelled
or already-started bookings cannot be rescheduled. Cancellation is idempotent,
preserves history and releases the interval; cancelled records cannot be reactivated.

Use timestamps with explicit offsets, such as `2035-04-10T09:00:00-03:00` or
`2035-04-10T12:00:00Z`; URL-encode positive offset signs as `%2B`. Start must precede
end, and windows must not exceed 366 days. Creation/rescheduling requires a future
start. Responses use UTC. Half-open intervals allow adjacent reservations.

Lists accept `limit` (1–100, default 50) and `offset` (0–10000, default 0).
Reservation lists accept optional, independent `from` and `to` bounds. Omit both
for any date, or supply one for an open-ended filter. Supplying both matches
overlapping intervals without a maximum filter span. Lists also support `roomId` and `status=active|cancelled|all` (default active).
The admin agenda also supports `userId` as the client-company filter. One JOIN
returns room names and `businessName`, without N+1 queries, email or credentials.
Availability returns only a boolean, with no other client's identity or booking details;
it is a snapshot, not a guarantee that a later booking will succeed.

Shared authentication and per-operation permissions run before handlers. Ownership
predicates are included in SQL reads and writes. Foreign and missing reservation
IDs produce the same 404. Strict JSON and parameterized SQL prevent mass assignment
and input interpolation. Transactions lock rooms and recheck active state, while
PostgreSQL exclusion constraints prevent concurrent overlaps. Conflicts/contention
return 409; unexpected failures return sanitized 503 responses. API authorization
does not create individual database logins or PostgreSQL RLS policies.

`apps/backend/src/business/` separates routes/permissions, HTTP schemas, business
rules, repository/transactions and models/errors. Management screens are available
at `/admin`, `/admin/rooms`, `/dashboard` and `/reservations`; logs live at
`/admin/activity`. Recurrence rules and opening hours are not implemented.

`GET /admin/clients` requires `reservations:manage` and returns active client
`{id, businessName}` records only, without email or credentials. It supports
`limit`, `offset` and literal name `search` (up to 120 characters) for paginated
company selectors. `GET /rooms` accepts optional `from`/`to` together and returns
an `available` flag per room using one SQL query, without per-room requests or
other clients' data. Without a period, `available` is null. Period rules match
the individual availability endpoint.

## Edificios / Buildings

La migración `004_buildings.sql` crea `public.buildings` (nombre, dirección,
estado y fecha de creación), agrega `rooms.building_id` con clave foránea
`ON DELETE RESTRICT` y un índice por edificio. Las reservas siguen vinculadas
solo a la sala: edificio y dirección se obtienen mediante JOIN, sin duplicarlos.

| Método y ruta           | Usuario común | Admin                           |
| ----------------------- | ------------- | ------------------------------- |
| `GET /buildings`        | Solo activos  | Todos, paginados                |
| `GET /buildings/:id`    | Solo activo   | Cualquier edificio              |
| `POST /buildings`       | 403           | Crear                           |
| `PATCH /buildings/:id`  | 403           | Editar/reactivar                |
| `DELETE /buildings/:id` | 403           | Desactivar sin borrar historial |

Crear requiere `{name, address}` y admite `active` (por defecto true).
PATCH admite esos campos, al menos uno. Nombre/dirección se recortan y requieren
2–120/2–254 caracteres, sin controles. Las listas aceptan `limit` y `offset`
con los mismos límites que salas. `buildings:read` corresponde a ambos roles;
`buildings:write` corresponde solo al admin. Autenticación, CSRF y límites se
aplican igual que a los demás endpoints. GET devuelve `{building: {...}}` o
`{buildings: [...]}`; POST devuelve 201.

`GET /rooms`, `/reservations` y `/admin/reservations` aceptan `buildingId` como
filtro adicional. Las salas incluyen `buildingId`, `buildingName`,
`buildingAddress` y `buildingActive`; las reservas incluyen `buildingId` y
`buildingName`. La disponibilidad exige sala y edificio activos y se obtiene
en una sola consulta. Desactivar un edificio impide crear reservas o reprogramarlas,
pero no cambia el estado propio de sus salas ni cancela reservas existentes.
Un bloqueo de fila del edificio serializa esa decisión con las reservas concurrentes.

Las salas antiguas mantienen `building_id = NULL` hasta que el admin las asigne;
no se inventa una sede. Permanecen visibles en administración como “Sin edificio
asignado”, con su historial intacto, y no aceptan nuevas reservas mientras falte
la asignación. Las salas nuevas exigen un edificio activo. Una sala asignada que
ya tenga reservas no puede mudarse de edificio (409), para conservar la asociación
histórica; creá otra sala para la nueva ubicación. La primera asignación de una
sala heredada sí está permitida.

En el frontend: `/admin/buildings` permite crear/editar/desactivar/reactivar;
`/admin/rooms` permite asignar edificios y filtrar por ellos. El catálogo del
cliente y las agendas incluyen filtro por edificio. Los selectores paginados
muestran nombre y dirección; `location` de la sala representa piso/ubicación interna.

English: migration 004 creates `public.buildings` and adds an indexed foreign key
from rooms. Reservations keep only the room reference; JOINs supply building details.
Both roles have `buildings:read`; only admins have `buildings:write`. The table above
lists CRUD endpoints. Creation requires `{name, address}`, optional `active` (true);
PATCH accepts a nonempty subset. Names/addresses are trimmed, bounded to 2–120/2–254
characters and reject controls. All routes retain authentication, CSRF for writes
and existing limits; lists use the standard pagination contract.

Room creation now requires `buildingId`. Rooms and reservation agendas accept that
filter and include building details without N+1 queries. Both room and building
must be active for new/rescheduled bookings. Deactivation is serialized against
booking transactions and preserves existing reservations and room flags.
Legacy rooms remain unassigned (nullable FK), visible to admins with their history,
until explicitly assigned; they cannot receive new bookings before then. An assigned
room with reservation history cannot move buildings (409); its initial legacy
assignment remains permitted. `/admin/buildings` provides full management;
room forms, the client catalogue and agendas include building selectors/filters.

Las agendas del frontend abren sin fechas preseleccionadas. “Quitar filtros” restaura
la vista sin fechas; crear o reprogramar no impone filtros automáticamente. Se
conservan paginación, permisos y el filtro de estado (vigentes por defecto).
La migración `005_reservation_order.sql` agrega un índice `(starts_at, id)` para
la agenda paginada sin rango de fechas. Los períodos de reservas y las consultas
de disponibilidad siguen requiriendo inicio/fin y su límite de 366 días.

English: agendas open with empty date fields. “Quitar filtros” clears filters;
creating/rescheduling does not impose date filters. Pagination, permissions and
status filtering (active by default) remain. Migration 005 indexes `(starts_at, id)`
for chronological pagination without date bounds. Booking periods and availability
queries still require start/end and retain their 366-day limit.

## Métricas administrativas / Administrative metrics

GET/HEAD `/admin/metrics`: sesión y `admin:read`, con `from`/`to` opcionales y
conjuntos, hasta 366 días. Sin filtros, últimos 30 días de calendario UTC.
PostgreSQL calcula y Redis guarda una caché versionada de 60 segundos.
Ver [contrato, fórmulas e invalidación](METRICS.md).

English: administrator-only metrics use an optional paired timestamp range,
default to 30 UTC calendar days, and cache PostgreSQL aggregates in Redis for
60 seconds with transactional revision invalidation. Definitions in METRICS.md.
