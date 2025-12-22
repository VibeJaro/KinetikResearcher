# KinetikResearcher

An AI-supported tool for kinetics.

## Dev commands

The app lives in `app/` and mirrors the UI structure from the design draft at
`design/kinetik-researcher.design-draft.html`.

The Import & Mapping step now includes a mapping wizard that converts parsed
RawTables into Dataset experiments and series (see `app/src/lib/import/mapping.ts`).
The Validation step surfaces an import report with status, findings, and summary
counts from pure checks (see `app/src/lib/import/validation.ts`).

```bash
cd app
npm install
npm run dev
npm run build
npm test
```
