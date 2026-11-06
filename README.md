# Tech Week Reservation — Challenge Fontanella SRL

[Español](README.md) | [English](README.en.md)

Aplicación web para que empresas cliente consulten disponibilidad y gestionen sus
reservas de salas. La administración gestiona edificios y salas, consulta la agenda
global y analiza utilización por sala, edificio y empresa.

La implementación prioriza tres garantías: **evitar reservas superpuestas incluso
con concurrencia**, **separar las reservas de cada empresa** y **conservar el historial**.
Incluye confirmaciones de operación, errores de conflicto y métricas con caché Redis.

## Ejecutar desde un clon nuevo

Requisitos: Node.js **24**, npm **11+**, Docker y Docker Compose. Puertos locales:
3000, 3001, 5432 y 6379. Con nvm: `nvm install` y `nvm use` dentro del repositorio.

```bash
git clone https://github.com/lean4339/Tech_week_reservation.git
cd Tech_week_reservation
npm ci
cp .env.example .env
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
npm run db:up
npm run db:migrate
npm run admin:create
npm run dev
```

Copiá los archivos de entorno solo en la primera instalación; conservá los tuyos
si ya existen. Los ejemplos coinciden con Compose y son para desarrollo local.
El alta de admin es interactiva: pide email y contraseña oculta de **15–128
caracteres**; permite espacios/Unicode, no exige una combinación de mayúsculas,
números o símbolos y rechaza contraseñas comunes bloqueadas. Explica los errores y
permite reintentar. No promueve cuentas existentes ni crea un admin por registro público.

- Aplicación: <http://127.0.0.1:3000>.
- Backend: <http://127.0.0.1:3001/health>.
- Backend mediante Next.js: <http://127.0.0.1:3000/api/health>.

Ambos healthchecks deben responder `{"status":"ok"}`. PostgreSQL y Redis son
necesarios para iniciar el backend; las migraciones también se aplican al arrancar.
No hay cuentas ni salas precargadas: entrá como admin, creá un edificio y tres salas.
Las empresas crean sus cuentas en `/signup` y luego inician sesión en `/login`.
[Recorrido de evaluación y datos de ejemplo](DELIVERY.md).

Ctrl+C detiene las aplicaciones; `npm run db:down` detiene los contenedores y
conserva los volúmenes. `npm run db:up` y `npm run dev` permiten retomarlas.
[Guía detallada y solución de problemas](LEVANTAR.md).

## Probar y compilar

```bash
npm run check                 # ESLint, TypeScript y formato
npm run build                 # Compilación de ambas aplicaciones
npm test                      # Pruebas locales, sin Docker
npx playwright install chromium
npm run test:services:up
npm run test:all               # Auditoría npm, locales, timing, integración y E2E
npm run test:services:down
```

En Linux, si Playwright informa bibliotecas del sistema faltantes, instalalas con
`npx playwright install --with-deps chromium`. Integración y E2E usan PostgreSQL
55432, Redis 56379/DB 15 y aplicaciones 3100/3101; no usan la base de desarrollo.
Las auditorías necesitan acceso al registro npm y fallan también ante errores de red.

`npm ci` instala un hook local que ejecuta auditoría de dependencias, pruebas del
hook, TypeScript, formato, pruebas locales y timing antes de cada commit. ESLint,
integración y E2E se ejecutan aparte con los comandos anteriores. Las suites
unitarias, modulares, de regresión y E2E están descritas en [TESTING.md](TESTING.md).
Los últimos resultados verificados están en [DELIVERY.md](DELIVERY.md).

## Funcionalidades

| Perfil          | Pantallas y operaciones                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Empresa cliente | `/dashboard`: catálogo, disponibilidad y reserva directa; `/reservations`: reservas propias, reprogramación y cancelación |
| Administración  | `/admin`: agenda global con filtros opcionales por empresa, sala, edificio y fechas                                       |
| Administración  | `/admin/buildings` y `/admin/rooms`: altas, edición, asignación y desactivación lógica                                    |
| Administración  | `/admin/metrics`: utilización, cancelaciones, rankings, períodos de bajo uso y seguimiento comercial                      |
| Administración  | `/admin/activity`: eventos de autenticación y requests registrados en Redis                                               |

Las fechas no son obligatorias para listar reservas. El catálogo puede consultarse
sin período; para comprobar disponibilidad se eligen inicio y fin. Consultar no
bloquea la sala: la reserva se confirma al escribir en PostgreSQL y un competidor
puede recibir 409. Cancelar conserva el registro y libera el horario.

