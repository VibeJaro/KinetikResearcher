# KinetikResearcher

An AI-supported tool for kinetics.

## Dev commands

The app lives in `app/` and mirrors the UI structure from the design draft at
`design/kinetik-researcher.design-draft.html`.

Key flows:

- **Import & Mapping**: mapping wizard converts parsed RawTables into Dataset experiments and
  series (`app/src/lib/import/mapping.ts`).
- **Validation**: dataset/experiment findings and guidance (`app/src/lib/import/validation.ts`).
- **Grouping**: LLM-assisted column scan + factor extraction + deterministic grouping proposals
  with manual group editor (`app/src/components/grouping/GroupingScreen.tsx`,
  `app/api/column-scan.ts`, `app/api/factor-extraction.ts`).

```bash
cd app
npm install
npm run dev
npm run build
npm test
```
