# Tech Week Reservation

[Español](README.md) | [English](README.en.md)

Setup inicial con Next.js (App Router) y Fastify, ambos con TypeScript estricto.
ESLint y Prettier configurados para ambos proyectos. PostgreSQL y Redis se ejecutan
en Docker; frontend y backend se ejecutan localmente con npm workspaces.

Guía paso a paso: [cómo levantar y detener el proyecto](LEVANTAR.md).
También disponible en inglés: [running the project locally](RUNNING.md).

## Requisitos

- Node.js 24 y npm 11 o superior (`nvm use` si utilizás nvm).
- Docker con Docker Compose y acceso al servicio de Docker.
- Puertos libres: 3000 (frontend), 3001 (backend), 5432 (PostgreSQL) y 6379 (Redis).

## Ejecutar localmente

Desde la raíz del repositorio:

```bash
npm ci
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
npm run db:up
npm run dev
```

Las copias de los archivos de entorno se hacen una sola vez. Los valores de ejemplo
sirven para desarrollo local y coinciden con Docker Compose.

`npm ci` activa las [pruebas automáticas antes de cada commit](TESTING.md).
En instalaciones existentes: `npm run hooks:install`.

- Frontend: <http://127.0.0.1:3000>.
- Backend: <http://127.0.0.1:3001/health>.
- Proxy del frontend hacia el backend: <http://127.0.0.1:3000/api/health>.

`GET /health` verifica las conexiones a PostgreSQL y Redis: devuelve 200 con
`{"status":"ok"}` si ambas responden, o 503 si falla alguna durante la ejecución.
Redis debe estar disponible para iniciar el backend.

Detener `npm run dev` con Ctrl+C. Detener los contenedores con `npm run db:down`;
los datos se conservan en volúmenes Docker. `npm run db:logs` muestra los logs de
los contenedores.

## Estructura

```text
apps/
  frontend/   Next.js + React + TypeScript
  backend/    Fastify + TypeScript + conexiones PostgreSQL/Redis
compose.yaml  PostgreSQL 18 y Redis 8 con volúmenes y healthchecks
```

## Comandos

```bash
npm run check          # ESLint, TypeScript y verificación de formato
npm run format         # Aplicar Prettier
npm run build          # Compilar ambos proyectos
npm run dev -w @tech-week/frontend
npm run dev -w @tech-week/backend
```

Después del build, se pueden ejecutar las versiones compiladas en dos terminales:

```bash
npm run start -w @tech-week/backend
npm run start -w @tech-week/frontend
```

Los contenedores también deben estar iniciados en este modo.

## Configuración

- `.env`: configuración de PostgreSQL y puertos publicados por Docker Compose.
- `apps/backend/.env`: `HOST`, `PORT`, `LOG_LEVEL`, `DATABASE_URL` y `REDIS_URL`.
- `apps/frontend/.env.local`: `BACKEND_URL`, utilizado por el proxy de Next.js.

Si cambiás credenciales o puertos en Compose, actualizá las URLs del backend.
Si cambiás el puerto del backend, actualizá `BACKEND_URL` y reiniciá Next.js.
Las credenciales de PostgreSQL se aplican al inicializar un volumen nuevo;
cambiar `.env` no modifica las credenciales de una base existente.

## Autenticación y pruebas

Login, registro de usuarios, sesiones Redis, roles `admin`/`user` y auditoría de
accesos ya están implementados. El backend aplica automáticamente la migración de
`auth.users` al iniciar. Creá administradores con `npm run admin:create`.

- [Autenticación, permisos y migraciones / Authentication](AUTH.md)
- [Pruebas unitarias, modulares, de regresión e integrales / Testing](TESTING.md)
- [Revisión de seguridad / Security review](SECURITY_REVIEW.md)

La API incluye gestión de edificios, salas y reservas por empresa. Los límites de la autenticación
actual están documentados en la guía de autenticación.

## Referencias

- [ESLint con Next.js](https://nextjs.org/docs/app/api-reference/config/eslint)
- [Plugin PostgreSQL de Fastify](https://github.com/fastify/fastify-postgres)
- [Plugin Redis de Fastify](https://github.com/fastify/fastify-redis)
- [Imagen oficial de PostgreSQL](https://hub.docker.com/_/postgres)

## Tablas del negocio

La [migración 003](apps/backend/migrations/003_rooms_reservations.sql) crea:

- `public.rooms`: ID, nombre, ubicación, capacidad, estado activo y fecha de creación.
- `public.reservations`: ID, sala, cuenta cliente, inicio, fin, creación y cancelación.

Cada cuenta `auth.users` representa un cliente y contiene `business_name`;
no hay tabla de empresas ni de unidades de tiempo. Las reservas usan `timestamptz`
y un intervalo `[inicio, fin)`: una puede terminar cuando comienza otra.
Una exclusión GiST impide solapamientos vigentes para la misma sala, incluso entre
clientes diferentes. Cancelar conserva la reserva y libera el período. Las claves
foráneas impiden borrar salas o cuentas con historial de reservas.

Los índices por sala/inicio y cliente/inicio permiten consultar ambas agendas;
la agenda administrativa trae sala y empresa mediante JOIN en una consulta.

API protegida de edificios, salas y reservas disponible. Protected buildings, rooms and reservations API available. See [BUSINESS_API.md](BUSINESS_API.md).
