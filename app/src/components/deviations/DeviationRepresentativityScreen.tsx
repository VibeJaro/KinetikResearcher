import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { buildColumnSummaries } from "../../lib/columnScan/buildColumnSummaries";
import type { MappingSelection } from "../../lib/import/mapping";
import type { RawTable } from "../../lib/import/types";
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

type DeviationRepresentativityScreenProps = {
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

const createDeviationResult = (experiment: Experiment): ExperimentDeviationResult => ({
  experimentId: experiment.experimentId,
  experimentName: experiment.name ?? experiment.experimentId,
  status: "pending",
  findings: [],
  model: "gpt-5-mini-2025-08-07"
});

const createRepresentativityResult = (
  experiment: Experiment
): ExperimentRepresentativityResult => ({
  experimentId: experiment.experimentId,
  experimentName: experiment.name ?? experiment.experimentId,
  status: "pending",
  findings: [],
  model: "gpt-5-mini-2025-08-07",
  fitRecommendation: defaultRecommendation()
});

export const DeviationRepresentativityScreen = ({
  experiments,
  table,
  mappingSelection,
  datasetName,
  results,
  selection,
  onResultsChange,
  onSelectionChange
}: DeviationRepresentativityScreenProps) => {
  const [selectedCommentColumns, setSelectedCommentColumns] = useState<string[]>([]);
  const [selectedParameterColumns, setSelectedParameterColumns] = useState<string[]>([]);
  const [deviationResults, setDeviationResults] = useState<
    Record<string, ExperimentDeviationResult>
  >({});
  const [running, setRunning] = useState(false);
  const [hideClean, setHideClean] = useState(false);
  const [deviationFilter, setDeviationFilter] = useState<DeviationCategory | "all">("all");
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

  const defaultCommentColumns = useMemo(() => {
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

  const defaultParameterColumns = useMemo(() => {
    return columnSummaries
      .filter((column) => {
        if (!table) return false;
        if (isStructuralColumn(column.name, table.headers, mappingSelection)) return false;
        const isLikelyParameter =
          column.typeHeuristic === "numeric" ||
          /temp|druck|solv|additiv|educt|edukt|substrat|charge|batch|dose|konz/i.test(
            column.name
          );
        return isLikelyParameter;
      })
      .slice(0, 4)
      .map((column) => column.name);
  }, [columnSummaries, mappingSelection, table]);

  useEffect(() => {
    setSelectedCommentColumns(defaultCommentColumns);
    setSelectedParameterColumns(defaultParameterColumns);
  }, [defaultCommentColumns, defaultParameterColumns]);

  useEffect(() => {
    const initialState = experiments.reduce<Record<string, ExperimentDeviationResult>>(
      (acc, experiment) => {
        acc[experiment.experimentId] = createDeviationResult(experiment);
        return acc;
      },
      {}
    );
    setDeviationResults(initialState);
  }, [experiments]);

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
        nextResults[experiment.experimentId] = createRepresentativityResult(experiment);
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
      const commentColumns = selectedCommentColumns
        .map((column) => {
          const index = headerIndex.get(column);
          if (index === undefined) return null;
          const snippets = collectValues(rows, index, 8, 320);
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
        deviationColumns: commentColumns,
        parameterColumns,
        referenceColumns: parameterColumns,
        contextColumns: commentColumns
      };
    });
  }, [
    experiments,
    experimentRowMap,
    headerIndex,
    selectedCommentColumns,
    selectedParameterColumns,
    table
  ]);

  const handleToggle = (value: string, list: string[], setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const handleSelectionToggle = (experimentId: string) => {
    onSelectionChange((prev) => ({ ...prev, [experimentId]: !prev[experimentId] }));
  };

  const handleRunAnalysis = async () => {
    if (!table || selectedCommentColumns.length === 0 || selectedParameterColumns.length === 0) {
      return;
    }
    setRunning(true);

    for (const context of contexts) {
      const hasSnippets = context.deviationColumns.length > 0;
      if (!hasSnippets) {
        setDeviationResults((prev) => ({
          ...prev,
          [context.experimentId]: {
            ...prev[context.experimentId],
            status: "no_findings",
            findings: [],
            usedColumns: {
              deviation: selectedCommentColumns,
              parameters: selectedParameterColumns
            }
          }
        }));
        onResultsChange((prev) => ({
          ...prev,
          [context.experimentId]: {
            ...prev[context.experimentId],
            status: "no_findings",
            findings: [],
            fitRecommendation: "good",
            summary: "Keine Hinweise in den gewählten Kommentarspalten.",
            usedColumns: {
              reference: selectedParameterColumns,
              context: selectedCommentColumns
            }
          }
        }));
        continue;
      }

      setDeviationResults((prev) => ({
        ...prev,
        [context.experimentId]: {
          ...prev[context.experimentId],
          status: "running",
          findings: [],
          error: undefined,
          usedColumns: {
            deviation: selectedCommentColumns,
            parameters: selectedParameterColumns
          }
        }
      }));
      onResultsChange((prev) => ({
        ...prev,
        [context.experimentId]: {
          ...prev[context.experimentId],
          status: "pending",
          findings: [],
          error: undefined,
          usedColumns: {
            reference: selectedParameterColumns,
            context: selectedCommentColumns
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
          setDeviationResults((prev) => ({
            ...prev,
            [context.experimentId]: {
              ...prev[context.experimentId],
              status: "error",
              findings: [],
              requestId,
              error: typeof message === "string" ? message : "Unbekannter Fehler"
            }
          }));
        } else {
          const findings = Array.isArray(data.result?.findings) ? data.result.findings : [];
          const modelUsed =
            typeof data.result?.model === "string"
              ? (data.result.model as ExperimentDeviationResult["model"])
              : ("gpt-5-mini-2025-08-07" as ExperimentDeviationResult["model"]);
          const hasFindings = findings.length > 0;

          setDeviationResults((prev) => ({
            ...prev,
            [context.experimentId]: {
              ...prev[context.experimentId],
              status: hasFindings ? "findings" : "no_findings",
              findings,
              model: modelUsed,
              requestId
            }
          }));
        }
      } catch (error) {
        setDeviationResults((prev) => ({
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

      onResultsChange((prev) => ({
        ...prev,
        [context.experimentId]: {
          ...prev[context.experimentId],
          status: "running",
          findings: [],
          error: undefined,
          usedColumns: {
            reference: selectedParameterColumns,
            context: selectedCommentColumns
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

  const deviationSummary = useMemo(() => {
    const allResults = Object.values(deviationResults);
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
  }, [deviationResults, experiments.length]);

  const representativitySummary = useMemo(() => {
    const allResults = Object.values(results);
    const completed = allResults.filter(
      (item) => item.status === "findings" || item.status === "no_findings"
    );
    const withFindings = completed.filter((item) => item.findings.length > 0);
    const errors = allResults.filter((item) => item.status === "error");
    const selectedCount = Object.values(selection).filter(Boolean).length;
    return {
      total: experiments.length,
      completed: completed.length,
      withFindings: withFindings.length,
      errors: errors.length,
      selected: selectedCount
    };
  }, [experiments.length, results, selection]);

  const filteredExperiments = useMemo(() => {
    return experiments.filter((experiment) => {
      const deviationResult = deviationResults[experiment.experimentId];
      const representativityResult = results[experiment.experimentId];
      const deviationFindings = deviationResult?.findings ?? [];
      const representativityFindings = representativityResult?.findings ?? [];
      const isClean =
        deviationResult?.status === "no_findings" &&
        representativityResult?.status === "no_findings" &&
        deviationFindings.length === 0 &&
        representativityFindings.length === 0;

      if (hideClean && isClean) return false;
      if (
        deviationFilter !== "all" &&
        !deviationFindings.some((finding) => finding.category === deviationFilter)
      ) {
        return false;
      }
      if (
        representativityFilter !== "all" &&
        !representativityFindings.some(
          (finding) => finding.category === representativityFilter
        )
      ) {
        return false;
      }
      return true;
    });
  }, [
    deviationFilter,
    deviationResults,
    experiments,
    hideClean,
    representativityFilter,
    results
  ]);

  if (!table) {
    return (
      <section className="deviation-screen">
        <header className="section-intro">
          <p className="eyebrow">Schritt 3 · Abweichungen & Repräsentativität</p>
          <h2>Kommentarspalten scannen und Fit-Auswahl vorbereiten</h2>
          <p className="muted">
            Lade zuerst Daten und schließe Mapping + Validierung ab, um Kommentar- und
            Parameterspalten für den kombinierten LLM-Scan auszuwählen.
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
        <h2>Kommentarspalten scannen und Fit-Auswahl vorbereiten</h2>
        <p className="muted">
          Wähle Kommentar- und Parameterspalten, starte dann den kombinierten LLM-Scan. Pro
          Experiment laufen zwei Calls nacheinander: zuerst der Abweichungsscan, danach der
          Repräsentativitäts-Check. Ergebnisse werden zusammen angezeigt – inklusive Fit-Empfehlung
          und Auswahl für den Fit.
        </p>
        <div className="llm-chip">LLM · GPT-5 mini-2025-08-07 · Fallback: gpt-5-mini · 2 Calls/Experiment</div>
      </header>

      <div className="analysis-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Kommentarspalten</p>
              <h3>Wo könnten Abweichungen erwähnt sein?</h3>
              <p className="muted">
                Markiere Spalten mit Freitext/Kommentaren. Diese Spalten werden für beide LLM-Checks
                genutzt.
              </p>
            </div>
          </div>
          <div className="selector-list">
            {columnSummaries
              .filter((column) => !isStructuralColumn(column.name, table.headers, mappingSelection))
              .map((column) => {
                const checked = selectedCommentColumns.includes(column.name);
                const example = column.examples[0];
                return (
                  <label key={column.name} className="selector-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        handleToggle(column.name, selectedCommentColumns, setSelectedCommentColumns)
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
              <p className="eyebrow">Parameterspalten</p>
              <h3>Welche Spalten beschreiben die Versuchs-Parameter?</h3>
              <p className="muted">
                Temperatur, Edukt, Additiv, Lösemittel … werden für den Abgleich mit den Kommentaren
                genutzt.
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
                        handleToggle(
                          column.name,
                          selectedParameterColumns,
                          setSelectedParameterColumns
                        )
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
            <h3>Kombinierten LLM-Scan ausführen</h3>
            <p className="muted">
              {experiments.length} Experimente · Kommentarspalten: {selectedCommentColumns.length} ·
              Parameterspalten: {selectedParameterColumns.length}
            </p>
          </div>
          <div className="action-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSelectedCommentColumns(defaultCommentColumns);
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
              disabled={
                running ||
                selectedCommentColumns.length === 0 ||
                selectedParameterColumns.length === 0
              }
            >
              {running ? "LLM läuft..." : "LLM-Scan starten"}
            </button>
          </div>
        </div>

        <div className="analysis-summary">
          <div className="summary-pill">
            <span className="label">Abweichungen</span>
            <strong>
              {deviationSummary.withFindings} Auffälligkeiten
            </strong>
            <p className="meta">
              {deviationSummary.completed}/{deviationSummary.total} abgeschlossen · {deviationSummary.errors} Fehler
            </p>
          </div>
          <div className="summary-pill">
            <span className="label">Repräsentativität</span>
            <strong>
              {representativitySummary.withFindings} Inkonsistenzen
            </strong>
            <p className="meta">
              {representativitySummary.completed}/{representativitySummary.total} abgeschlossen · {representativitySummary.errors} Fehler
            </p>
          </div>
          <div className="summary-pill muted">
            <span className="label">Für Fit vorgemerkt</span>
            <strong>{representativitySummary.selected}</strong>
            <p className="meta">Experimente werden standardmäßig ausgewählt.</p>
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
              value={deviationFilter}
              onChange={(event) =>
                setDeviationFilter(
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
            Repräsentativität filtern
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
        {filteredExperiments.map((experiment) => {
          const deviationResult = deviationResults[experiment.experimentId] ??
            createDeviationResult(experiment);
          const representativityResult = results[experiment.experimentId] ??
            createRepresentativityResult(experiment);
          return (
            <article key={experiment.experimentId} className="experiment-card">
              <div className="experiment-card-header">
                <div>
                  <h4>{experiment.name ?? experiment.experimentId}</h4>
                  <p className="meta">ID: {experiment.experimentId}</p>
                </div>
                <div className="status-pair">
                  <span className={statusBadge(deviationResult.status)}>
                    {deviationResult.status === "findings" && "⚠️ Abweichungen"}
                    {deviationResult.status === "no_findings" && "✅ Keine Abweichungen"}
                    {deviationResult.status === "running" && "⏳ Abweichungen laufen"}
                    {deviationResult.status === "pending" && "⏸ Abweichungen offen"}
                    {deviationResult.status === "error" && "❌ Abweichung fehlgeschlagen"}
                  </span>
                  <span className={statusBadge(representativityResult.status)}>
                    {representativityResult.status === "findings" && "⚠️ Inkonsistenzen"}
                    {representativityResult.status === "no_findings" && "✅ Keine Inkonsistenzen"}
                    {representativityResult.status === "running" && "⏳ Abgleich läuft"}
                    {representativityResult.status === "pending" && "⏸ Abgleich offen"}
                    {representativityResult.status === "error" && "❌ Abgleich fehlgeschlagen"}
                  </span>
                </div>
              </div>

              <div className="experiment-sections">
                <section className="experiment-section">
                  <div className="experiment-section-header">
                    <div>
                      <h5>Abweichungen</h5>
                      <p className="meta">Kommentarspalten-Scan</p>
                    </div>
                    <span className={statusBadge(deviationResult.status)}>
                      {deviationResult.status === "findings" && "Auffälligkeiten"}
                      {deviationResult.status === "no_findings" && "Keine Auffälligkeiten"}
                      {deviationResult.status === "running" && "LLM läuft"}
                      {deviationResult.status === "pending" && "Offen"}
                      {deviationResult.status === "error" && "Fehler"}
                    </span>
                  </div>

                  {deviationResult.status === "error" && (
                    <div className="inline-error">
                      <p className="error-title">LLM-Analyse nicht möglich</p>
                      <p className="meta">{deviationResult.error ?? "Unbekannter Fehler"}</p>
                      {deviationResult.usedColumns && (
                        <p className="meta">
                          Spalten: {deviationResult.usedColumns.deviation.join(", ")} (Kommentar) ·{" "}
                          {deviationResult.usedColumns.parameters.join(", ") || "kein Kontext"}
                        </p>
                      )}
                      <p className="meta">
                        Modell: GPT-5.2 mini · Request: {deviationResult.requestId ?? "n/a"}
                      </p>
                    </div>
                  )}

                  {(deviationResult.status === "findings" || deviationResult.findings.length > 0) && (
                    <div className="finding-list">
                      {deviationResult.findings.map((finding, index) => {
                        const meta = deviationOntology.find((entry) => entry.id === finding.category);
                        return (
                          <div
                            key={`${experiment.experimentId}-deviation-${index}`}
                            className="finding-card"
                          >
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

                  {deviationResult.status === "no_findings" && deviationResult.findings.length === 0 && (
                    <p className="muted">
                      Keine Hinweise auf Abweichungen in den gewählten Kommentarspalten.
                    </p>
                  )}

                  {deviationResult.status === "pending" && (
                    <p className="muted">Noch nicht gescannt. Bitte LLM-Scan starten.</p>
                  )}

                  {deviationResult.status === "running" && <p className="muted">LLM liest Kommentare …</p>}

                  <footer className="experiment-section-footer">
                    <span className="meta">
                      LLM: {deviationResult.model ?? "gpt-5-mini-2025-08-07"}
                    </span>
                    {deviationResult.requestId && <span className="meta">Request: {deviationResult.requestId}</span>}
                  </footer>
                </section>

                <section className="experiment-section">
                  <div className="experiment-section-header">
                    <div>
                      <h5>Repräsentativität</h5>
                      <p className="meta">Abgleich mit Parameterspalten</p>
                    </div>
                    <span className={statusBadge(representativityResult.status)}>
                      {representativityResult.status === "findings" && "Inkonsistenzen"}
                      {representativityResult.status === "no_findings" && "Keine Inkonsistenzen"}
                      {representativityResult.status === "running" && "LLM läuft"}
                      {representativityResult.status === "pending" && "Offen"}
                      {representativityResult.status === "error" && "Fehler"}
                    </span>
                  </div>

                  <div className="recommendation-row">
                    <span className={recommendationBadge(representativityResult.fitRecommendation)}>
                      {recommendationLabel(representativityResult.fitRecommendation)}
                    </span>
                    <label className="fit-toggle">
                      <input
                        type="checkbox"
                        checked={selection[experiment.experimentId] ?? true}
                        onChange={() => handleSelectionToggle(experiment.experimentId)}
                      />
                      Für Fit vormerken
                    </label>
                  </div>

                  {representativityResult.summary && (
                    <p className="meta summary-text">{representativityResult.summary}</p>
                  )}

                  {representativityResult.status === "error" && (
                    <div className="inline-error">
                      <p className="error-title">LLM-Analyse nicht möglich</p>
                      <p className="meta">{representativityResult.error ?? "Unbekannter Fehler"}</p>
                      {representativityResult.usedColumns && (
                        <p className="meta">
                          Spalten: {representativityResult.usedColumns.reference.join(", ")} (Referenz) ·{" "}
                          {representativityResult.usedColumns.context.join(", ")} (Kontext)
                        </p>
                      )}
                      <p className="meta">
                        Modell: GPT-5.2 mini · Request: {representativityResult.requestId ?? "n/a"}
                      </p>
                    </div>
                  )}

                  {(representativityResult.status === "findings" ||
                    representativityResult.findings.length > 0) && (
                    <div className="finding-list">
                      {representativityResult.findings.map((finding, index) => {
                        const meta = representativityOntology.find(
                          (entry) => entry.id === finding.category
                        );
                        return (
                          <div
                            key={`${experiment.experimentId}-representativity-${index}`}
                            className="finding-card"
                          >
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

                  {representativityResult.status === "no_findings" &&
                    representativityResult.findings.length === 0 && (
                      <p className="muted">
                        Keine Hinweise auf Inkonsistenzen in den gewählten Spalten.
                      </p>
                    )}

                  {representativityResult.status === "pending" && (
                    <p className="muted">Noch nicht geprüft. Bitte LLM-Scan starten.</p>
                  )}

                  {representativityResult.status === "running" && (
                    <p className="muted">LLM gleicht Referenzen ab …</p>
                  )}

                  <footer className="experiment-section-footer">
                    <span className="meta">
                      LLM: {representativityResult.model ?? "gpt-5-mini-2025-08-07"}
                    </span>
                    {representativityResult.requestId && (
                      <span className="meta">Request: {representativityResult.requestId}</span>
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
