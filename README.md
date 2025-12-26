# KinetikResearcher

An AI-supported tool for kinetics.

## Dev commands

The app lives in `app/` and mirrors the UI structure from the design draft at
`design/kinetik-researcher.design-draft.html`.

The Import & Mapping step includes a mapping wizard that converts parsed RawTables
into Dataset experiments and series (see `app/src/lib/import/mapping.ts`). The
Validation step surfaces an import report with dataset and experiment findings,
user-facing guidance, and per-experiment statuses powered by
`app/src/lib/import/validation.ts`.

```bash
cd app
npm install
npm run dev
npm run build
npm test
```
