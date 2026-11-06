# Auditoría de dependencias / Dependency audit

Fecha / Date: **2026-11-06**. Árbol de trabajo actual, incluyendo frontend,
backend y herramientas de desarrollo; no atribuido a un commit nuevo.

## Resultado y corrección

La primera auditoría completa `npm audit --json` encontró **8 entradas moderadas**
propagadas por **un aviso**: [GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249).
El componente vulnerable era `minimatch@10.2.6`, transitivo de
`@typescript-eslint/typescript-estree@8.72.1`. El aviso afecta versiones desde
7.0.0 hasta antes de 11.0.1: amplificación de patrones con `optimizationLevel >= 2`,
capaz de consumir CPU/memoria. Está corregido en
[minimatch 11.0.1](https://github.com/isaacs/minimatch/releases/tag/v11.0.1).

La cadena se usa en desarrollo/lint, no en los endpoints de la aplicación. El
consumidor inspeccionado invoca `minimatch(filePath, pattern, { dot: true })`, sin
activar `optimizationLevel: 2`. No se demostró explotación mediante la API web.
Esto delimita la exposición; no fue motivo para ignorar el aviso.

Se agregó un override **limitado a `@typescript-eslint/typescript-estree`** para
usar `minimatch@11.0.1` y se actualizó `package-lock.json`. Se conservó `minimatch`
3.1.5 en las demás cadenas: ese rango no está afectado por este aviso. La última
versión disponible de typescript-estree, 8.72.1, aún declara minimatch `^10.2.2`.
El override cruza una versión mayor: se comprobó Node 24 compatible, API del
consumidor, lint, tests y compilación. Debe retirarse cuando el paquete padre
adopte una versión corregida compatible. No se ejecutó `npm audit fix --force`;
su propuesta incluía downgrades de otras dependencias.

Después de la corrección:

- Auditoría completa, incluyendo desarrollo, opcionales y peers: **0 hallazgos**.
- Auditoría `--omit=dev`: **0 hallazgos**.
- Metadata npm: 529 dependencias contabilizadas; las categorías pueden solaparse.
- `npm audit signatures`: **447 paquetes con firma de registro verificada** y
  **117 con atestaciones verificadas** en la instalación de esta plataforma.
- Orígenes de paquetes externos en el lockfile: registro oficial npm por HTTPS y
  campos de integridad SHA-512. Los enlaces locales son los workspaces esperados.
- SBOM CycloneDX 1.5 generado desde el lockfile: **514 componentes**. Los conteos
  de SBOM, auditoría y firmas tienen alcances distintos y no son intercambiables.
- Instalación limpia en directorio temporal mediante `npm ci --ignore-scripts`
  aprobada. No se borró el `node_modules` del servidor de desarrollo. Se verificó
  la resolución de minimatch 11.0.1 y sus resultados desde el consumidor real.
- ESLint, TypeScript, formato, hook, **61 tests backend + 4 frontend + 1 timing**
  y compilación de ambas aplicaciones aprobados. Integración/E2E no se repitieron
  en esta tanda: el cambio resuelto es de tooling, no de dependencias de ejecución.

## Hallazgo pendiente: soporte de ESLint

**ESLint 9.39.5 está EOL desde el 2026-08-06**, según la
[política oficial de soporte](https://eslint.org/version-support/). No equivale a
una vulnerabilidad explotable demostrada ni aparece como CVE en esta auditoría,
pero es un riesgo de mantenimiento de A03 y **no se considera resuelto**.

La versión actual 10.14.0 soporta Node 24; typescript-eslint y eslint-config-next
permiten ESLint 10. Sin embargo, los plugins actuales que trae la configuración
Next aún declaran peers que terminan en ESLint 9:

| Paquete                | Versión consultada | Máximo mayor declarado en peer de ESLint |
| ---------------------- | ------------------ | ---------------------------------------- |
| eslint-plugin-react    | 7.37.5             | 9                                        |
| eslint-plugin-import   | 2.32.0             | 9                                        |
| eslint-plugin-jsx-a11y | 6.10.2             | 9                                        |

No se forzaron peers ni se retiraron reglas para aparentar una migración exitosa.
Pendiente: adoptar versiones compatibles de esos plugins o migrar la configuración
con validación equivalente antes de retirar ESLint 9. La auditoría de advisories
por sí sola no identifica este estado de soporte.

## Control permanente

`npm run test:dependencies` ejecuta la auditoría completa y falla con severidad
low o superior. Está incluido al inicio de `test:security`, `test:all` y
`test:precommit`. Requiere acceso al registro: un error de red también falla, no
se interpreta como cero vulnerabilidades. `test:dependencies:prod` permite revisar
el alcance de ejecución por separado. Firmas y SBOM se pueden repetir con:

```bash
npm audit signatures
npm sbom --package-lock-only --sbom-format=cyclonedx > sbom.cdx.json
```

## Alcance OWASP y límites

Se consultó [A03:2025 Software Supply Chain Failures](https://top10.owasp.org/2025/A03_2025-Software_Supply_Chain_Failures/)
y la [guía de gestión de dependencias](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html).
La revisión anterior dejó esta categoría incompleta; los tests funcionales y de
seguridad de la aplicación no sustituían este análisis.

El resultado cubre el ecosistema npm y el lockfile de la aplicación. No certifica
paquetes contra vulnerabilidades desconocidas o código malicioso sin aviso.
Las firmas verifican procedencia/integridad, no ausencia de fallos. No hay workflows
CI en `.github` en este repositorio. Solo es control local, no una política remota.
No se escanearon las imágenes Docker ni el sistema operativo en esta tanda: no
hay Trivy disponible ni plugin Docker Scout instalado. No se presenta este resultado
como auditoría completa de toda la infraestructura o de todo OWASP Top 10.

## English

The initial full npm audit found eight moderate entries propagated from one advisory,
GHSA-g3hv-75wg-m249, in minimatch 10.2.6 under typescript-estree. A scoped override
now resolves 11.0.1, with a lockfile update. The caller is lint tooling and does not
set the vulnerable optimization level; no web API exploit was demonstrated.
The override crosses a major version and was validated with a clean isolated install,
consumer API checks, lint, TypeScript, 65 local tests, one timing diagnostic and
both builds. Full and production-only audits now report zero advisories. npm verified
447 registry signatures and 117 attestations; a CycloneDX 1.5 SBOM contains 514
components. Counts refer to different inventories/platform scopes.

An unresolved maintenance finding remains: ESLint 9 is end-of-life. Current React,
import and accessibility plugins still declare peers through ESLint 9. No peers
were forced and no checks removed. Migrate compatibly rather than treating the
zero-advisory count as proof of full supply-chain health.

Full npm auditing now precedes security, full-suite and pre-commit commands;
registry failures fail the check. Container/OS scanning was not performed because
Trivy and Docker Scout are unavailable. This is a scoped npm audit, not an exhaustive
OWASP certification. Official sources and reproducible commands are linked above.
