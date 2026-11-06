# Decisiones técnicas y supervisión de IA / Design decisions and AI supervision

## Español

La dirección técnica fue de Leandro. Este registro resume sus preguntas,
restricciones y correcciones durante el desarrollo, junto con la solución adoptada.
Codex asistió con implementación, refactorización, pruebas y documentación. No se
adjuntan conversaciones ni historiales de prompts; se documentan decisiones que
el autor puede explicar y defender en la entrevista.

### Cómo se planificó

Primero se acotó el setup: Next.js, Fastify, TypeScript en ambas aplicaciones,
ESLint/Prettier, PostgreSQL en Docker y Redis para sesiones y logs. Después se
trabajó sobre autenticación, modelo de reservas, permisos CRUD, interfaz operativa
y métricas. Las revisiones de arquitectura, pruebas y seguridad acompañaron esos
incrementos. El objetivo fue hacer verificables las reglas críticas antes de
ampliar funciones secundarias.

| Pregunta o corrección del autor                                                                 | Decisión y motivo                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Definir el stack y no desarrollar funciones antes del setup                                     | Monorepo npm workspaces con Next.js/Fastify y TypeScript estricto; scripts comunes para ejecutar y verificar ambas apps                                                                       |
| Las compañías son las cuentas; no hacen falta empleados por compañía                            | Una cuenta `user` es una empresa; `business_name` identifica su nombre comercial. Se evita una jerarquía de organizaciones que esta versión no necesita                                       |
| El admin necesita saber qué sala está reservada y filtrar por sala, fecha o empresa; evitar N+1 | Reserva relacionada con sala y propietario mediante FKs; JOINs recuperan la agenda completa en consultas acotadas. La ubicación de la FK por sí sola no evita N+1: lo decisivo es la consulta |
| ¿Hace falta una tabla de unidades de tiempo?                                                    | Intervalos `timestamptz` continuos y `[inicio, fin)`; sin tabla de slots. Permite duraciones arbitrarias y reservas adyacentes sin materializar cada unidad                                   |
| Las salas pertenecen a edificios                                                                | Tabla de edificios y relación con salas mediante migración; la migración conserva historial y no inventa direcciones para registros anteriores                                                |
| Solo administración modifica el catálogo; cada cliente escribe sus reservas                     | Autenticación compartida, permisos por operación y propietario tomado de sesión. SQL aplica el alcance tanto en lecturas como en modificaciones                                               |
| La aplicación concentraba responsabilidades y mezclaba admin con producto                       | Rutas explícitas de administración/cliente/catálogo y modelos, servicios y repositorios por dominio. Reglas de disponibilidad y concurrencia compartidas, sin duplicarlas por perfil          |
| Un panel de logs no resuelve la administración del negocio                                      | Agenda global, gestión de edificios/salas y métricas; los logs quedan como herramienta secundaria en Actividad                                                                                |
| Demasiados pasos y filtros de fecha obligatorios                                                | Listas al entrar, filtros opcionales, reserva directa y diálogos con errores en contexto                                                                                                      |
| La contraseña tiene reglas: hay que explicarlas                                                 | El comando de alta de admin anuncia la política, distingue errores y reintenta sin mostrar la contraseña                                                                                      |
| Pedir pruebas unitarias, modulares, de regresión y E2E, y ejecutarlas antes de commitear        | Suites separadas por propósito, integración con PostgreSQL/Redis reales y hook local. Integración/E2E y lint se ejecutan aparte del hook                                                      |
| Revisar seguridad con mi propia skill, incluyendo IP, timing y criptografía                     | Skill propia `security-review`, referencias OWASP y casos negativos sobre la aplicación real; IP del socket, límites, sesiones, KDF y diagnóstico temporal                                    |
| OWASP no está completo sin revisar dependencias                                                 | Auditoría npm completa y de producción, corrección de minimatch y auditoría incorporada a precommit. El estado EOL de ESLint permanece explícito                                              |
| Usar Redis para las métricas                                                                    | PostgreSQL calcula los agregados y Redis almacena la caché; revisión transaccional y generación por base evitan reutilizar reportes obsoletos o de otra instancia                             |

### Garantías del negocio y alternativas

**Concurrencia.** Consultar disponibilidad y luego insertar sin restricción deja una
carrera. PostgreSQL aplica una exclusión GiST por sala e intervalo para todas las
reservas no canceladas. Las transacciones bloquean y vuelven a comprobar sala y
edificio; un conflicto devuelve 409. Cancelar marca el registro y libera el rango.
La disponibilidad previa es informativa, no una retención temporal.

**Aislamiento.** La API no acepta un propietario arbitrario en las operaciones de
cliente. Los accesos ajenos y los IDs inexistentes responden igual. La administración
usa rutas explícitas y permisos antes de leer o modificar información global.
Los controles del frontend no sustituyen los del backend. No se implementa RLS ni
una cuenta PostgreSQL por empresa; la restricción se aplica en la API y sus consultas.

