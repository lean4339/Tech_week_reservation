# Revisión de seguridad / Security review

## Alcance y metodología

- Proyecto: `Tech_week_reservation`.
- Modalidad: desarrollo acompañado y revisión del árbol de trabajo, incluyendo archivos nuevos.
- Base de esta revisión previa al commit: `e95e97685885a14a417963dc6e2cc5cc705a293a`.
- Skill aplicada: `security-review`, ubicada localmente en
  `/home/leandro/Escritorio/Security_review_skill/security-review/SKILL.md`.
- Marco: **OWASP Top 10:2025**, edición publicada, vigencia comprobada el **2026-11-06**
  en el [proyecto oficial](https://owasp.org/projects/top-ten).
- Se revisaron entradas HTTP, SQL, cookies, permisos, sesiones, frontend, logs,
  migraciones, configuración, dependencias y errores. Se agregaron pruebas negativas
  y un experimento de mutación aislado. La skill queda activa en esta sesión;
  no se instaló un observador. Por pedido explícito del usuario se agregó un hook
  local pre-commit que ejecuta pruebas; no invoca automáticamente esta skill.

## Incidencias encontradas y corregidas durante la implementación

### P2 — Cierre de Redis al fallar la conexión

Confianza alta. El intento end-to-end mostró una excepción al ejecutar `QUIT`
sobre un cliente sin conexión. La inicialización ahora conecta antes de registrar
el plugin y libera el cliente mediante `disconnect` incluso cuando falla el arranque.
Evidencia de la corrección: [src/db/redis.ts](apps/backend/src/db/redis.ts).
La prueba modular simula el fallo de conexión y comprueba liberación del cliente y
ausencia de `QUIT`. Corresponde a **A10:2025**; afecta la terminación controlada y
la disponibilidad, sin demostrar un bypass de autenticación.

### P2 — Registro prematuro de login exitoso

Confianza alta. La primera implementación emitía `login_succeeded` antes de guardar
la sesión. Un fallo de escritura dejaba un evento de éxito engañoso. Ahora se registra
después de crear la sesión; si falla la auditoría, se revoca la sesión y no se envía
la cookie. Evidencia: [src/auth/routes.ts](apps/backend/src/auth/routes.ts).
Pruebas de regresión y modulares verifican tanto el fallo de sesión como el de auditoría.
Corresponde a **A09:2025 / A10:2025**. El fallo fue encontrado en código aún no confirmado.

## Cobertura de las diez categorías

“Revisada” significa controles inspeccionados y pruebas concretas en este alcance;
no significa que toda la categoría esté resuelta ni que todas sus variantes hayan
sido probadas. Los límites pendientes se indican en cada fila.

| OWASP 2025                                                                                                                    | Estado y evidencia                                                                                                                                                                                                                            | Límites                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [A01 — Broken Access Control](https://top10.owasp.org/2025/A01_2025-Broken_Access_Control/)                                   | RBAC en servidor, permisos leídos del usuario actual, rechazo de autoasignación de admin, acceso entre identidades, CSRF, protección de auditorías. Pruebas de regresión y seguridad.                                                         | No hay modelo de empresas/tenants ni permisos de reservas. No hay URLs de destino proporcionadas por el usuario que activen un flujo SSRF.                                                                                    |
| [A02 — Security Misconfiguration](https://top10.owasp.org/2025/A02_2025-Security_Misconfiguration/)                           | Esquemas estrictos, límite de cuerpo, errores genéricos, cookies, cabeceras, CORS cerrado, IP reenviada no confiable, Docker en loopback.                                                                                                     | Configuración local; falta revisar despliegue, proxy, TLS y ACL de servicios antes de producción.                                                                                                                             |
| [A03 — Software Supply Chain Failures](https://top10.owasp.org/2025/A03_2025-Software_Supply_Chain_Failures/)                 | Manifiestos y lockfile revisados; integridad de paquetes usados desde caché contrastada contra el lockfile.                                                                                                                                   | `npm audit` intentado, sin resultado por `EAI_AGAIN`. No se afirma que las dependencias estén libres de vulnerabilidades.                                                                                                     |
| [A04 — Cryptographic Failures](https://top10.owasp.org/2025/A04_2025-Cryptographic_Failures/)                                 | scrypt N=131072, r=8, p=1; salt aleatorio de 128 bits; hash de 64 bytes; comparación con `timingSafeEqual`; tokens aleatorios de 256 bits y digest SHA-256 como clave de sesión. Pruebas de sal, coste, alteración, no truncamiento y claves. | No se prueba la implementación interna de OpenSSL, el generador del SO, TLS ni cifrado de discos. HTTP solo para el modo local autorizado.                                                                                    |
| [A05 — Injection](https://top10.owasp.org/2025/A05_2025-Injection/)                                                           | SQL parametrizado inspeccionado; pruebas de rechazo de HTML, email malformado tipo SQLi, CRLF, objetos y contaminación de prototipos; JSX sin HTML crudo.                                                                                     | La prueba SQL contra PostgreSQL real está bloqueada por conexión. No hay intérpretes de shell, plantillas dinámicas, XML, LDAP ni NoSQL alimentados por el usuario. No se declara una prueba exhaustiva de XSS del framework. |
| [A06 — Insecure Design](https://top10.owasp.org/2025/A06_2025-Insecure_Design/)                                               | Admin solo por CLI, duplicados protegidos por unicidad, límites por cuenta/IP, dos hashes simultáneos como máximo, expiración de sesión y capacidad limitada de streams. Prueba de ráfaga pequeña y recuperación.                             | El rate limit local comparte la IP del proxy Next.js; ataques distribuidos y pruebas de carga extensivas quedan pendientes.                                                                                                   |
| [A07 — Authentication Failures](https://top10.owasp.org/2025/A07_2025-Authentication_Failures/)                               | Login uniforme para credenciales inválidas, hash ficticio para cuenta desconocida, rotación, revocación, vencimiento, inhabilitación, cookies y diagnóstico de timing.                                                                        | No hay MFA, verificación de email ni recuperación de contraseña. La lista de contraseñas comunes es básica. El diagnóstico no prueba ausencia de canales laterales.                                                           |
| [A08 — Software or Data Integrity Failures](https://top10.owasp.org/2025/A08_2025-Software_or_Data_Integrity_Failures/)       | Migraciones con checksum, bloqueo y transacción; JSON estricto y sesión resuelta en servidor, sin aceptar un rol del cliente.                                                                                                                 | Validación real de migraciones pendiente. No hay webhooks, cargas de ejecutables ni actualizaciones remotas para analizar. Redis/PostgreSQL pertenecen al límite de confianza local.                                          |
| [A09 — Security Logging and Alerting Failures](https://top10.owasp.org/2025/A09_2025-Security_Logging_and_Alerting_Failures/) | Eventos de autenticación y requests con IP de socket, ID, fecha, ruta de servidor, método, estado y duración; límites de retención; no cuerpos, consultas, contraseñas ni tokens. Acceso solo admin y pruebas de falsificación de IP.         | Persistencia real de streams pendiente de integración. No hay SIEM, alertas, bloqueo automático ni almacenamiento inmutable. Si falla el log HTTP posterior a la respuesta, hay fallback de metadatos a consola.              |
| [A10 — Mishandling of Exceptional Conditions](https://top10.owasp.org/2025/A10_2025-Mishandling_of_Exceptional_Conditions/)   | Denegación ante fallo de almacenamiento, tiempos límite, cierre de Redis, revocación de sesión sin auditoría y rechazo al agotar la capacidad de hashing. Pruebas con fallos inducidos.                                                       | No se simuló una partición real, agotamiento de disco ni caída del host.                                                                                                                                                      |

## Timing y criptografía

`npm run test:timing` ejecuta scrypt real con cuatro rutas inválidas: usuario
desconocido, contraseña con primer carácter incorrecto, contraseña con último
carácter incorrecto y cuenta inactiva. Realiza calentamiento, intercala casos y
conserva siete muestras por caso. En la ejecución del 2026-11-06, las medianas
fueron aproximadamente **257,2–258,3 ms**, con cociente máximo/mínimo **1,0042**.

Es un diagnóstico HTTP dentro del proceso con almacenamiento en memoria y un
umbral amplio para detectar que una ruta omitió el hash. No es un análisis
estadístico de canales laterales, no mide la base real ni la red y no garantiza
tiempo constante de toda la aplicación. La comparación del hash usa una primitiva
de tiempo constante; el flujo completo incluye I/O y trabajo variable.

## Evidencia de que una regresión detecta el defecto

Se copió el código compilado y las pruebas a un directorio temporal aislado y se
otorgaron deliberadamente permisos administrativos al rol `user`. La prueba RBAC
falló con **200 recibido frente a 403 esperado**. El árbol del proyecto no se
alteró para ese experimento. La suite sin esa mutación pasa.

## Ejecución y límites del entorno

- Suite local: **30 pruebas aprobadas**: 5 unitarias, 6 modulares, 9 de regresión
  y 10 de seguridad explícita.
- Timing: ejecutado y aprobado dentro del alcance limitado descrito arriba.
- TypeScript de ambas apps, compilación del backend, ESLint del frontend,
  formato y validación de ambos archivos Compose: aprobados.
- Integración: intentada, falla por `connect EPERM 127.0.0.1:55432`. No se cuenta como aprobada.
- E2E: cinco escenarios escritos y enumerados; ejecución intentada, detenida al no
  poder iniciar los servicios del backend. No se cuentan como escenarios ejecutados.
- Docker: acceso al socket denegado. El comando de migración tampoco pudo conectarse
  desde esta sesión; no se afirma haber verificado la tabla en la base real.
- ESLint del backend: no ejecutable por falta del paquete local `globals`, ya declarado
  en el manifiesto y lockfile. Requiere completar `npm ci` en un entorno con acceso al registro.
- Build del frontend: intentado; la ejecución hija de TypeScript mediante `spawnSync`
  recibe `EPERM`, aunque `tsc --showConfig` directo y typecheck funcionan.
- Dependencias: consulta de avisos intentada, bloqueada por resolución de red.

No hay otros fallos explotables confirmados en el código inspeccionado, pero los
bloqueos anteriores impiden cerrar la validación integral. Esto no certifica el
sistema ni afirma cobertura de todas las vulnerabilidades posibles.

## English summary

This is a working-tree review against `e95e97685885a14a417963dc6e2cc5cc705a293a`,
using the local `security-review` skill and the published OWASP Top 10:2025,
checked on 2026-11-06. This report records the pre-commit review. At the user's
explicit request, a local pre-commit hook runs automated tests; it does not invoke
the skill or replace the exact-SHA review performed after committing.

Two issues were found and fixed during implementation: shutdown attempted `QUIT`
without a live Redis connection, and successful-login auditing preceded session
persistence. Regression/module tests cover both fixes. A separate authorization
mutation was detected by the RBAC test, which rejected an unexpected 200 instead
of the required 403.

Coverage addresses authorization/CSRF, configuration, dependency integrity,
password and token cryptography, input injection, abuse controls, authentication,
migration integrity, request/authentication auditing, and failure handling. It is
partial coverage of each applicable category, not a claim to cover every vulnerability.
No tenant model, public URL fetcher, XML/LDAP/NoSQL interpreter, upload executable,
or webhook feature exists in this scope.

Request logs use the verified socket IP and ignore attacker-supplied forwarding
headers. In local mode, requests through Next.js show the local proxy IP. Logs
contain no request bodies, query strings, passwords, hashes, or bearer tokens.
Operational alerting, immutable log storage, MFA, email verification, full breached
password screening, production TLS, and production service access controls remain
outside the current implementation.

All 30 local unit/modular/regression/security tests and the separate timing diagnostic passed.
Timing medians were approximately 257.2–258.3 ms, maximum/minimum ratio 1.0042,
with seven samples per failure case. This is an in-process diagnostic using real
scrypt and in-memory storage, not proof of constant-time behavior or absence of
side channels. Real integration and five browser E2E scenarios remain unverified
because of environment restrictions. Backend lint, frontend production build,
and dependency advisory checks have the limitations listed above.

## Fuentes / Sources

- [OWASP Top 10:2025](https://top10.owasp.org/2025/)
- [Secure Code Review](https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html)
- [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
