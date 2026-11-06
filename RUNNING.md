# Running the project locally

[Español](LEVANTAR.md) | [English](RUNNING.md)

This guide covers the current setup: Next.js and Fastify with TypeScript,
PostgreSQL and Redis in Docker, ESLint, and Prettier. The frontend and backend
run locally with Node.js; they do not need to run in Docker.

## Requirements

- Node.js 24 and npm 11 or later.
- Docker running, with Docker Compose available and permission to use it.
- Available ports: 3000, 3001, 5432, and 6379.

If you use nvm, run `nvm install` and `nvm use` from the repository root.

## First-time setup

If you have not cloned the repository yet:

```bash
git clone https://github.com/lean4339/Tech_week_reservation.git
cd Tech_week_reservation
```

If you already have it, open a terminal in that folder. For the current local
installation:

```bash
cd /home/leandro/Escritorio/Tech_week_reservation
```

Install dependencies for both applications from the repository root:

```bash
npm ci
```

Create the environment files **only if they do not already exist**. If the project
is already configured, keep your existing files and skip these copies:

```bash
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

The examples contain matching values for local development.
Actual `.env` files are excluded from Git.

## Starting each session

From the repository root:

```bash
npm run db:up
npm run dev
```

The first command starts PostgreSQL and Redis and waits for their health checks
to pass. The second starts the frontend and backend together with automatic
reloading. Keep this terminal open.

| Service                           | Address                            |
| --------------------------------- | ---------------------------------- |
| Frontend                          | <http://127.0.0.1:3000>            |
| Backend health check              | <http://127.0.0.1:3001/health>     |
| Backend through the Next.js proxy | <http://127.0.0.1:3000/api/health> |
| PostgreSQL                        | `127.0.0.1:5432`                   |
| Redis                             | `127.0.0.1:6379`                   |

## Checking that everything works

In another terminal, from the repository root:

```bash
docker compose ps
curl --fail http://127.0.0.1:3001/health
curl --fail http://127.0.0.1:3000/api/health
```

The containers should be listed as `healthy`. Both endpoints should return
`{"status":"ok"}`. The endpoint runs a PostgreSQL query and pings Redis.
The frontend home page displays the project title.

## Logs and shutdown

Frontend and backend logs appear in the `npm run dev` terminal.
Fastify writes JSON logs to the console; it does not store them in Redis yet.

To view PostgreSQL and Redis logs:

```bash
npm run db:logs
```

Ctrl+C stops following the logs. To shut down the application, press Ctrl+C
in the `npm run dev` terminal, then run:

```bash
npm run db:down
```

Volumes preserve the data for the next run.

## Development checks

```bash
npm run check
npm run build
```

`check` runs ESLint, TypeScript checks, and Prettier. To apply formatting:

```bash
npm run format
```

To start each application separately, use two terminals:

```bash
npm run dev -w @tech-week/frontend
```

```bash
npm run dev -w @tech-week/backend
```

To run the compiled applications, run `npm run build` first, then use
`npm run start -w @tech-week/frontend` and `npm run start -w @tech-week/backend`
in separate terminals. PostgreSQL and Redis must remain running.

## Troubleshooting

- **Docker is unavailable or denies access:** run `docker info` and check that
  your terminal has access to the Docker service.
- **A port is already in use:** stop the previous instance or adjust the ports.
  PostgreSQL and Redis ports are configured in the root `.env` file;
  also update `DATABASE_URL` and `REDIS_URL` in `apps/backend/.env`.
  The backend port is configured with `PORT`; if you change it, update
  `BACKEND_URL` in `apps/frontend/.env.local` and restart Next.js.
- **The backend does not start:** Redis must be available at startup.
  Check `docker compose ps` and `npm run db:logs`.
- **The health endpoint returns 503:** check PostgreSQL, Redis, and the backend
  connection URLs.
- **PostgreSQL no longer connects after changing its password:** Compose variables
  initialize a new database; they do not change credentials in an existing volume.
- **Dependency downloads fail:** check connectivity to the npm registry
  and run `npm ci` again.

## Current scope

Only the initial setup and connection health checks are implemented. Redis is
available for future authentication and log storage. Sessions, reservation logic,
business tables, and automated tests for those features are not implemented yet.
