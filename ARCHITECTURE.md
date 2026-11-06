# Arquitectura del backend / Backend architecture

## Español

El backend separa adaptadores HTTP por actor y lógica de negocio por dominio:

```text
apps/backend/src/
  auth/                  Autenticación, sesiones, CSRF y permisos
  http/
    routes.ts            Composición y autenticación común
    admin/               Edificios, salas, clientes, reservas, métricas y actividad
    client/              Reservas propias
    catalog/             Lecturas de edificios, salas y disponibilidad
  modules/
    buildings/           Modelo, esquemas, servicio y repositorio de edificios
    rooms/               Modelo, esquemas, servicio y repositorio de salas
    reservations/        Modelo, esquemas, servicio y repositorio de reservas
    clients/             Directorio de empresas cliente
    metrics/             Agregaciones PostgreSQL y caché Redis
    shared/              Períodos, paginación, esquemas básicos y errores
    stores.ts            Contratos de dependencias por módulo
  db/                    Conexiones, composición de repositorios y transacciones
```

`http/routes.ts` registra las rutas públicas de autenticación y una frontera
privada con `authenticate` en `onRequest`. Dentro de esa frontera, los plugins
Fastify de catálogo, cliente y administración son hermanos: sus hooks no se
propagan entre ellos.

| Grupo HTTP | Operaciones                                                                      | Política                                                             |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `catalog/` | GET/HEAD de edificios, salas y disponibilidad                                    | `buildings:read` / `rooms:read`; clientes solo ven recursos activos  |
| `client/`  | GET/HEAD/POST/PATCH/DELETE de `/reservations`                                    | `reservations:own`; propietario obtenido exclusivamente de la sesión |
| `admin/`   | Escrituras de edificios/salas, clientes, reservas globales, métricas y actividad | `admin:read` común y permiso específico de cada operación            |

Se conservaron las URLs existentes: POST/PATCH/DELETE de `/rooms` y `/buildings`
se registran exclusivamente en `http/admin/`, aunque no tengan prefijo `/admin`.
GET/HEAD de esas mismas URLs pertenecen al catálogo compartido. La ubicación del
código y los métodos definen la separación; ningún dato enviado por el cliente
selecciona la política administrativa.

Las rutas de reservas de cliente y admin son explícitas, sin un bucle o bandera
que cambie permisos, esquema e identidad. Cada una recibe únicamente el repositorio
de reservas. Los servicios y repositorios por dominio comparten las reglas del
negocio: no se duplican disponibilidad, validación temporal ni exclusión de
superposiciones. SQL conserva los filtros de propietario y JOINs existentes.

La composición de repositorios vive en `db/product-stores.ts`. Las operaciones
transaccionales utilizan el mismo `PoolClient`, incluso cuando reservas bloquea
una sala y su edificio mediante los repositorios correspondientes. Se conservan
rollback, tiempos máximos de espera y traducción de conflictos. No se requieren
migraciones ni cambios del frontend por esta reorganización.

## English

HTTP adapters are separated by actor: `http/admin` owns administrative operations,
`http/client` owns the current client's reservations, and `http/catalog` contains
read-only building, room and availability endpoints shared by authorized roles.
The existing URL contracts remain unchanged, including administrative writes to
`/rooms` and `/buildings`.

All private routers inherit real session authentication before validation or
handlers. The admin router adds a common `admin:read` guard; individual operations
retain their resource permissions. Client bookings derive ownership from the
session, never a submitted identifier. Sibling Fastify plugins isolate their hooks.

Business models, schemas, services and SQL repositories live under individual
`modules` directories. `db/product-stores.ts` composes their dependencies. Booking
rules and SQL ownership predicates have one implementation; explicit client/admin
HTTP adapters replace the previous role-switching route factory. Cross-domain
locks retain the same PostgreSQL transaction connection and rollback behavior.
No database migration or frontend contract change is required.
