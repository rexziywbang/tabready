# TABReady

TABReady is a local, single-tenant demo application for HVAC Test & Balance
(TAB) firms. It imports existing Excel outlet readings, runs deterministic
report-readiness checks, gives a reviewer an exception queue, and generates
immutable versioned report packages.

TABReady checks readiness; it does not make a certification decision. A
qualified professional remains responsible for measurements, conclusions, and
final review.

## Synthetic demo data

The included **Riverside Medical Office Building** project, client, technician
names, serial numbers, and workbook readings are entirely fictional and
synthetic. They exist only to demonstrate the workflow. The app labels this in
the global header, project card, project workspace, import wizard, and workbook
metadata. Do not substitute real customer data without appropriate
data-handling terms and safeguards.

## Requirements

- Node.js 20 or newer
- pnpm

## Three commands

```bash
pnpm install
pnpm demo
pnpm check
```

- `pnpm install` installs the local dependencies.
- `pnpm demo` resets `data/tabready.db`, creates the synthetic Excel fixture,
  seeds the fictional project and instrument registry, and starts the
  development server.
- `pnpm check` runs strict TypeScript checking followed by all Vitest suites.

Open [http://localhost:3000](http://localhost:3000) after `pnpm demo`.

## Ten-minute demo path

1. Open the pre-seeded **Riverside Medical Office Building** fictional project.
2. Choose **Import data**.
3. Select `fixtures/riverside_medical.xlsx`.
4. Keep **All compatible airside outlet sheets** selected. For each included
   worksheet, confirm its detected header row and suggested mapping.
5. Preview the combined result, then commit all 60 rows.
6. Review the predictable exception queue (roughly 19 findings), including
   expired calibration flags for Flow Hood FH-2 and a system total mismatch for
   AHU-1.
7. Open one warning and choose **Acknowledge warning**.
8. Open another finding, enter a resolution note and reviewer name, then
   resolve it.
9. Choose **Re-run checks** and confirm both reviewer dispositions remain.
10. Open **Report**, generate version 1, and open its print view. Use browser
    Print → Save as PDF to review the cover, summary, instrument table, system
    sheets, findings appendix, exact disclaimer, and page numbers.
11. Generate version 2, then reopen version 1 to confirm the original snapshot
    remains unchanged.

## Predictable synthetic fixture issues

The generated workbook has 60 outlet rows across `AHU-1 Outlets` and
`AHU-2 Outlets`. It contains exactly the demonstration conditions requested:
two missing instruments, four uses of expired Flow Hood FH-2, one duplicated
AHU-2 outlet ID, three missing test dates, two missing technicians, one unknown
instrument, three readings outside tolerance, a complete AHU-1 total about 6%
below design, and an incomplete AHU-2 set with one zero reading. The incomplete
AHU-2 set does not receive a redundant system-total flag. All other rows are
clean.

## Real-workbook safeguards

- **All compatible** imports only sheets with recognizable airside
  outlet/CFM columns. Drawings, covers, hydronic schedules, fan summaries, and
  certificates are shown but skipped.
- Each included worksheet keeps its own confirmed header and mapping. Two-level
  grouped headings, repeated headers, subtotal rows, merged unit labels, and
  worksheet-title unit IDs are handled without becoming fake outlets.
- `NOTE`, `NA`, `NG`, `NTS`, `OFF`, and dash markers remain documented
  non-readings. Instrument, technician, and test-date checks only run when
  those evidence columns were actually mapped.
- The server reparses the submitted workbook and validates every confirmed
  worksheet instead of trusting preview rows from the browser.
- A new import replaces the current working dataset in one transaction instead
  of appending duplicates. Matching reviewed findings and immutable report
  versions are preserved.
- Upload the original `.xlsx` source. PDF reports are deliberately rejected
  because flattened pages cannot preserve cell identity reliably.

## Architecture

- Next.js App Router with strict TypeScript and Tailwind CSS
- SQLite at `data/tabready.db` through Drizzle ORM
- SheetJS (`xlsx`) workbook parsing and Zod request validation
- Pure, versioned readiness rules in `src/rules/`
- Vitest unit coverage for every rule, mapping, total boundaries, reviewer-state
  preservation, and report snapshot integrity

The application makes no AI calls and requires no API keys or network services
at runtime.

## Out of scope

This deliberately does not include authentication, roles, multi-tenancy, a
cloud database, file-storage services, e-signatures, stamps, offline/PWA
behavior, hydronic/traverse/fume-hood form types, Bluetooth instrument import,
AI/LLM features, email, billing, or deployment configuration.
