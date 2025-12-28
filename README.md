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

## LLM Column Scan

- Serverless route: `api/column-scan.ts` (Node runtime). It calls `gpt-5.2` via the OpenAI Node SDK
  and returns validated JSON only.
- Env: set `OPENAI_API_KEY` for local dev and Vercel deployments.
- Request (POST `/api/column-scan`): columns array (name, typeHeuristic, nonNullRatio, examples),
  optional `experimentCount`, optional `knownStructuralColumns` array, optional `includeComments`.
- Response (200): `{ ok: true, requestId, result: { selectedColumns, columnRoles, factorCandidates, notes, uncertainties } }`
  with strict size/length limits.
- UI: The Grouping screen hosts a “Column scan” panel that builds the request from the current table,
  lets you toggle `includeComments`, runs the scan, and shows the suggested columns/roles so you can
  refine the final selection.
