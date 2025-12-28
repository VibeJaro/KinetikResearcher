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

- Serverless function: `api/column-scan.ts` (Node runtime), using GPT-5.2 via the OpenAI Node SDK.
- Environment: set `OPENAI_API_KEY` for the function to run; the route returns structured JSON with a `requestId` for tracing.
- Request: POST JSON with column summaries (name, type heuristic, non-null ratio, examples) plus optional `experimentCount`, `knownStructuralColumns`, and `includeComments`.
- Response: strict JSON containing selected columns, column roles, factor candidates, notes, and uncertainties; the handler validates both the request and the LLM output.
- Frontend: the Grouping step includes an **LLM Column Scan** panel that builds a payload from the current mapping (or sample data), toggles comment handling, calls `/api/column-scan`, surfaces notes/uncertainties, and lets you adjust the final column selection.
- Local dev note: the Vite dev server exposes a stub `/api/column-scan` response; run the deployed serverless function (e.g., via Vercel) with `OPENAI_API_KEY` to exercise the GPT-5.2-backed handler.
