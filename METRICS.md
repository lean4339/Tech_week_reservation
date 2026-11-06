# Métricas de utilización / Utilization metrics

## Español

Abrí **Métricas** en la navegación del admin (`/admin/metrics`). El tablero carga
los últimos 30 días de calendario UTC, incluido el día actual, sin pedir filtros.
Permite cambiar a 7, 90 o 365 días, o elegir hasta 366 días personalizados. Las
fechas del formulario incluyen el último día; la API usa un fin exclusivo.

GET/HEAD `/admin/metrics` requiere sesión válida y permiso `admin:read`, incluso
si el resultado ya existe en Redis. `from` y `to` son timestamps ISO con zona y
se deben enviar juntos o ambos omitirse. Campos adicionales se rechazan. Las
respuestas HTTP son `no-store`; el cliente nunca accede directamente a Redis.

### Qué se calcula

- Horas reservadas: suma de la intersección de cada reserva no cancelada con
  `[from, to)`. Una reserva que atraviesa el límite aporta solamente sus horas
  dentro del período. No mide asistencia ni ingresos.
- Reservas: cantidad de reservas no canceladas que intersectan el período.
- Cancelaciones: reservas canceladas que intersectan el período por su horario
  previsto, independientemente de cuándo se hizo la cancelación.
- Tasa de cancelación: canceladas / (canceladas + no canceladas), o 0 si no hay
  reservas. Se expresa como porcentaje.
- Capacidad teórica: 24 horas diarias por sala registrada, recortadas por su fecha
  de creación y por el período. Incluye salas hoy inactivas; no inventa un historial
  de horarios de apertura, cierres o inactivaciones que todavía no registramos.
- Ocupación teórica: horas reservadas / capacidad teórica, o 0 si no hay capacidad.
  No debe interpretarse como ocupación comercial sobre horarios de apertura.
- Totales por sala, edificio y empresa; empresas con reservas; última fecha de
  inicio de reserva no cancelada anterior al fin del período, por empresa.
- Serie diaria con días sin reservas, y horas reservadas por franja horaria UTC
  de 00 a 23. El tablero destaca hasta siete días con menor ocupación y capacidad
  mayor que cero. Las franjas horarias suman uso, no porcentajes de ocupación.

Los rankings muestran como máximo 100 filas por categoría, ordenadas por horas y
un identificador estable. Los totales incluyen todos los registros. Los edificios
sin salas no tienen capacidad y no aparecen en el ranking. Empresas sin reservas
pueden aparecer con cero uso; los nombres y estados corresponden a los registros
actuales, no a un historial de cambios. Las sugerencias comerciales son heurísticas
visibles: tres o más reservas para cliente frecuente; cero en el período con
historial para reactivación; sin historial para bienvenida. No aplican descuentos.

### PostgreSQL y Redis

PostgreSQL conserva las reservas y calcula el reporte en una transacción de lectura
`REPEATABLE READ`, con zona UTC y timeout de consulta de 5 segundos. Los agregados
usan una consulta con CTE y JOIN, sin consultas individuales por sala o empresa.
Los porcentajes y horas se redondean a dos decimales al devolver el reporte.

Redis almacena el JSON completo por **60 segundos**:

```text
tech-week:metrics:v1:<generation>:<revision>:<hash-del-período>
```

La migración `006_metrics_revision.sql` crea una versión y triggers transaccionales
sobre reservas, salas, edificios y cuentas. La `007_metrics_generation.sql` agrega
un identificador propio de la base para separar sus resultados en Redis. Cambios
confirmados avanzan la versión; un rollback no la avanza. Se comprueba la versión
en PostgreSQL antes de leer la caché. Un cálculo concurrente guarda el reporte con
la versión de su propio snapshot, nunca con una versión posterior. Una lectura
concurrente a una escritura puede devolver su snapshot anterior; las lecturas que
comienzan después del commit usan la nueva versión.

Las claves viejas vencen solas. Solicitudes simultáneas del mismo período y versión
comparten el cálculo dentro de cada proceso. Perder la caché no pierde métricas:
se reconstruyen desde PostgreSQL. Un fallo exclusivo de caché permite el cálculo;
una caída de Redis que impide autenticar la sesión sigue rechazando el acceso.
No se ignoran errores de autenticación ni de PostgreSQL. No se almacenan cookies,
contraseñas ni emails en los reportes; sí nombres e identificadores de empresas.

No se agregó un worker, servicio Docker ni dependencia. `npm run db:migrate`
aplica las migraciones; el arranque también las ejecuta. El contador de versión
serializa brevemente las escrituras: para altos volúmenes habrá que medir este
punto y el costo de agregación. No se hizo una prueba de carga masiva.

## English

Open **Métricas** at `/admin/metrics`. The administrator dashboard defaults to the
last 30 UTC calendar days, including today, without requiring filters. Presets
cover 7, 30, 90 and 365 days; custom ranges allow up to 366 days.
GET/HEAD `/admin/metrics` requires authentication and `admin:read` before accessing
cache or data. Optional ISO timestamp `from`/`to` parameters must be supplied
together. The API uses an exclusive end; the date form includes its last day.

Booked hours are non-cancelled reservation durations clipped to the selected
period. Counts include intersecting reservations; cancellations use their scheduled
period, not the cancellation event date. Cancellation rate divides cancelled
bookings by all intersecting bookings. Theoretical capacity counts each registered
room 24 hours per day from its creation date, including currently inactive rooms.
Theoretical occupancy divides booked hours by that capacity. This is not commercial
opening-hours occupancy, attendance or revenue.

Reports include room/building/company rankings, daily usage with zero-booking days,
hour-of-day usage in UTC, active client counts and last non-cancelled reservation
start before the period ends. Rankings are capped at 100 rows per category;
totals cover all records. Buildings without rooms are omitted. Commercial follow-up
labels are transparent heuristics, not automatic promotions: at least three bookings
for frequent clients, no use with history for reactivation, no history for welcome.

PostgreSQL computes aggregates in one CTE/JOIN query within a read-only repeatable
read transaction (UTC, 5-second statement timeout). Redis caches report JSON for
60 seconds using database generation, transactional revision and normalized period
hash. Migrations 006/007 install the revision triggers and database identifier.
Committed writes invalidate earlier generations of results; rolled-back writes do
not. Each calculation writes its own snapshot revision, preventing a late old
calculation from overwriting the current report. Concurrent requests in one process
share calculations. Old keys expire; cache loss rebuilds reports from PostgreSQL.
Authentication still fails closed when its Redis session store is unavailable.
Reports contain business names/IDs but no passwords, cookies or emails.

No additional worker, Docker service or dependency is required. The transactional
revision counter briefly serializes writes; high-volume performance needs load
measurement. No historical opening-hours model or large-scale load certification
is provided.
