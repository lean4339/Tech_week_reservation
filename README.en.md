# Tech Week Reservation

[Español](README.md) | [English](README.en.md)

Initial setup with Next.js (App Router) and Fastify, both using strict TypeScript.
ESLint and Prettier are configured for both applications. PostgreSQL and Redis run
in Docker; the frontend and backend run locally using npm workspaces.

Step-by-step guide: [running and stopping the project](RUNNING.md).
Also available in Spanish: [cómo levantar y detener el proyecto](LEVANTAR.md).

## Requirements

- Node.js 24 and npm 11 or later (`nvm use` if you use nvm).
- Docker with Docker Compose and access to the Docker service.
- Available ports: 3000 (frontend), 3001 (backend), 5432 (PostgreSQL), and 6379 (Redis).

## Run locally

From the repository root:

```bash
npm ci
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
npm run db:up
npm run dev
```

Copy the environment files only once. The example values are for local development
and match the Docker Compose configuration.

`npm ci` enables [automatic tests before each commit](TESTING.md).
For existing installations, run `npm run hooks:install`.

- Frontend: <http://127.0.0.1:3000>.
- Backend: <http://127.0.0.1:3001/health>.
- Frontend proxy to the backend: <http://127.0.0.1:3000/api/health>.

`GET /health` checks the PostgreSQL and Redis connections: it returns 200 with
`{"status":"ok"}` if both respond, or 503 if either fails while the server is running.
Redis must be available for the backend to start.

Stop `npm run dev` with Ctrl+C. Stop the containers with `npm run db:down`;
data is preserved in Docker volumes. `npm run db:logs` shows the container logs.

## Structure

```text
apps/
  frontend/   Next.js + React + TypeScript
  backend/    Fastify + TypeScript + PostgreSQL/Redis connections
compose.yaml  PostgreSQL 18 and Redis 8 with volumes and health checks
```

## Commands

```bash
npm run check          # ESLint, TypeScript, and formatting checks
npm run format         # Apply Prettier formatting
npm run build          # Build both applications
npm run dev -w @tech-week/frontend
npm run dev -w @tech-week/backend
```

After building, run the compiled applications in two separate terminals:

```bash
npm run start -w @tech-week/backend
npm run start -w @tech-week/frontend
```

The containers must also be running in this mode.

## Configuration

- `.env`: PostgreSQL settings and ports published by Docker Compose.
- `apps/backend/.env`: `HOST`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, and `REDIS_URL`.
- `apps/frontend/.env.local`: `BACKEND_URL`, used by the Next.js proxy.

If you change credentials or ports in Compose, update the backend connection URLs.
If you change the backend port, update `BACKEND_URL` and restart Next.js.
PostgreSQL credentials are applied when a new volume is initialized;
changing `.env` does not update credentials in an existing database.

## Authentication and testing

Login, user signup, Redis sessions, `admin`/`user` roles, and access auditing are
implemented. The backend automatically applies the `auth.users` migration at
startup. Create administrators with `npm run admin:create`.

- [Authentication, permissions, and migrations](AUTH.md)
- [Unit, modular, regression, integration, and E2E tests](TESTING.md)
- [Security review](SECURITY_REVIEW.md)

Reservation logic and company management are not implemented. Current authentication
limitations are documented in the authentication guide.

## References

- [ESLint with Next.js](https://nextjs.org/docs/app/api-reference/config/eslint)
- [Fastify PostgreSQL plugin](https://github.com/fastify/fastify-postgres)
- [Fastify Redis plugin](https://github.com/fastify/fastify-redis)
- [Official PostgreSQL image](https://hub.docker.com/_/postgres)