## Arquitectura y decisiones

Next.js con React/TypeScript, Fastify con Node.js/TypeScript, PostgreSQL 18 y Redis 8.
Un monorepo npm workspaces mantiene instalación, scripts y versiones coordinados.

- **Una cuenta cliente representa una empresa**, identificada por su ID de usuario
  y `business_name`. No se implementa una organización con múltiples empleados.
- **PostgreSQL es la fuente de verdad**: claves foráneas y exclusión GiST sobre
  intervalos `[inicio, fin)` impiden superposiciones; las operaciones usan transacciones.
- **Sin N+1 en las agendas**: sala, edificio y empresa se obtienen mediante JOINs,
  con filtros de propietario y paginación aplicados en SQL.
- **Separación por responsabilidad**: `http/admin`, `http/client` y catálogo de solo
  lectura; servicios y repositorios por dominio en `modules`. La autenticación
  compartida precede a los handlers y los permisos se verifican en el servidor.
- **Redis** almacena sesiones, límites, eventos de seguridad y caché de métricas.
  Los reportes se calculan en PostgreSQL y se invalidan mediante revisión
  transaccional; Redis no sustituye la persistencia de reservas.

[Arquitectura y fronteras](ARCHITECTURE.md) · [Decisiones y razonamiento](DECISIONS.md) ·
[API](BUSINESS_API.md) · [Métricas y fórmulas](METRICS.md).

## Supuestos, límites y próxima versión

Las reservas son períodos continuos de hasta 366 días, con inicio futuro; no hay
recurrencias ni horarios de apertura. La interfaz usa la zona del dispositivo,
PostgreSQL guarda instantes con zona y los reportes agregan en UTC.
La ocupación es **teórica sobre 24 horas por sala desde su alta**, incluyendo salas
hoy inactivas; no mide asistencia ni ingresos. Las oportunidades comerciales son
heurísticas visibles, no descuentos automáticos. Rankings: hasta 100 resultados.

El alcance es local: no incluye cloud, despliegue, pagos, recuperación de contraseña,
verificación de email ni MFA. No se configura confianza en proxies. Las respuestas
usan estados HTTP y mensajes; faltan códigos de aplicación y schemas de respuesta
uniformes. No se afirma seguridad absoluta ni cumplimiento exhaustivo de OWASP.

Próximos pasos: horarios comerciales e historial de cierres, varias personas por
empresa, recurrencias, contrato de respuestas uniforme, pruebas de carga y CI remoto.
La auditoría npm no encontró advisories en la última validación; **ESLint 9 sigue
fuera de soporte** y su migración compatible está pendiente. Las imágenes Docker/SO
no fueron escaneadas. [Auditoría y límites](DEPENDENCY_AUDIT.md) ·
[Revisión de seguridad](SECURITY_REVIEW.md).

## Uso de inteligencia artificial

Usé **OpenAI Codex** para implementar y refactorizar código TypeScript/SQL, generar
pruebas, ejecutar verificaciones y preparar documentación. Para acompañar la revisión
utilicé **mi propia skill `security-review`, creada por mí**, para orientar la
revisión de autenticación, permisos, criptografía, timing y pruebas de seguridad
con referencias OWASP. La dirección técnica,
las prioridades y la supervisión fueron mías; la responsabilidad sobre la entrega
no se delega a la herramienta.

Definí el stack y pedí avanzar primero con el setup, luego el modelo de negocio,
CRUD, interfaz y métricas. Mis preguntas y correcciones orientaron el resultado:
una cuenta por empresa, consultas sin N+1, escritura restringida por rol, cuatro
clases de pruebas, control previo al commit, registro de IP, revisión criptográfica,
diagnóstico de timing y auditoría de dependencias.

Corregí propuestas de IA que dejaban responsabilidades mezcladas o una experiencia
poco útil: exigí middleware compartido, separé administración y cliente, incorporé
edificios, eliminé filtros de fecha obligatorios y reemplacé una administración
centrada en logs por pantallas del negocio. También pedí explicar las reglas de
contraseña y rechacé dar por completa la revisión OWASP sin auditar dependencias.
La revisión criptográfica incluyó scrypt, comparación de hashes, contraseñas Unicode,
tokens aleatorios y claves de sesión derivadas del token mediante hash.
Las afirmaciones de funcionamiento se apoyan en pruebas ejecutadas; el diagnóstico
de timing y las auditorías tienen límites explícitos. [Detalle de decisiones](DECISIONS.md).
