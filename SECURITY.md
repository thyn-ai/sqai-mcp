# Security Policy

## Supported Versions

Only the latest published minor release of each SQAI package receives
security fixes.

| Package | Registry |
| --- | --- |
| `@sqai/sdk` | npm |
| `@sqai/ai-sdk` | npm |
| `sqai` (CLI) | npm |
| `sqai` | PyPI |

## Reporting a Vulnerability

Email **security@thyn.ai** with a description of the issue, reproduction
steps, and the affected package/version. Do not open a public issue for
security reports. We aim to acknowledge reports within 72 hours.

## Scope notes

- SQAI packages are read-only by design: they expose no write path to
  connected data sources.
- The managed runtime bundle is signed; the verifying public keys are pinned
  inside the packages (see `docs/licensing.md`). Report any case where an
  unsigned or tampered bundle is accepted as a critical vulnerability.
- Model-supplied tool input must never be able to widen configured policy
  (sources, fields, functions, limits). Report any bypass as critical.
