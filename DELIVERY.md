# Guía de evaluación / Evaluation guide

Entrega del challenge **Desarrollador Senior Full Stack — Fontanella SRL**.
La guía toma como referencia los ocho apartados del PDF provisto y describe la
implementación entregada, sus decisiones y la forma de verificarla.

## Español

### Recorrido funcional

Seguí el setup del [README](README.md). La base inicial está vacía: no hay cuentas,
contraseñas compartidas ni datos de negocio precargados.

1. Creá un admin con `npm run admin:create` e iniciá sesión en `/login`.
2. En **Edificios**, creá «Sede Centro», dirección «Calle de ejemplo 123».
3. En **Salas**, creá tres salas asignadas a esa sede:

   | Sala         | Capacidad |
   | ------------ | --------- |
   | Reuniones    | 6         |
   | Capacitación | 12        |
   | Directorio   | 8         |

4. En perfiles de navegador separados, registrá dos empresas mediante `/signup`,
   por ejemplo «Empresa A» y «Empresa B», con emails de prueba distintos. Elegí
   contraseñas propias de al menos 15 caracteres e iniciá sesión en cada perfil.
5. Como Empresa A, abrí el catálogo y reservá Reuniones mañana de 10:00 a 11:00
   en tu zona local. La interfaz debe confirmar la operación.
6. Como Empresa B, consultá ese mismo período: la sala no debe estar disponible.
   Intentar reservarla directamente debe mostrar el conflicto. Sus listas de
   reservas no deben mostrar los registros privados de Empresa A.
7. Como admin, abrí la agenda sin completar fechas. Filtrá por sala o empresa;
   comprobá que se ve el nombre de la sala, edificio y empresa. También podés
   reprogramar o cancelar reservas desde la administración.
8. Como Empresa A, cancelá su reserva. Debe conservarse en el filtro de canceladas.
   Como Empresa B, reservá el intervalo liberado: ahora debe confirmarse.
9. Como admin, abrí **Métricas** y elegí un período que incluya la fecha de las
   reservas del ejemplo. Revisá horas, cancelaciones y desgloses por sala, edificio
   y empresa. El período por defecto termina al finalizar el día actual UTC;
   una reserva de mañana puede requerir un rango personalizado.
10. Para observar sugerencias de seguimiento, creá tres reservas no superpuestas
    para una empresa dentro del período seleccionado. Las reglas de cliente
    frecuente/bienvenida/reactivación son heurísticas explicadas, sin aplicar descuentos.
11. Detené y reiniciá la aplicación y los servicios con `npm run db:down`,
    `npm run db:up` y `npm run dev`: las reservas se conservan en el volumen PostgreSQL.
    Consultá la agenda tras iniciar sesión. No elimines los volúmenes durante esa prueba.

La simultaneidad se verifica automáticamente en integración: dos solicitudes para
la misma sala y período dejan exactamente una reserva, y la otra recibe un conflicto.
El recorrido manual no pretende reproducir una carrera de forma determinista.

### Correspondencia con el enunciado