**Métricas.** El tablero aporta horas, cancelaciones, rankings y uso diario/horario.
Las recomendaciones comerciales distinguen clientes frecuentes, reactivación y
bienvenida mediante reglas simples visibles. No hay datos para calcular ingresos,
asistencia real u ocupación sobre horarios comerciales; se documenta la base teórica
24 horas para no presentar una precisión inexistente. La caché mejora lecturas,
pero la durabilidad y el cálculo pertenecen a PostgreSQL.

### Skill propia, criptografía y seguridad

Leandro utilizó su propia skill **`security-review`**, creada por él, para dirigir
el análisis y exigir evidencia sobre la frontera de autenticación, roles, efectos
protegidos y casos adversos. Es una herramienta de trabajo del autor, no una
dependencia necesaria para ejecutar la solución. Las pruebas automatizadas están
incluidas en el repositorio y pueden ejecutarse sin esa skill ni Codex.

Las comprobaciones criptográficas cubren el costo configurado de **scrypt**, salts,
comparación de hashes, rechazo de formatos manipulados, contraseñas completas con
Unicode y NUL, tokens aleatorios y claves de Redis derivadas por hash. El diagnóstico
de timing compara caminos de login desconocido, inactivo y contraseña incorrecta
con scrypt real. El control de concurrencia del hashing limita consumo de recursos.
Las sesiones se rotan, vencen y se revocan; no se escriben contraseñas o tokens en logs.

La revisión incluyó IDOR, elevación de privilegios, CSRF, SQL parametrizado, XSS,
IP falsificada, límites de requests y fallos de almacenamiento. Se verificó el uso
local: no se confía en cabeceras de proxy para obtener la IP. Tras la corrección
solicitada por el autor, la revisión de dependencias dejó de quedar fuera de la
validación. Que los tests y npm audit pasen no demuestra ausencia de vulnerabilidades,
canales laterales o riesgos de infraestructura. Ver [SECURITY_REVIEW.md](SECURITY_REVIEW.md)
y [DEPENDENCY_AUDIT.md](DEPENDENCY_AUDIT.md).

### Límites aceptados y evolución

- Un usuario por empresa. Una próxima versión separaría organización y membresías
  si aparecen empleados, invitaciones o permisos internos.
- Reservas continuas, futuras y de hasta 366 días; sin recurrencias ni apertura/cierre.
  La agenda admite filtros sin fechas. Los reportes usan períodos acotados.
- Desactivación lógica y conservación de historia; sin borrado físico de negocio.
- Los estados HTTP, schemas de entrada y mensajes funcionan; faltan códigos de
  aplicación y schemas uniformes de respuesta. Es una mejora de contrato identificada.
- Sesiones locales seguras dentro del alcance probado, sin email verificado, MFA,
  recuperación de contraseña ni infraestructura productiva.
- Medir carga antes de escalar: contador global de revisión de métricas, agregación
  histórica y límites de listados son puntos a revisar. No se afirma haber probado
  alta concurrencia masiva ni escalabilidad ilimitada.
- CI remoto, escaneo de contenedores y migración compatible de ESLint EOL quedan
  pendientes. No se desactivaron reglas ni se forzaron peers para ocultar ese límite.

## English

Leandro directed the work; Codex assisted with implementation, refactoring, tests
and documentation. His planning started with a bounded stack setup, then moved
through authentication, business modeling, role-restricted CRUD, practical screens
and metrics. Architecture and security were reviewed as the implementation evolved.

His questions and corrections led to one client account per company, a business
name, explicit buildings, JOIN-based agendas without N+1 queries, and continuous
intervals rather than a slot table. PostgreSQL exclusion and transactional locking
address concurrent overlaps; cancellation preserves history. Ownership comes from
the session and is included in SQL predicates. Administrator and client HTTP
adapters are separate while domain rules retain one implementation.

He corrected a logs-centered administration view, mandatory date filters, mixed
responsibilities and unclear password requirements. He requested unit, modular,
regression and E2E tests, local pre-commit checks, and real database integration.
He also required Redis-based metrics caching with PostgreSQL as the source of truth.

The author used **his own `security-review` skill, which he created**, to guide
OWASP-based authentication, authorization, cryptography, timing and negative-test
reviews. The skill is not a runtime dependency: included tests run independently.
Cryptographic checks cover scrypt cost and salts, hash comparison, manipulated
formats, complete Unicode/NUL passwords, random tokens and hashed session keys.
Timing diagnostics exercise real scrypt but do not prove the absence of side channels.
Socket IP logging, spoofed-header rejection, rate limits, storage failures, IDOR,
CSRF and XSS also receive explicit coverage.

A dependency audit was added after the author challenged an incomplete OWASP review;
minimatch was patched, and audits now run before commits. ESLint EOL and the lack of
container/OS scanning remain documented. Theoretical occupancy is explicitly based
on 24-hour room capacity; no attendance, revenue or opening-hours data is invented.

Next-version work includes multi-user companies, opening hours/closure history,
recurrence, consistent response codes/schemas, production authentication features,
remote CI and measured load/scalability improvements. The implementation and its
tradeoffs remain the author's responsibility, regardless of AI assistance.
