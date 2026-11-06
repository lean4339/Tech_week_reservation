# Levantar el proyecto localmente

[Español](LEVANTAR.md) | [English](RUNNING.md)

Esta guía corresponde a la aplicación de reservas: Next.js y Fastify con TypeScript,
PostgreSQL y Redis en Docker, ESLint y Prettier. No hace falta Dockerizar
el frontend ni el backend: ambos se ejecutan con Node.js en tu máquina.

## Requisitos

- Node.js 24 y npm 11 o superior.
- Docker iniciado, con Docker Compose disponible y permisos para usarlo.
- Puertos 3000, 3001, 5432 y 6379 disponibles.

Si usás nvm, ejecutá `nvm install` y `nvm use` desde la raíz del repositorio.

## Primera vez

Si todavía no tenés el repositorio:

```bash
git clone https://github.com/lean4339/Tech_week_reservation.git
cd Tech_week_reservation
```

Si ya lo tenés, abrí una terminal dentro de la carpeta del repositorio.

Instalá las dependencias de ambos proyectos desde la raíz:

```bash
npm ci
```

Creá los archivos de entorno **solo si todavía no existen**. Si ya configuraste
el proyecto, conservá tus archivos actuales y omití estas copias:

```bash
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Los ejemplos traen valores compatibles entre sí para desarrollo local.
Los archivos `.env` reales están excluidos de Git.

## Levantar en cada sesión

Desde la raíz del repositorio:

```bash
npm run db:up
npm run dev
```

El primer comando inicia PostgreSQL y Redis y espera a que sus healthchecks
estén listos. El segundo inicia frontend y backend juntos, con recarga automática.
Dejá esa terminal abierta.

| Servicio                              | Dirección                          |
| ------------------------------------- | ---------------------------------- |
| Frontend                              | <http://127.0.0.1:3000>            |
| Diagnóstico del backend               | <http://127.0.0.1:3001/health>     |
| Backend a través del proxy de Next.js | <http://127.0.0.1:3000/api/health> |
| PostgreSQL                            | `127.0.0.1:5432`                   |
| Redis                                 | `127.0.0.1:6379`                   |

## Comprobar que está funcionando

En otra terminal, desde la raíz:

```bash
docker compose ps
curl --fail http://127.0.0.1:3001/health
curl --fail http://127.0.0.1:3000/api/health
```

Los contenedores deben figurar como `healthy`. Ambos endpoints deben devolver
`{"status":"ok"}`. El endpoint verifica una consulta a PostgreSQL y un ping a Redis.
La página inicial redirige a tu cuenta si hay una sesión válida, o a `/login`.
Podés crear una cuenta `user` en `/signup`.

## Logs y apagado

Los logs de frontend y backend aparecen en la terminal de `npm run dev`.
Fastify escribe logs JSON por consola. Los eventos de autenticación y requests
se guardan además en Redis, con límites y vencimiento, y se consultan en
`/admin/activity`; no son una copia íntegra de los logs del proceso.

Para ver los logs de PostgreSQL y Redis:

```bash
npm run db:logs
```

Ctrl+C detiene la visualización de logs. Para apagar la aplicación, usá Ctrl+C
en la terminal de `npm run dev` y luego:

```bash
npm run db:down
```

Los volúmenes conservan los datos para la siguiente ejecución.

## Verificaciones de desarrollo

```bash
npm run check
npm run build
```

`check` ejecuta ESLint, la comprobación de tipos y Prettier. Para aplicar el formato:

```bash
npm run format
```

Para levantar cada aplicación por separado, usá dos terminales:

```bash
npm run dev -w @tech-week/frontend
```

```bash
npm run dev -w @tech-week/backend
```

Para ejecutar lo compilado, primero corré `npm run build` y después usá
`npm run start -w @tech-week/frontend` y `npm run start -w @tech-week/backend`
en terminales separadas. PostgreSQL y Redis deben seguir iniciados.

## Problemas habituales

- **Docker no responde o rechaza el acceso:** comprobá `docker info` y que tu
  terminal tenga acceso al servicio Docker.
- **Puerto ocupado:** detené la instancia anterior o ajustá los puertos.
  Los puertos de PostgreSQL y Redis se configuran en el `.env` de la raíz;
  actualizá también `DATABASE_URL` y `REDIS_URL` en `apps/backend/.env`.
  El puerto del backend se configura con `PORT`; si lo cambiás, ajustá
  `BACKEND_URL` en `apps/frontend/.env.local` y reiniciá Next.js.
- **El backend no inicia:** Redis debe estar disponible al arrancar.
  Revisá `docker compose ps` y `npm run db:logs`.
  El evento `startup_failed` incluye la etapa (`plugins`, `migrations` o `listen`),
  un código conocido y una indicación, sin imprimir credenciales ni errores SQL.
  `ECONNREFUSED` indica una conexión rechazada: iniciá los servicios con
  `npm run db:up`. `28P01` indica credenciales PostgreSQL rechazadas; `EADDRINUSE`,
  un puerto ocupado. `EPERM`/`EACCES` indican restricciones del entorno de ejecución.
  Si `/login` carga pero `/api/health` devuelve 500, comprobá primero que
  `http://127.0.0.1:3001/health` responda: el frontend puede estar activo sin backend.
- **Health devuelve 503:** revisá PostgreSQL, Redis y las URLs del backend.
- **Cambiaste la contraseña de PostgreSQL y no conecta:** las variables de Compose
  inicializan una base nueva; no cambian las credenciales de un volumen existente.
- **Falló la descarga de dependencias:** verificá la conexión al registro npm
  y volvé a ejecutar `npm ci`.

## Autenticación, migraciones y pruebas

El backend aplica automáticamente las migraciones al arrancar. Para aplicarlas de
forma explícita y crear un administrador desde una terminal interactiva:

```bash
npm run db:migrate
npm run admin:create
```

El comando de administrador pide email y contraseña; no la muestra ni modifica
cuentas existentes. El registro público crea únicamente `user`.

Consultá [AUTH.md](AUTH.md) para sesiones, permisos y logs Redis, y
[TESTING.md](TESTING.md) para las cuatro categorías de pruebas y la integración real.
Para evaluar edificios, salas, reservas, aislamiento y métricas, seguí el
[recorrido de entrega](DELIVERY.md).
