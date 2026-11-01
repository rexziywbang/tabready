# TABReady

**Turn HVAC airflow spreadsheets into a reviewable, versioned report package.**

TABReady is a local demo for HVAC Test & Balance (TAB) workflows. Import Excel outlet readings, inspect deterministic readiness checks, resolve exceptions, and generate a report snapshot that stays unchanged as the working data evolves.

**Stack:** TypeScript · Next.js · React · Tailwind CSS · SQLite · Drizzle ORM · SheetJS · Zod · Vitest

[Quick start](#quick-start) · [Demo workflow](#demo-workflow) · [Architecture](#architecture) · [Detailed demo guide](docs/demo-guide.md)

## What it demonstrates

- **Import with review:** detect worksheet headers, suggest field mappings, and preview compatible airside outlet sheets before committing.
- **Explainable checks:** flag missing readings, duplicate outlet IDs, calibration issues, out-of-tolerance values, and system-total mismatches through versioned rules.
- **A persistent exception queue:** acknowledge warnings or resolve findings with a reviewer name and note; matching dispositions survive re-checks and re-imports.
- **Immutable reports:** create numbered snapshots with summaries, instrument tables, system sheets, and findings, plus a browser print view for PDF export.
- **Local operation:** keep data in SQLite with no API keys or AI calls required at runtime.

## Quick start

Requires **Node.js 22+** and **pnpm**.

```sh
git clone https://github.com/rexziywbang/tabready.git
cd tabready
pnpm install --frozen-lockfile
pnpm demo
```

Open **[http://localhost:3000](http://localhost:3000)**.

`pnpm demo` resets `data/tabready.db`, regenerates the synthetic workbook, seeds the demo project and instrument registry, and starts the development server. To resume an existing local database, use `pnpm dev`.

## Demo workflow

1. Open **Riverside Medical Office Building** and choose **Import data**.
2. Select [`fixtures/riverside_medical.xlsx`](fixtures/riverside_medical.xlsx), review the detected sheets and mappings, and commit the 60 synthetic outlet rows.
3. Inspect the exception queue, acknowledge a warning, and resolve a finding with a note.
4. Re-run checks to see the reviewer dispositions retained.
5. Generate report version 1 and open the print view. Generate version 2, then reopen version 1 to inspect the unchanged snapshot.

The [detailed demo guide](docs/demo-guide.md) explains the fixture's expected findings and how the importer handles real workbook structures.

## Architecture

```text
Excel workbook → header and mapping review → validated import
                                                    ↓
                                              SQLite dataset
                                                    ↓
Versioned readiness rules → exception review → report snapshot
```

| Area | Start here |
| --- | --- |
| Workbook parsing and mapping | [`src/import`](src/import) |
| Deterministic readiness rules | [`src/rules`](src/rules) |
| Database schema and queries | [`src/db`](src/db) |
| Report snapshot assembly | [`src/report/assemble.ts`](src/report/assemble.ts) |
| Import review interface | [`app/projects/[id]/import/import-wizard.tsx`](app/projects/%5Bid%5D/import/import-wizard.tsx) |
| Import, rules, and snapshot tests | [`tests`](tests) |

The server reparses each workbook and validates confirmed mappings. An import replaces the working dataset transactionally while retaining matching review decisions and existing report versions.

## Project scope

This is a **local, single-tenant demo** using entirely synthetic project names, people, instruments, and readings. Authentication, multi-tenancy, cloud deployment, and e-signatures are outside its current scope.

TABReady checks report readiness; a qualified professional remains responsible for measurements, conclusions, and certification decisions.

## Development checks

```sh
pnpm check
pnpm build
```

`pnpm check` runs strict TypeScript checking and Vitest suites for imports, mapping, readiness rules, review-state preservation, and report snapshot integrity.
