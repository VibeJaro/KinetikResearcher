import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildColumnSummaries } from "../../lib/columnScan/buildColumnSummaries";
import type { MappingSelection } from "../../lib/import/mapping";
import type { RawTable } from "../../lib/import/types";
import type { Experiment } from "../../types/experiment";
import {
  representativityOntology,
  type ExperimentRepresentativityResult,
  type FitRecommendation,
  type RepresentativityCategory
} from "../../types/representativityAnalysis";
import {
  buildExperimentRowMap,
  collectValues,
  formatExample,
  isStructuralColumn
} from "./analysisUtils";

type RepresentativityScreenProps = {
  experiments: Experiment[];
  table: RawTable | null;
  mappingSelection: MappingSelection;
  datasetName: string | null;
  results: Record<string, ExperimentRepresentativityResult>;
  selection: Record<string, boolean>;
  onResultsChange: Dispatch<SetStateAction<Record<string, ExperimentRepresentativityResult>>>;
  onSelectionChange: Dispatch<SetStateAction<Record<string, boolean>>>;
};

type ExperimentContext = {
  experimentId: string;
  experimentName: string;
  referenceColumns: { column: string; values: string[] }[];
  contextColumns: { column: string; snippets: string[] }[];
};

const statusBadge = (status: ExperimentRepresentativityResult["status"]): string => {
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

const recommendationBadge = (recommendation: FitRecommendation): string => {
  switch (recommendation) {
    case "good":
      return "recommendation-pill good";
    case "review":
      return "recommendation-pill review";
    case "caution":
      return "recommendation-pill caution";
    default:
      return "recommendation-pill";
  }
};

const recommendationLabel = (recommendation: FitRecommendation): string => {
  switch (recommendation) {
    case "good":
      return "Gut geeignet";
    case "review":
      return "Prüfen";
    case "caution":
      return "Auffällig";
    default:
      return "Prüfen";
  }
};

const defaultRecommendation = (): FitRecommendation => "review";

export const RepresentativityScreen = ({
  experiments,
  table,
  mappingSelection,
  datasetName,
  results,
  selection,
  onResultsChange,
  onSelectionChange
}: RepresentativityScreenProps) => {
  const [selectedReferenceColumns, setSelectedReferenceColumns] = useState<string[]>([]);
  const [selectedContextColumns, setSelectedContextColumns] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [hideClean, setHideClean] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<RepresentativityCategory | "all">("all");

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

  const defaultReferenceColumns = useMemo(() => {
    return columnSummaries
      .filter((column) => {
        if (!table) return false;
        if (isStructuralColumn(column.name, table.headers, mappingSelection)) return false;
        const isLikelyReference =
          column.typeHeuristic === "numeric" ||
          /temp|druck|druck|educt|edukt|substrat|solv|additiv|charge|batch|konz/i.test(
            column.name
          );
        return isLikelyReference;
      })
      .slice(0, 4)
      .map((column) => column.name);
  }, [columnSummaries, mappingSelection, table]);

  const defaultContextColumns = useMemo(() => {
    return columnSummaries
      .filter((column) => {
        if (!table) return false;
        if (isStructuralColumn(column.name, table.headers, mappingSelection)) return false;
        const isCommentLike = /comment|bemerk|notiz|note|remark/i.test(column.name);
        return isCommentLike || column.typeHeuristic === "text";
      })
      .slice(0, 3)
      .map((column) => column.name);
  }, [columnSummaries, mappingSelection, table]);

  useEffect(() => {
    setSelectedReferenceColumns(defaultReferenceColumns);
    setSelectedContextColumns(defaultContextColumns);
  }, [defaultContextColumns, defaultReferenceColumns]);

  useEffect(() => {
    if (experiments.length === 0) {
      if (Object.keys(results).length > 0) {
        onResultsChange({});
      }
      if (Object.keys(selection).length > 0) {
        onSelectionChange({});
      }
      return;
    }

    const nextResults: Record<string, ExperimentRepresentativityResult> = { ...results };
    const nextSelection: Record<string, boolean> = { ...selection };
    let resultsChanged = false;
    let selectionChanged = false;

    experiments.forEach((experiment) => {
      if (!nextResults[experiment.experimentId]) {
        nextResults[experiment.experimentId] = {
          experimentId: experiment.experimentId,
          experimentName: experiment.name ?? experiment.experimentId,
          status: "pending",
          findings: [],
          model: "gpt-5-mini-2025-08-07",
          fitRecommendation: defaultRecommendation()
        };
        resultsChanged = true;
      }
      if (nextSelection[experiment.experimentId] === undefined) {
        nextSelection[experiment.experimentId] = true;
        selectionChanged = true;
      }
    });

    if (resultsChanged) {
      onResultsChange(nextResults);
    }
    if (selectionChanged) {
      onSelectionChange(nextSelection);
    }
  }, [experiments, onResultsChange, onSelectionChange, results, selection]);

  const contexts: ExperimentContext[] = useMemo(() => {
    if (!table) return [];
    return experiments.map((experiment) => {
      const experimentLabel = experiment.name ?? experiment.experimentId;
      const rows = experimentRowMap.get(experimentLabel) ?? [];
      const referenceColumns = selectedReferenceColumns
        .map((column) => {
          const index = headerIndex.get(column);
          if (index === undefined) return null;
          const values = collectValues(rows, index, 6, 160);
          if (values.length === 0) return null;
          return { column, values };
        })
        .filter((item): item is { column: string; values: string[] } => Boolean(item));

      const contextColumns = selectedContextColumns
        .map((column) => {
          const index = headerIndex.get(column);
          if (index === undefined) return null;
          const snippets = collectValues(rows, index, 8, 320);
          if (snippets.length === 0) return null;
          return { column, snippets };
        })
        .filter((item): item is { column: string; snippets: string[] } => Boolean(item));

      return {
        experimentId: experiment.experimentId,
        experimentName: experiment.name ?? experiment.experimentId,
        referenceColumns,
        contextColumns
      };
    });
  }, [
    experiments,
    experimentRowMap,
    headerIndex,
    selectedContextColumns,
    selectedReferenceColumns,
    table
  ]);

  const handleToggle = (value: string, list: string[], setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const handleSelectionToggle = (experimentId: string) => {
    onSelectionChange((prev) => ({ ...prev, [experimentId]: !prev[experimentId] }));
  };

  const handleRunAnalysis = async () => {
    if (!table || selectedReferenceColumns.length === 0 || selectedContextColumns.length === 0) {
      return;
    }
    setRunning(true);

    for (const context of contexts) {
      const hasSnippets = context.contextColumns.length > 0;
      if (!hasSnippets) {
        onResultsChange((prev) => ({
          ...prev,
          [context.experimentId]: {
            ...prev[context.experimentId],
            status: "no_findings",
            findings: [],
            fitRecommendation: "good",
            summary: "Keine Hinweise in den gewählten Kontextspalten.",
            usedColumns: {
              reference: selectedReferenceColumns,
              context: selectedContextColumns
            }
          }
        }));
        continue;
      }

      onResultsChange((prev) => ({
        ...prev,
        [context.experimentId]: {
          ...prev[context.experimentId],
          status: "running",
          findings: [],
          error: undefined,
          usedColumns: {
            reference: selectedReferenceColumns,
            context: selectedContextColumns
          }
        }
      }));

      try {
        const response = await fetch("/api/representativity-scan", {
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
          onResultsChange((prev) => ({
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
            ? (data.result.model as ExperimentRepresentativityResult["model"])
            : ("gpt-5-mini-2025-08-07" as ExperimentRepresentativityResult["model"]);
        const recommendation =
          data.result?.fitRecommendation === "good" ||
          data.result?.fitRecommendation === "review" ||
          data.result?.fitRecommendation === "caution"
            ? (data.result.fitRecommendation as FitRecommendation)
            : defaultRecommendation();
        const summary = typeof data.result?.summary === "string" ? data.result.summary : undefined;
        const hasFindings = findings.length > 0;

        onResultsChange((prev) => ({
          ...prev,
          [context.experimentId]: {
            ...prev[context.experimentId],
            status: hasFindings ? "findings" : "no_findings",
            findings,
            model: modelUsed,
            requestId,
            fitRecommendation: recommendation,
            summary
          }
        }));
      } catch (error) {
        onResultsChange((prev) => ({
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
    const selected = Object.values(selection).filter(Boolean).length;
    return {
      total: experiments.length,
      completed: completed.length,
      withFindings: withFindings.length,
      errors: errors.length,
      selected
    };
  }, [experiments.length, results, selection]);

  const filteredResults = useMemo(() => {
    return Object.values(results).filter((item) => {
      if (hideClean && item.status === "no_findings") return false;
      if (categoryFilter === "all") return true;
      return item.findings.some((finding) => finding.category === categoryFilter);
    });
  }, [categoryFilter, hideClean, results]);

  if (!table) {
    return (
      <section className="representativity-screen">
        <header className="section-intro">
          <p className="eyebrow">Schritt 4 · Repräsentativität</p>
          <h2>Experimente gegen Referenzspalten prüfen</h2>
          <p className="muted">
            Lade zuerst Daten und schließe Mapping + Validierung ab, um Referenzspalten für den
            LLM-Abgleich auszuwählen.
          </p>
        </header>
        <div className="placeholder-card">
          <p className="muted">Keine Tabelle verfügbar.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="representativity-screen">
      <header className="section-intro">
        <p className="eyebrow">Schritt 4 · Repräsentativität (LLM)</p>
        <h2>Weitere Abweichungen finden und Fit-Auswahl vorbereiten</h2>
        <p className="muted">
          Wähle Referenz- und Kontextspalten, starte dann den LLM-Abgleich. Pro Experiment wird ein
          zusätzlicher Call an <strong>GPT-5 mini (Snapshot 2025-08-07)</strong> gesendet; wenn nötig fällt
          die Analyse auf <strong>gpt-5-mini</strong> zurück. Ergebnis: Inkonsistenzen, Empfehlung zur
          Fit-Eignung und eine Zusammenfassung für den Report.
        </p>
        <div className="llm-chip">LLM · GPT-5 mini-2025-08-07 · Fallback: gpt-5-mini · 1 Call/Experiment</div>
      </header>

      <div className="representativity-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Referenzspalten</p>
              <h3>Welche Werte sind „Soll“-Parameter?</h3>
              <p className="muted">
                Edukte, Temperatur, Konzentration oder Chargen liefern die Referenz. Diese Werte
                nutzt der LLM zum Abgleich.
              </p>
            </div>
          </div>
          <div className="selector-list">
            {columnSummaries
              .filter((column) => !isStructuralColumn(column.name, table.headers, mappingSelection))
              .map((column) => {
                const checked = selectedReferenceColumns.includes(column.name);
                const example = column.examples[0];
                return (
                  <label key={`ref-${column.name}`} className="selector-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        handleToggle(
                          column.name,
                          selectedReferenceColumns,
                          setSelectedReferenceColumns
                        )
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
              <p className="eyebrow">Kontextspalten</p>
              <h3>Wo stehen Abweichungen oder Klarstellungen?</h3>
              <p className="muted">
                Kommentare, Notizen oder Freitext. Diese Spalten liefern die Hinweise auf reale
                Abweichungen.
              </p>
            </div>
          </div>
          <div className="selector-list">
            {columnSummaries
              .filter((column) => !isStructuralColumn(column.name, table.headers, mappingSelection))
              .map((column) => {
                const checked = selectedContextColumns.includes(column.name);
                const example = column.examples[0];
                return (
                  <label key={`ctx-${column.name}`} className="selector-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        handleToggle(column.name, selectedContextColumns, setSelectedContextColumns)
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
            <h3>LLM-Abgleich nacheinander ausführen</h3>
            <p className="muted">
              {experiments.length} Experimente · Referenzspalten: {selectedReferenceColumns.length} ·
              Kontextspalten: {selectedContextColumns.length}
            </p>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSelectedReferenceColumns(defaultReferenceColumns);
                setSelectedContextColumns(defaultContextColumns);
              }}
              disabled={running}
            >
              Empfehlungen übernehmen
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleRunAnalysis()}
              disabled={
                running ||
                selectedReferenceColumns.length === 0 ||
                selectedContextColumns.length === 0
              }
            >
              {running ? "LLM läuft..." : "LLM-Abgleich starten"}
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
            <span className="label">Mit Inkonsistenzen</span>
            <strong>{analysisSummary.withFindings}</strong>
          </div>
          <div className="summary-pill danger">
            <span className="label">Fehler</span>
            <strong>{analysisSummary.errors}</strong>
          </div>
          <div className="summary-pill muted">
            <span className="label">Für Fit vorgemerkt</span>
            <strong>{analysisSummary.selected}</strong>
          </div>
        </div>

        <div className="filters">
          <label className="toggle">
            <input
              type="checkbox"
              checked={hideClean}
              onChange={(event) => setHideClean(event.target.checked)}
            />
            Nur Experimente mit Inkonsistenzen anzeigen
          </label>
          <label className="select-filter">
            Filter nach Kategorie
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value === "all"
                    ? "all"
                    : (event.target.value as RepresentativityCategory)
                )
              }
            >
              <option value="all">Alle Kategorien</option>
              {representativityOntology.map((entry) => (
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
                {result.status === "findings" && "⚠️ Inkonsistenzen"}
                {result.status === "no_findings" && "✅ Keine Inkonsistenzen"}
                {result.status === "running" && "⏳ LLM läuft"}
                {result.status === "pending" && "⏸ Noch nicht analysiert"}
                {result.status === "error" && "❌ Analyse fehlgeschlagen"}
              </div>
            </div>

            <div className="recommendation-row">
              <span className={recommendationBadge(result.fitRecommendation)}>
                {recommendationLabel(result.fitRecommendation)}
              </span>
              <label className="fit-toggle">
                <input
                  type="checkbox"
                  checked={selection[result.experimentId] ?? true}
                  onChange={() => handleSelectionToggle(result.experimentId)}
                />
                Für Fit vormerken
              </label>
            </div>

            {result.summary && <p className="meta summary-text">{result.summary}</p>}

            {result.status === "error" && (
              <div className="inline-error">
                <p className="error-title">LLM-Analyse nicht möglich</p>
                <p className="meta">{result.error ?? "Unbekannter Fehler"}</p>
                {result.usedColumns && (
                  <p className="meta">
                    Spalten: {result.usedColumns.reference.join(", ")} (Referenz) ·{" "}
                    {result.usedColumns.context.join(", ")} (Kontext)
                  </p>
                )}
                <p className="meta">Modell: GPT-5.2 mini · Request: {result.requestId ?? "n/a"}</p>
              </div>
            )}

            {(result.status === "findings" || result.findings.length > 0) && (
              <div className="finding-list">
                {result.findings.map((finding, index) => {
                  const meta = representativityOntology.find((entry) => entry.id === finding.category);
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
              <p className="muted">Keine Hinweise auf Inkonsistenzen in den gewählten Spalten.</p>
            )}

            {result.status === "pending" && (
              <p className="muted">Noch nicht geprüft. Bitte LLM-Abgleich starten.</p>
            )}

            {result.status === "running" && <p className="muted">LLM gleicht Referenzen ab …</p>}

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
