import { useEffect, useMemo, useState } from "react";
import { buildColumnSummaries } from "../../lib/columnScan/buildColumnSummaries";
import type { MappingSelection } from "../../lib/import/mapping";
import type { RawTable } from "../../lib/import/types";
import type { Experiment } from "../../types/experiment";
import {
  deviationOntology,
  type DeviationCategory,
  type ExperimentDeviationResult
} from "../../types/deviationAnalysis";

type DeviationAnalysisScreenProps = {
  experiments: Experiment[];
  table: RawTable | null;
  mappingSelection: MappingSelection;
  datasetName: string | null;
};

type ExperimentContext = {
  experimentId: string;
  experimentName: string;
  deviationColumns: { column: string; snippets: string[] }[];
  parameterColumns: { column: string; values: string[] }[];
};

const normalizeCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string") return value.trim();
  return "";
};

const isStructuralColumn = (
  columnName: string,
  headers: string[],
  mappingSelection: MappingSelection
): boolean => {
  const time = mappingSelection.timeColumnIndex ?? -1;
  const experiment = mappingSelection.experimentColumnIndex ?? -1;
  const values = mappingSelection.valueColumnIndices ?? [];
  const structuralNames = [
    headers[time],
    headers[experiment],
    ...values.map((index) => headers[index])
  ].filter(Boolean);
  return structuralNames.includes(columnName);
};

const toLabel = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isNaN(value) ? "" : value.toString();
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
};

const buildExperimentRowMap = (
  table: RawTable | null,
  mappingSelection: MappingSelection,
  datasetName: string | null
): Map<string, (string | number | null)[][]> => {
  const map = new Map<string, (string | number | null)[][]>();
  if (!table) return map;

  const experimentIndex = mappingSelection.experimentColumnIndex ?? -1;
  const fallbackLabel = datasetName || "Experiment 1";

  table.rows.forEach((row) => {
    const label =
      experimentIndex === -1 ? fallbackLabel : toLabel(row[experimentIndex]) || "Unlabeled";
    const group = map.get(label) ?? [];
    group.push(row);
    map.set(label, group);
  });

  return map;
};

const collectValues = (
  rows: (string | number | null)[][],
  columnIndex: number,
  maxItems: number,
  maxLength = 320
): string[] => {
  const seen = new Set<string>();
  const values: string[] = [];
  rows.forEach((row) => {
    const text = normalizeCell(row[columnIndex]).slice(0, maxLength);
    if (!text) return;
    if (seen.has(text)) return;
    seen.add(text);
    values.push(text);
  });
  return values.slice(0, maxItems);
};

const formatExample = (text?: string): string => {
  if (!text) return "—";
  if (text.length > 60) return `${text.slice(0, 60)}…`;
  return text;
};

const statusBadge = (status: ExperimentDeviationResult["status"]): string => {
  switch (status) {
    case "findings":
      return "status-badge warning";
    case "no_findings":
      return "status-badge success";
    case "running":
      return "status-badge info";
    case "error":
      return "status-badge danger";
    default:
      return "status-badge muted";
  }
};

