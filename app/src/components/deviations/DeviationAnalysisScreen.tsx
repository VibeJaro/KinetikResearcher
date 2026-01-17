import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildColumnSummaries } from "../../lib/columnScan/buildColumnSummaries";
import type { MappingSelection } from "../../lib/import/mapping";
import type { RawTable } from "../../lib/import/types";
import type { DeviationAnalysisState } from "../../types/analysisState";
import type { Experiment } from "../../types/experiment";
import {
  deviationOntology,
  type DeviationCategory,
  type ExperimentDeviationResult
} from "../../types/deviationAnalysis";
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

type DeviationAnalysisScreenProps = {
  experiments: Experiment[];
  table: RawTable | null;
  mappingSelection: MappingSelection;
  datasetName: string | null;
  analysisState: DeviationAnalysisState;
  onAnalysisStateChange: Dispatch<SetStateAction<DeviationAnalysisState>>;
};

type ExperimentContext = {
  experimentId: string;
  experimentName: string;
  deviationColumns: { column: string; snippets: string[] }[];
  parameterColumns: { column: string; values: string[] }[];
  referenceColumns: { column: string; values: string[] }[];
  contextColumns: { column: string; snippets: string[] }[];
};

const statusBadge = (
  status: ExperimentDeviationResult["status"] | ExperimentRepresentativityResult["status"]
): string => {
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

const statusLabel = (
  status: ExperimentDeviationResult["status"] | ExperimentRepresentativityResult["status"],
  kind: "deviation" | "representativity"
): string => {
  if (status === "findings") {
    return kind === "deviation" ? "⚠️ Auffälligkeiten" : "⚠️ Inkonsistenzen";
  }
  if (status === "no_findings") {
    return kind === "deviation" ? "✅ Keine Auffälligkeiten" : "✅ Keine Inkonsistenzen";
  }
  if (status === "running") {
    return "⏳ LLM läuft";
  }
  if (status === "error") {
    return "❌ Analyse fehlgeschlagen";
  }
  return "⏸ Noch nicht analysiert";
};

export const DeviationAnalysisScreen = ({
  experiments,
  table,
  mappingSelection,
  datasetName,
  analysisState,
  onAnalysisStateChange
}: DeviationAnalysisScreenProps) => {
  const {
    selectedDeviationColumns,
    selectedParameterColumns,
    results,
    representativityResults,
    fitSelection
  } = analysisState;
  const [running, setRunning] = useState(false);
  const [hideClean, setHideClean] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<DeviationCategory | "all">("all");
  const [representativityFilter, setRepresentativityFilter] = useState<
    RepresentativityCategory | "all"
  >("all");

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
    if (defaultDeviationColumns.length === 0 && defaultParameterColumns.length === 0) {
      return;
    }
    onAnalysisStateChange((prev) => {
      if (
        prev.selectedDeviationColumns.length > 0 ||
        prev.selectedParameterColumns.length > 0
      ) {
        return prev;
      }
      return {
        ...prev,
        selectedDeviationColumns: defaultDeviationColumns,
        selectedParameterColumns: defaultParameterColumns
      };
    });
  }, [defaultDeviationColumns, defaultParameterColumns, onAnalysisStateChange]);

  useEffect(() => {
    if (experiments.length === 0) {
      onAnalysisStateChange((prev) => ({
        ...prev,
        results: {},
        representativityResults: {},
        fitSelection: {}
      }));
      return;
    }

    onAnalysisStateChange((prev) => {
      let changed = false;
      const nextDeviation: Record<string, ExperimentDeviationResult> = { ...prev.results };
      const nextRepresentativity: Record<string, ExperimentRepresentativityResult> = {
        ...prev.representativityResults
      };
      const nextSelection: Record<string, boolean> = { ...prev.fitSelection };

      experiments.forEach((experiment) => {
        if (!nextDeviation[experiment.experimentId]) {
          nextDeviation[experiment.experimentId] = {
            experimentId: experiment.experimentId,
            experimentName: experiment.name ?? experiment.experimentId,
            status: "pending",
            findings: [],
            model: "gpt-5-mini-2025-08-07"
          };
          changed = true;
        }
        if (!nextRepresentativity[experiment.experimentId]) {
          nextRepresentativity[experiment.experimentId] = {
            experimentId: experiment.experimentId,
            experimentName: experiment.name ?? experiment.experimentId,
            status: "pending",
            findings: [],
            model: "gpt-5-mini-2025-08-07",
            fitRecommendation: defaultRecommendation()
          };
          changed = true;
        }
        if (nextSelection[experiment.experimentId] === undefined) {
          nextSelection[experiment.experimentId] = true;
          changed = true;
        }
      });

      if (!changed) {
        return prev;
      }
      return {
        ...prev,
        results: nextDeviation,
        representativityResults: nextRepresentativity,
        fitSelection: nextSelection
      };
    });
  }, [experiments, onAnalysisStateChange]);

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

      const referenceColumns = [...parameterColumns];
      const contextColumns = [...deviationColumns];

      return {
        experimentId: experiment.experimentId,
        experimentName: experiment.name ?? experiment.experimentId,
        deviationColumns,
        parameterColumns,
        referenceColumns,
        contextColumns
      };
    });
  }, [
    experiments,
    experimentRowMap,
    headerIndex,
    selectedDeviationColumns,
    selectedParameterColumns,
    table
  ]);

  const handleToggle = (value: string, list: string[], key: "selectedDeviationColumns" | "selectedParameterColumns") => {
    const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    onAnalysisStateChange((prev) => ({ ...prev, [key]: next }));
  };

  const handleSelectionToggle = (experimentId: string) => {
    onAnalysisStateChange((prev) => ({
      ...prev,
      fitSelection: { ...prev.fitSelection, [experimentId]: !prev.fitSelection[experimentId] }
    }));
  };

  const handleRunAnalysis = async () => {
    if (!table || selectedDeviationColumns.length === 0 || selectedParameterColumns.length === 0) {
      return;
    }
    setRunning(true);

    for (const context of contexts) {
      const hasSnippets = context.deviationColumns.length > 0;
      if (!hasSnippets) {
        onAnalysisStateChange((prev) => ({
          ...prev,
          results: {
            ...prev.results,
            [context.experimentId]: {
              ...prev.results[context.experimentId],
              status: "no_findings",
              findings: [],
              usedColumns: {
                deviation: selectedDeviationColumns,
                parameters: selectedParameterColumns
              }
            }
          },
          representativityResults: {
            ...prev.representativityResults,
            [context.experimentId]: {
              ...prev.representativityResults[context.experimentId],
              status: "no_findings",
              findings: [],
              fitRecommendation: "good",
              summary: "Keine Hinweise in den gewählten Kommentarspalten.",
              usedColumns: {
                reference: selectedParameterColumns,
                context: selectedDeviationColumns
              }
            }
          }
        }));
        continue;
      }

      onAnalysisStateChange((prev) => ({
        ...prev,
        results: {
          ...prev.results,
          [context.experimentId]: {
            ...prev.results[context.experimentId],
            status: "running",
            findings: [],
            error: undefined,
            usedColumns: {
              deviation: selectedDeviationColumns,
              parameters: selectedParameterColumns
            }
          }
        }
      }));

      try {
        const response = await fetch("/api/deviation-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            experimentId: context.experimentId,
            experimentName: context.experimentName,
            deviationColumns: context.deviationColumns,
            parameterColumns: context.parameterColumns
          })
        });
        const contentType = response.headers.get("content-type");
        const isJson = contentType?.includes("application/json");
        const data = isJson ? await response.json() : null;
        const requestId = data?.requestId ?? undefined;

        if (!response.ok || !data?.ok) {
          const message =
            data?.error ?? "LLM-Analyse fehlgeschlagen. OPENAI_API_KEY konfiguriert?";
          onAnalysisStateChange((prev) => ({
            ...prev,
            results: {
              ...prev.results,
              [context.experimentId]: {
                ...prev.results[context.experimentId],
                status: "error",
                findings: [],
                requestId,
                error: typeof message === "string" ? message : "Unbekannter Fehler"
              }
            }
          }));
        } else {
          const findings = Array.isArray(data.result?.findings) ? data.result.findings : [];
          const modelUsed =
            typeof data.result?.model === "string"
              ? (data.result.model as ExperimentDeviationResult["model"])
              : ("gpt-5-mini-2025-08-07" as ExperimentDeviationResult["model"]);
          const hasFindings = findings.length > 0;

          onAnalysisStateChange((prev) => ({
            ...prev,
            results: {
              ...prev.results,
              [context.experimentId]: {
                ...prev.results[context.experimentId],
                status: hasFindings ? "findings" : "no_findings",
                findings,
                model: modelUsed,
                requestId
              }
            }
          }));
        }
      } catch (error) {
        onAnalysisStateChange((prev) => ({
          ...prev,
          results: {
            ...prev.results,
            [context.experimentId]: {
              ...prev.results[context.experimentId],
              status: "error",
              findings: [],
              error:
                error instanceof Error
                  ? error.message
                  : "Unbekannter Fehler bei der LLM-Analyse"
            }
          }
        }));
      }

      onAnalysisStateChange((prev) => ({
        ...prev,
        representativityResults: {
          ...prev.representativityResults,
          [context.experimentId]: {
            ...prev.representativityResults[context.experimentId],
            status: "running",
            findings: [],
            error: undefined,
            usedColumns: {
              reference: selectedParameterColumns,
              context: selectedDeviationColumns
            }
          }
        }
      }));

      try {
        const response = await fetch("/api/representativity-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            experimentId: context.experimentId,
            experimentName: context.experimentName,
            referenceColumns: context.referenceColumns,
            contextColumns: context.contextColumns
          })
        });
        const contentType = response.headers.get("content-type");
        const isJson = contentType?.includes("application/json");
        const data = isJson ? await response.json() : null;
        const requestId = data?.requestId ?? undefined;

        if (!response.ok || !data?.ok) {
          const message =
            data?.error ?? "LLM-Analyse fehlgeschlagen. OPENAI_API_KEY konfiguriert?";
          onAnalysisStateChange((prev) => ({
            ...prev,
            representativityResults: {
              ...prev.representativityResults,
              [context.experimentId]: {
                ...prev.representativityResults[context.experimentId],
                status: "error",
                findings: [],
                requestId,
                error: typeof message === "string" ? message : "Unbekannter Fehler"
              }
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

        onAnalysisStateChange((prev) => ({
          ...prev,
          representativityResults: {
            ...prev.representativityResults,
            [context.experimentId]: {
              ...prev.representativityResults[context.experimentId],
              status: hasFindings ? "findings" : "no_findings",
              findings,
              model: modelUsed,
              requestId,
              fitRecommendation: recommendation,
              summary
            }
          }
        }));
      } catch (error) {
        onAnalysisStateChange((prev) => ({
          ...prev,
          representativityResults: {
            ...prev.representativityResults,
            [context.experimentId]: {
              ...prev.representativityResults[context.experimentId],
              status: "error",
              findings: [],
              error:
                error instanceof Error
                  ? error.message
                  : "Unbekannter Fehler bei der LLM-Analyse"
            }
          }
        }));
      }
    }
    setRunning(false);
  };

  const deviationSummary = useMemo(() => {
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

  const representativitySummary = useMemo(() => {
    const allResults = Object.values(representativityResults);
    const completed = allResults.filter(
      (item) => item.status === "findings" || item.status === "no_findings"
    );
    const withFindings = completed.filter((item) => item.findings.length > 0);
    const errors = allResults.filter((item) => item.status === "error");
    const selected = Object.values(fitSelection).filter(Boolean).length;
    return {
      total: experiments.length,
      completed: completed.length,
      withFindings: withFindings.length,
      errors: errors.length,
      selected
    };
  }, [experiments.length, fitSelection, representativityResults]);

  const filteredResults = useMemo(() => {
    return experiments.filter((experiment) => {
      const deviation = results[experiment.experimentId];
      const representativity = representativityResults[experiment.experimentId];
      if (!deviation || !representativity) return false;
      if (hideClean && deviation.status === "no_findings" && representativity.status === "no_findings") {
        return false;
      }
      if (categoryFilter !== "all") {
        const matchesDeviation = deviation.findings.some(
          (finding) => finding.category === categoryFilter
        );
        if (!matchesDeviation) return false;
      }
      if (representativityFilter !== "all") {
        const matchesRepresentativity = representativity.findings.some(
          (finding) => finding.category === representativityFilter
        );
        if (!matchesRepresentativity) return false;
      }
      return true;
    });
  }, [
    categoryFilter,
    experiments,
    hideClean,
    representativityFilter,
    representativityResults,
    results
  ]);

  if (!table) {
    return (
      <section className="deviation-screen">
        <header className="section-intro">
          <p className="eyebrow">Schritt 3 · Abweichungen & Repräsentativität</p>
          <h2>LLM-gestützte Prüfung auf Abweichungen</h2>
          <p className="muted">
            Lade zuerst Daten und schließe Mapping + Validierung ab, um Kommentar- und
            Parameter-Spalten für die LLM-Prüfung auszuwählen.
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
        <p className="eyebrow">Schritt 3 · Abweichungen & Repräsentativität (LLM)</p>
        <h2>Kommentarspalten scannen und Parameter abgleichen</h2>
        <p className="muted">
          Wähle Kommentar- und Parameter-Spalten einmalig. Pro Experiment laufen dann zwei LLM-Calls
          nacheinander: zuerst der Abweichungs-Scan, danach der Abgleich gegen die Parameter.
          Ergebnis: klare Ontologie-Labels, Inkonsistenzen und eine Fit-Empfehlung in einer Kachel.
        </p>
        <div className="llm-chip">
          LLM · GPT-5 mini-2025-08-07 · Fallback: gpt-5-mini · 2 Calls/Experiment
        </div>
      </header>

      <div className="deviation-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Kommentarspalten</p>
              <h3>Wo könnten Abweichungen erwähnt sein?</h3>
              <p className="muted">
                Markiere Spalten mit Freitext/Kommentaren. Diese Texte liefern Hinweise für beide
                LLM-Calls.
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
                        handleToggle(column.name, selectedDeviationColumns, "selectedDeviationColumns")
                      }
                    />
                    <div className="selector-body">
                      <div className="selector-headline">
                        <span className="column-name">{column.name}</span>
                        <span className={`chip type-${column.typeHeuristic}`}>
                          {column.typeHeuristic}
                        </span>
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
              <p className="eyebrow">Parameter-Spalten</p>
              <h3>Welche Werte gelten als Referenz?</h3>
              <p className="muted">
                Temperatur, Edukt, Additiv, Lösemittel … werden als Referenz an den LLM-Abgleich
                geschickt.
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
                        handleToggle(column.name, selectedParameterColumns, "selectedParameterColumns")
                      }
                    />
                    <div className="selector-body">
                      <div className="selector-headline">
                        <span className="column-name">{column.name}</span>
                        <span className={`chip type-${column.typeHeuristic}`}>
                          {column.typeHeuristic}
                        </span>
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
            <h3>LLM-Scans nacheinander ausführen</h3>
            <p className="muted">
              {experiments.length} Experimente · Kommentarspalten: {selectedDeviationColumns.length}{" "}
              · Parameter-Spalten: {selectedParameterColumns.length}
            </p>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                onAnalysisStateChange((prev) => ({
                  ...prev,
                  selectedDeviationColumns: defaultDeviationColumns,
                  selectedParameterColumns: defaultParameterColumns
                }));
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
                selectedDeviationColumns.length === 0 ||
                selectedParameterColumns.length === 0
              }
            >
              {running ? "LLM läuft..." : "LLM-Scans starten"}
            </button>
          </div>
        </div>

        <div className="analysis-summary">
          <div className="summary-pill">
            <span className="label">Kommentar-Scan</span>
            <strong>
              {deviationSummary.completed}/{deviationSummary.total} abgeschlossen
            </strong>
          </div>
          <div className="summary-pill warning">
            <span className="label">Abweichungen</span>
            <strong>{deviationSummary.withFindings}</strong>
          </div>
          <div className="summary-pill">
            <span className="label">Parameter-Abgleich</span>
            <strong>
              {representativitySummary.completed}/{representativitySummary.total} abgeschlossen
            </strong>
          </div>
          <div className="summary-pill warning">
            <span className="label">Inkonsistenzen</span>
            <strong>{representativitySummary.withFindings}</strong>
          </div>
          <div className="summary-pill muted">
            <span className="label">Für Fit vorgemerkt</span>
            <strong>{representativitySummary.selected}</strong>
          </div>
          <div className="summary-pill danger">
            <span className="label">Fehler</span>
            <strong>{deviationSummary.errors + representativitySummary.errors}</strong>
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
            Abweichungen filtern
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(
                  event.target.value === "all"
                    ? "all"
                    : (event.target.value as DeviationCategory)
                )
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
          <label className="select-filter">
            Abgleich filtern
            <select
              value={representativityFilter}
              onChange={(event) =>
                setRepresentativityFilter(
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
        {filteredResults.map((experiment) => {
          const deviation = results[experiment.experimentId];
          const representativity = representativityResults[experiment.experimentId];
          if (!deviation || !representativity) return null;

          return (
            <article key={experiment.experimentId} className="experiment-card">
              <div className="experiment-card-header">
                <div>
                  <h4>{experiment.name ?? experiment.experimentId}</h4>
                  <p className="meta">ID: {experiment.experimentId}</p>
                </div>
                <div className="status-stack">
                  <span className={statusBadge(deviation.status)}>
                    {statusLabel(deviation.status, "deviation")}
                  </span>
                  <span className={statusBadge(representativity.status)}>
                    {statusLabel(representativity.status, "representativity")}
                  </span>
                </div>
              </div>

              <div className="recommendation-row">
                <span className={recommendationBadge(representativity.fitRecommendation)}>
                  {recommendationLabel(representativity.fitRecommendation)}
                </span>
                <label className="fit-toggle">
                  <input
                    type="checkbox"
                    checked={fitSelection[experiment.experimentId] ?? true}
                    onChange={() => handleSelectionToggle(experiment.experimentId)}
                  />
                  Für Fit vormerken
                </label>
              </div>

              {representativity.summary && (
                <p className="meta summary-text">{representativity.summary}</p>
              )}

              <div className="analysis-sections">
                <section className="analysis-section">
                  <header className="analysis-section-header">
                    <h5>Abweichungen</h5>
                    <span className={statusBadge(deviation.status)}>
                      {statusLabel(deviation.status, "deviation")}
                    </span>
                  </header>

                  {deviation.status === "error" && (
                    <div className="inline-error">
                      <p className="error-title">LLM-Analyse nicht möglich</p>
                      <p className="meta">{deviation.error ?? "Unbekannter Fehler"}</p>
                      {deviation.usedColumns && (
                        <p className="meta">
                          Spalten: {deviation.usedColumns.deviation.join(", ")} (Kommentar) ·{" "}
                          {deviation.usedColumns.parameters.join(", ") || "kein Kontext"}
                        </p>
                      )}
                      <p className="meta">Modell: GPT-5.2 mini · Request: {deviation.requestId ?? "n/a"}</p>
                    </div>
                  )}

                  {(deviation.status === "findings" || deviation.findings.length > 0) && (
                    <div className="finding-list">
                      {deviation.findings.map((finding, index) => {
                        const meta = deviationOntology.find((entry) => entry.id === finding.category);
                        return (
                          <div key={`${deviation.experimentId}-finding-${index}`} className="finding-card">
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

                  {deviation.status === "no_findings" && deviation.findings.length === 0 && (
                    <p className="muted">Keine Hinweise auf Abweichungen in den Kommentarspalten.</p>
                  )}

                  {deviation.status === "pending" && (
                    <p className="muted">Noch nicht gescannt. Bitte LLM-Scans starten.</p>
                  )}

                  {deviation.status === "running" && <p className="muted">LLM liest Kommentare …</p>}

                  <footer className="analysis-section-footer">
                    <span className="meta">LLM: {deviation.model ?? "gpt-5-mini-2025-08-07"}</span>
                    {deviation.requestId && <span className="meta">Request: {deviation.requestId}</span>}
                  </footer>
                </section>

                <section className="analysis-section">
                  <header className="analysis-section-header">
                    <h5>Repräsentativität</h5>
                    <span className={statusBadge(representativity.status)}>
                      {statusLabel(representativity.status, "representativity")}
                    </span>
                  </header>

                  {representativity.status === "error" && (
                    <div className="inline-error">
                      <p className="error-title">LLM-Analyse nicht möglich</p>
                      <p className="meta">{representativity.error ?? "Unbekannter Fehler"}</p>
                      {representativity.usedColumns && (
                        <p className="meta">
                          Spalten: {representativity.usedColumns.reference.join(", ")} (Referenz) ·{" "}
                          {representativity.usedColumns.context.join(", ")} (Kommentar)
                        </p>
                      )}
                      <p className="meta">
                        Modell: GPT-5.2 mini · Request: {representativity.requestId ?? "n/a"}
                      </p>
                    </div>
                  )}

                  {(representativity.status === "findings" || representativity.findings.length > 0) && (
                    <div className="finding-list">
                      {representativity.findings.map((finding, index) => {
                        const meta = representativityOntology.find(
                          (entry) => entry.id === finding.category
                        );
                        return (
                          <div key={`${representativity.experimentId}-finding-${index}`} className="finding-card">
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

                  {representativity.status === "no_findings" && representativity.findings.length === 0 && (
                    <p className="muted">Keine Hinweise auf Inkonsistenzen in den gewählten Spalten.</p>
                  )}

                  {representativity.status === "pending" && (
                    <p className="muted">Noch nicht geprüft. Bitte LLM-Scans starten.</p>
                  )}

                  {representativity.status === "running" && (
                    <p className="muted">LLM gleicht Referenzen ab …</p>
                  )}

                  <footer className="analysis-section-footer">
                    <span className="meta">
                      LLM: {representativity.model ?? "gpt-5-mini-2025-08-07"}
                    </span>
                    {representativity.requestId && (
                      <span className="meta">Request: {representativity.requestId}</span>
                    )}
                  </footer>
                </section>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
