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

After validation the new **Grouping** step runs a multi-stage workflow:

- LLM-backed column scan to identify relevant metadata columns (API routes live in `app/api/column-scan.ts` using GPT-5.2).
- Factor extraction per experiment with provenance and confidence (see `app/api/factor-extraction.ts`).
- Deterministic grouping recipes (e.g., catalyst-only, catalyst+additive, temperature bins) and a manual group editor with overrides and audit logging.

OpenAI access is pulled from the `OPENAI_API_KEY` environment variable (configured in Vercel). All LLM calls are server-side only.

```bash
cd app
npm install
npm run dev
npm run build
npm test
```
