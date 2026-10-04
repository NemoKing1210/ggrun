# Documentation

Everything that describes **how GGRun works** lives here. The root keeps only
the files that tooling and conventions expect there: [`README.md`](../README.md)
(GitHub landing), [`AGENTS.md`](../AGENTS.md) (agent guide),
[`CONTRIBUTING.md`](../CONTRIBUTING.md), [`CHANGELOG.md`](../CHANGELOG.md) and
[`LICENSE`](../LICENSE).

## Read in this order

| Doc | What it covers |
| --- | --- |
| [`DEVELOPMENT.md`](./DEVELOPMENT.md) | Architecture, layers, commands, code conventions, testing, releases |
| [`DESIGN.md`](./DESIGN.md) | The HUD design system — **read before writing any UI** |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Docker Compose & manual production deployment, env reference, troubleshooting |
| [`RUNBOOK.md`](./RUNBOOK.md) | Step-by-step host guide for event day |
| [`ITEMS_EFFECTS_EVENTS.md`](./ITEMS_EFFECTS_EVENTS.md) | Items / effects / events: concept, contracts, decisions |
| [`ITEMS_EFFECTS_SCENARIOS.md`](./ITEMS_EFFECTS_SCENARIOS.md) | **Generated** — what every item and effect promises, as executed scenarios (`pnpm scenarios:doc`) |
| [`API.md`](./API.md) | **Generated** — HTTP + realtime API reference: endpoints, error codes, Socket.IO events, models (`pnpm api:doc`; served at `/api-docs`, `/api/openapi.json`, `/api/openapi.md`) |
| [`WORKLOG.md`](./WORKLOG.md) | Work journal — what each session did and what to pick up next |

## Root docs

| Doc | What it covers |
| --- | --- |
| [`README.md`](../README.md) | Project overview, features, quick start |
| [`AGENTS.md`](../AGENTS.md) | Repository guidelines: architecture, invariants, task recipes |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Issue/PR workflow, checklist |
| [`CHANGELOG.md`](../CHANGELOG.md) | Release history + versioning rules |