export const DeviationAnalysisScreen = ({
  experiments,
  table,
  mappingSelection,
  datasetName
}: DeviationAnalysisScreenProps) => {
  const [selectedDeviationColumns, setSelectedDeviationColumns] = useState<string[]>([]);
  const [selectedParameterColumns, setSelectedParameterColumns] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, ExperimentDeviationResult>>({});
  const [running, setRunning] = useState(false);
  const [hideClean, setHideClean] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<DeviationCategory | "all">("all");

  const columnSummaries = useMemo(
    () => (table ? buildColumnSummaries(table) : []),
    [table]
  );

  const experimentRowMap = useMemo(
    () => buildExperimentRowMap(table, mappingSelection, datasetName),
    [table, mappingSelection, datasetName]
  );

  const headerIndex = useMemo(() => {
    const map = new Map<string, number>();
    table?.headers.forEach((header, idx) => map.set(header, idx));
    return map;
  }, [table]);

  const defaultDeviationColumns = useMemo(() => {
    return columnSummaries
      .filter((column) => {
        if (!table) return false;
        if (isStructuralColumn(column.name, table.headers, mappingSelection)) return false;
        const isCommentLike = /comment|bemerk|notiz|note/i.test(column.name);
        return isCommentLike || column.typeHeuristic === "text";
      })
      .slice(0, 3)
      .map((column) => column.name);
  }, [columnSummaries, mappingSelection, table]);

  const defaultParameterColumns = useMemo(() => {
    return columnSummaries
      .filter((column) => {
        if (!table) return false;
        if (isStructuralColumn(column.name, table.headers, mappingSelection)) return false;
        const isLikelyParameter =
          column.typeHeuristic === "numeric" ||
          /temp|druck|solv|additiv|educt|charge|dose|konz/i.test(column.name);
        return isLikelyParameter;
      })
      .slice(0, 4)
      .map((column) => column.name);
  }, [columnSummaries, mappingSelection, table]);

  useEffect(() => {
    setSelectedDeviationColumns(defaultDeviationColumns);
    setSelectedParameterColumns(defaultParameterColumns);
  }, [defaultDeviationColumns, defaultParameterColumns]);

  useEffect(() => {
    const initialState = experiments.reduce<Record<string, ExperimentDeviationResult>>(
      (acc, experiment) => {
        acc[experiment.experimentId] = {
          experimentId: experiment.experimentId,
          experimentName: experiment.name ?? experiment.experimentId,
          status: "pending",
          findings: [],
          model: "gpt-5-mini-2025-08-07"
        };
        return acc;
      },
      {}
    );
    setResults(initialState);
  }, [experiments]);

  const contexts: ExperimentContext[] = useMemo(() => {
    if (!table) return [];
    return experiments.map((experiment) => {
      const experimentLabel = experiment.name ?? experiment.experimentId;
      const rows = experimentRowMap.get(experimentLabel) ?? [];
      const deviationColumns = selectedDeviationColumns
        .map((column) => {
          const index = headerIndex.get(column);
          if (index === undefined) return null;
          const snippets = collectValues(rows, index, 8);
          if (snippets.length === 0) return null;
          return { column, snippets };
        })
        .filter((item): item is { column: string; snippets: string[] } => Boolean(item));

      const parameterColumns = selectedParameterColumns
        .map((column) => {
          const index = headerIndex.get(column);
          if (index === undefined) return null;
          const values = collectValues(rows, index, 6, 160);
          if (values.length === 0) return null;
          return { column, values };
        })
        .filter((item): item is { column: string; values: string[] } => Boolean(item));

      return {
        experimentId: experiment.experimentId,
        experimentName: experiment.name ?? experiment.experimentId,
        deviationColumns,
        parameterColumns
      };
    });
  }, [experiments, experimentRowMap, headerIndex, selectedDeviationColumns, selectedParameterColumns, table]);

  const handleToggle = (value: string, list: string[], setter: (next: string[]) => void) => {
    setter(
      list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
    );
  };

  const handleRunAnalysis = async () => {
    if (!table || selectedDeviationColumns.length === 0) return;
    setRunning(true);

    for (const context of contexts) {
      const hasSnippets = context.deviationColumns.length > 0;
      if (!hasSnippets) {
        setResults((prev) => ({
          ...prev,
          [context.experimentId]: {
            ...prev[context.experimentId],
            status: "error",
            findings: [],
            error: "Keine Textstellen in den gewählten Kommentarspalten gefunden.",
            usedColumns: {
              deviation: selectedDeviationColumns,
              parameters: selectedParameterColumns
            }
          }
        }));
        continue;
      }

      setResults((prev) => ({
        ...prev,
        [context.experimentId]: {
          ...prev[context.experimentId],
          status: "running",
          findings: [],
          error: undefined,
          usedColumns: {
            deviation: selectedDeviationColumns,
            parameters: selectedParameterColumns
          }
        }
      }));

      try {
        const response = await fetch("/api/deviation-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(context)
        });
        const contentType = response.headers.get("content-type");
        const isJson = contentType?.includes("application/json");
        const data = isJson ? await response.json() : null;
        const requestId = data?.requestId ?? undefined;

        if (!response.ok || !data?.ok) {
          const message =
            data?.error ?? "LLM-Analyse fehlgeschlagen. OPENAI_API_KEY konfiguriert?";
          setResults((prev) => ({
            ...prev,
            [context.experimentId]: {
              ...prev[context.experimentId],
              status: "error",
              findings: [],
              requestId,
              error: typeof message === "string" ? message : "Unbekannter Fehler"
            }
          }));
          continue;
        }

        const findings = Array.isArray(data.result?.findings) ? data.result.findings : [];
        const modelUsed =
          typeof data.result?.model === "string"
            ? (data.result.model as ExperimentDeviationResult["model"])
            : ("gpt-5-mini-2025-08-07" as ExperimentDeviationResult["model"]);
        const hasFindings = findings.length > 0;

        setResults((prev) => ({
          ...prev,
          [context.experimentId]: {
            ...prev[context.experimentId],
            status: hasFindings ? "findings" : "no_findings",
            findings,
            model: modelUsed,
            requestId
          }
        }));
      } catch (error) {
        setResults((prev) => ({
          ...prev,
          [context.experimentId]: {
            ...prev[context.experimentId],
            status: "error",
            findings: [],
            error:
              error instanceof Error
                ? error.message
                : "Unbekannter Fehler bei der LLM-Analyse"
          }
        }));
      }
    }
    setRunning(false);
  };

  const analysisSummary = useMemo(() => {
    const allResults = Object.values(results);
    const completed = allResults.filter(
      (item) => item.status === "findings" || item.status === "no_findings"
    );
    const withFindings = completed.filter((item) => item.findings.length > 0);
    const errors = allResults.filter((item) => item.status === "error");
    return {
      total: experiments.length,
      completed: completed.length,
      withFindings: withFindings.length,
      errors: errors.length
    };
  }, [experiments.length, results]);

  const filteredResults = useMemo(() => {
    return Object.values(results).filter((item) => {
      if (hideClean && item.status === "no_findings") return false;
      if (categoryFilter === "all") return true;
      return item.findings.some((finding) => finding.category === categoryFilter);
    });
  }, [categoryFilter, hideClean, results]);

  if (!table) {
    return (
      <section className="deviation-screen">
        <header className="section-intro">
          <p className="eyebrow">Schritt 3 · Abweichungen</p>
          <h2>LLM-gestützte Abweichungsanalyse</h2>
          <p className="muted">
            Lade zuerst Daten und schließe Mapping + Validierung ab, um Kommentarspalten für den
            LLM-Scan auszuwählen.
          </p>
        </header>
        <div className="placeholder-card">
          <p className="muted">Keine Tabelle verfügbar.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="deviation-screen">
      <header className="section-intro">
        <p className="eyebrow">Schritt 3 · Abweichungen (LLM)</p>
        <h2>Kommentarspalten scannen und Abweichungen markieren</h2>
          <p className="muted">
            Wähle die Kommentar- und Kontextspalten, starte dann den LLM-Scan. Pro Experiment wird ein
            Aufruf an <strong>GPT-5 mini (Snapshot 2025-08-07)</strong> gesendet; wenn nötig fällt die Analyse auf
            <strong> gpt-5-mini</strong> zurück. Ergebnis: klare Ontologie-Labels und die Original-Textstelle – ohne
            Bewertung oder Korrekturvorschlag.
          </p>
        <div className="llm-chip">LLM · GPT-5 mini-2025-08-07 · Fallback: gpt-5-mini · 1 Call/Experiment</div>
      </header>

      <div className="deviation-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Kommentarspalten</p>
              <h3>Wo könnten Abweichungen erwähnt sein?</h3>
              <p className="muted">
                Markiere Spalten mit Freitext/Kommentaren. Jede gefundene Textstelle wird der
                Ontologie zugeordnet.
              </p>
            </div>
          </div>
          <div className="selector-list">
            {columnSummaries
              .filter((column) => !isStructuralColumn(column.name, table.headers, mappingSelection))
              .map((column) => {
                const checked = selectedDeviationColumns.includes(column.name);
                const example = column.examples[0];
                return (
                  <label key={column.name} className="selector-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        handleToggle(column.name, selectedDeviationColumns, setSelectedDeviationColumns)
                      }
                    />
                    <div className="selector-body">
                      <div className="selector-headline">
                        <span className="column-name">{column.name}</span>
                        <span className={`chip type-${column.typeHeuristic}`}>{column.typeHeuristic}</span>
                      </div>
                      <p className="meta">Beispiel: {formatExample(example)}</p>
                    </div>
                  </label>
                );
              })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Parameterkontext</p>
              <h3>Welche Spalten liefern Kerninfos?</h3>
              <p className="muted">
                Temperatur, Edukt, Additiv, Lösemittel … werden zur Einordnung mitgeschickt. Sie
                beeinflussen die Klassifizierung nicht, liefern aber Kontext.
              </p>
            </div>
          </div>
          <div className="selector-list">
            {columnSummaries
              .filter((column) => !isStructuralColumn(column.name, table.headers, mappingSelection))
              .map((column) => {
                const checked = selectedParameterColumns.includes(column.name);
                const example = column.examples[0];
                return (
                  <label key={`${column.name}-param`} className="selector-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        handleToggle(column.name, selectedParameterColumns, setSelectedParameterColumns)
                      }
                    />
                    <div className="selector-body">
                      <div className="selector-headline">
                        <span className="column-name">{column.name}</span>
                        <span className={`chip type-${column.typeHeuristic}`}>{column.typeHeuristic}</span>
                      </div>
                      <p className="meta">Beispiel: {formatExample(example)}</p>
                    </div>
                  </label>
                );
              })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header align-center">
          <div>
            <p className="eyebrow">Analyse-Start</p>
            <h3>LLM-Scan nacheinander ausführen</h3>
            <p className="muted">
              {experiments.length} Experimente · ausgewählte Kommentarspalten:{" "}
              {selectedDeviationColumns.length} · Kontextspalten: {selectedParameterColumns.length}
            </p>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSelectedDeviationColumns(defaultDeviationColumns);
                setSelectedParameterColumns(defaultParameterColumns);
              }}
              disabled={running}
            >
              Empfehlungen übernehmen
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleRunAnalysis()}
              disabled={running || selectedDeviationColumns.length === 0}
            >
              {running ? "LLM läuft..." : "LLM-Scan starten"}
            </button>
          </div>
        </div>

        <div className="analysis-summary">
          <div className="summary-pill">
            <span className="label">Status</span>
            <strong>
              {analysisSummary.completed}/{analysisSummary.total} abgeschlossen
            </strong>
          </div>
          <div className="summary-pill warning">
            <span className="label">Mit Auffälligkeiten</span>
            <strong>{analysisSummary.withFindings}</strong>
          </div>
          <div className="summary-pill danger">
            <span className="label">Fehler</span>
            <strong>{analysisSummary.errors}</strong>
          </div>
          <div className="summary-pill muted">
            <span className="label">LLM</span>
            <strong>GPT-5 mini (Snapshot)</strong>
          </div>
        </div>

        <div className="filters">
          <label className="toggle">
            <input
              type="checkbox"
              checked={hideClean}
              onChange={(event) => setHideClean(event.target.checked)}
            />
            Nur Experimente mit Auffälligkeiten anzeigen
          </label>
          <label className="select-filter">
            Filter nach Ontologie
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value === "all"
                  ? "all"
                  : (event.target.value as DeviationCategory))
              }
            >
              <option value="all">Alle Kategorien</option>
              {deviationOntology.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="results-grid">
        {filteredResults.map((result) => (
          <article key={result.experimentId} className="experiment-card">
            <div className="experiment-card-header">
              <div>
                <h4>{result.experimentName}</h4>
                <p className="meta">ID: {result.experimentId}</p>
              </div>
              <div className={statusBadge(result.status)}>
                {result.status === "findings" && "⚠️ Auffälligkeiten"}
                {result.status === "no_findings" && "✅ Keine Auffälligkeiten"}
                {result.status === "running" && "⏳ LLM läuft"}
                {result.status === "pending" && "⏸ Noch nicht analysiert"}
                {result.status === "error" && "❌ Analyse fehlgeschlagen"}
              </div>
            </div>

            {result.status === "error" && (
              <div className="inline-error">
                <p className="error-title">LLM-Analyse nicht möglich</p>
                <p className="meta">{result.error ?? "Unbekannter Fehler"}</p>
                {result.usedColumns && (
                  <p className="meta">
                    Spalten: {result.usedColumns.deviation.join(", ")} (Kommentar) ·{" "}
                    {result.usedColumns.parameters.join(", ") || "kein Kontext"}
                  </p>
                )}
                <p className="meta">Modell: GPT-5.2 mini · Request: {result.requestId ?? "n/a"}</p>
              </div>
            )}

            {(result.status === "findings" || result.findings.length > 0) && (
              <div className="finding-list">
                {result.findings.map((finding, index) => {
                  const meta = deviationOntology.find((entry) => entry.id === finding.category);
                  return (
                    <div key={`${result.experimentId}-finding-${index}`} className="finding-card">
                      <div className="finding-header">
                        <span className="finding-icon">{meta?.icon ?? "⚠️"}</span>
                        <div>
                          <p className="finding-label">{meta?.label ?? finding.category}</p>
                          <p className="meta">{meta?.shortHint}</p>
                        </div>
                        <span className="chip column-chip">{finding.sourceColumn}</span>
                      </div>
                      <p className="finding-snippet">„{finding.snippet}“</p>
                      {finding.note && <p className="meta">Hinweis: {finding.note}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {result.status === "no_findings" && result.findings.length === 0 && (
              <p className="muted">Keine Hinweise auf Abweichungen in den gewählten Kommentarspalten.</p>
            )}

            {result.status === "pending" && (
              <p className="muted">Noch nicht gescannt. Bitte LLM-Scan starten.</p>
            )}

            {result.status === "running" && <p className="muted">LLM liest Kommentare …</p>}

            <footer className="experiment-card-footer">
              <span className="meta">LLM: {result.model ?? "gpt-5-mini-2025-08-07"}</span>
              {result.requestId && <span className="meta">Request: {result.requestId}</span>}
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
};