| Necesidad                           | Implementación y evidencia                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Consultar salas/disponibilidad      | Catálogo y endpoint por período; E2E de consulta y reserva directa                                           |
| Reservar fecha y período            | Instantes con zona, inicio futuro, intervalo válido y exclusión de solapamientos                             |
| Consultar/cancelar reservas propias | Rutas cliente, identidad de sesión y filtros de propietario en SQL; pruebas IDOR                             |
| Comprender resultados               | Confirmaciones, errores visibles y HTTP 409 por conflicto; validación de entradas                            |
| Impedir solapamientos simultáneos   | Exclusión GiST y transacciones; pruebas de inserción y reprogramación concurrentes                           |
| Persistencia                        | PostgreSQL y volúmenes Docker; migraciones versionadas, no almacenamiento en memoria                         |
| Separación de empresas              | Una cuenta por empresa; permisos de servidor, no solo controles visuales                                     |
| Visión administrativa               | Edificios, salas, agenda global y directorio de empresas; JOINs sin N+1                                      |
| Métricas y decisiones comerciales   | Horas, ocupación teórica, cancelaciones, rankings, días/franjas y heurísticas de seguimiento                 |
| Crecimiento desde tres salas        | Altas por interfaz, FKs, índices y paginación; sin un límite fijo de tres salas                              |
| React/Node con TypeScript           | Next.js y Fastify, compilación estricta en ambas aplicaciones                                                |
| Pruebas automatizadas               | Unitarias, modulares, regresión, integración y E2E; scripts en la raíz                                       |
| Decisiones, supuestos y límites     | [DECISIONS.md](DECISIONS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [METRICS.md](METRICS.md)                   |
| Uso de IA y supervisión             | Sección explícita en ambos README: Codex, skill propia del autor, propuestas corregidas y motivos            |
| Historial significativo             | Commits de setup, autenticación, producto, frontend, métricas, dependencias, refactorización y documentación |

### Validación de entrega

Fecha: **2026-11-06**. Código funcional validado desde un clon local limpio del
commit `38cb675` (refactorización de módulos). Los cambios posteriores de esta
preparación son documentación. Entorno: Node 24, npm 11, PostgreSQL/Redis en servicios
de prueba aislados y Chromium de Playwright.

| Verificación ejecutada                      | Resultado                                        |
| ------------------------------------------- | ------------------------------------------------ |
| `npm ci` desde clon limpio                  | Aprobada; hook local instalado                   |
| `npm run check`                             | ESLint, TypeScript y formato aprobados           |
| `npm run build`                             | Ambas aplicaciones compiladas                    |
| `npm test`                                  | 63 pruebas backend + 4 frontend aprobadas        |
| `npm run test:timing`                       | 1 diagnóstico aprobado                           |
| `npm run test:integration`                  | 24 pruebas aprobadas con PostgreSQL/Redis reales |
| `npm run test:e2e`                          | 11 recorridos aprobados en navegador             |
| Auditoría npm completa dentro de `test:all` | 0 advisories reportados                          |

También se verificó `npm run admin:create` en una terminal interactiva contra la
base de prueba: política visible, entrada oculta y alta exitosa. Una comprobación
HTTP adicional creó edificio, sala y reserva, cerró completamente el backend y
lo inició de nuevo: la reserva y la sesión Redis siguieron disponibles, y el admin
pudo consultar las métricas. Todos esos datos fueron sintéticos y aislados.

Las suites se solapan por propósito; no se suman unitarias, modulares y seguridad
como si fueran pruebas diferentes. El timing es diagnóstico, no una demostración
formal contra canales laterales. La auditoría npm no cubre vulnerabilidades
desconocidas ni las imágenes Docker/SO; el soporte de ESLint sigue pendiente.
Los límites completos están en [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md).

### Material de entrega

El entregable pedido es el repositorio Git. Incluye fuente, migraciones, tests,
README bilingüe, instrucciones de ejecución y las decisiones documentadas. No
requiere adjuntar chats, prompts, entornos privados ni la skill personal del autor.
El evaluador puede ejecutar todas las pruebas sin herramientas de IA.

## English

Follow [README.en.md](README.en.md) for installation. The database starts empty.
Create an admin locally, then one building and three rooms (suggested capacities:
6, 12 and 8). Register two client companies in separate browser profiles. Book a
future one-hour period as Company A; Company B should see it unavailable and receive
a conflict if it attempts the same booking. Company B must not see A's private
bookings. The admin can inspect and filter the global agenda without mandatory dates.

Cancel A's booking, verify its cancelled history and book the released interval
as B. Inspect metrics using a range that includes the booking date; the default
range ends at the end of today UTC, so tomorrow's booking may need a custom range.
Three non-overlapping bookings for one company demonstrate the frequent-client
heuristic. Restart the application and containers while retaining volumes to
verify persistent data. Concurrent races are covered by automated integration tests.

The implementation maps to all required functional areas: availability, bookings,
cancellation, feedback, concurrent exclusion, persistence, company isolation,
administrative overview and proposed usage metrics. Growth uses managed entities,
indexes and pagination rather than a fixed three-room limit. Large-scale load
performance has not been certified.

On 2026-11-06, a clean local clone of code commit `38cb675` passed `npm ci`,
checks/build and the full suite: 63 backend + 4 frontend tests, 1 timing diagnostic,
24 integration tests and 11 browser tests. The full npm audit reported zero
advisories. Interactive admin creation and an additional HTTP booking/session
persistence check across a complete backend restart also passed in the isolated
test environment. Subsequent delivery changes are documentation. EOL tooling, container
scan gaps and timing limits remain explicit.

The Git repository is the deliverable: code, migrations, tests, bilingual README,
architecture, assumptions and limitations. The README explicitly records Codex
usage, the author's own security-review skill, cryptographic/timing checks, and
his planning decisions and corrections to AI-generated proposals. No chats,
private environment files or personal skill installation are required to evaluate
or run the application. See [DECISIONS.md](DECISIONS.md) for the technical reasoning.
