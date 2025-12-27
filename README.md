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

After validation there is a **Grouping** screen that:

- collapses row-level metadata to experiment-level `metaRaw` entries
- calls server-side GPT-5.2 helpers to scan columns and extract normalized factors
- proposes deterministic grouping recipes (catalyst, catalyst + additive, etc.)
- provides a manual group editor with provenance, warnings, and overrides

LLM calls are routed through Vercel API handlers (`app/api/column-scan.ts` and
`app/api/factor-extraction.ts`) using the `OPENAI_API_KEY` environment variable. No
backend database is required; grouping state is kept in the front-end store.

```bash
cd app
npm install
npm run dev
npm run build
npm test
```
