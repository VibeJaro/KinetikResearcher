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

The Grouping step adds an LLM-assisted workflow to identify metadata columns,
extract normalized factors, suggest deterministic grouping options, and let the
user curate the final experiment groups. LLM calls are handled server-side via
Vercel functions in `/api/column-scan.ts` and `/api/factor-extraction.ts`
using the `gpt-5.2` model and the `OPENAI_API_KEY` environment variable.

```bash
cd app
npm install
npm run dev
npm run build
npm test
```
