import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { parseFile } from "./lib/import/parseFile";
import { GroupingScreen } from "./components/grouping/GroupingScreen";
import { MappingPanel } from "./components/import/MappingPanel";
import { ValidationScreen } from "./components/validation/ValidationScreen";
import {
  applyMappingToDataset,
  normalizeMappingTable,
  type MappingError,
  type MappingSelection,
  type MappingStats
} from "./lib/import/mapping";
import type { AuditEntry, Dataset, RawTable } from "./lib/import/types";
import type { ValidationReport } from "./lib/import/validation";
import { generateImportValidationReport } from "./lib/import/validation";
import { buildColumnSummaries } from "./lib/columnScan/buildColumnSummaries";
import type { ColumnScanPayload } from "./types/columnScan";

// UI reference draft: design/kinetik-researcher.design-draft.html

type ExperimentStatus = "clean" | "needs-info" | "broken" | "fit-done" | "mixed";

type SampleExperiment = {
  experimentId: string;
  name: string;
  substrate: string;
  temperature: string;
  status: ExperimentStatus;
};

type SidebarExperiment = {
  experimentId: string;
  name: string;
  subtitle: string;
  status: ExperimentStatus;
  source: "imported" | "sample";
  seriesCount?: number;
};

type Question = {
  id: string;
  prompt: string;
  options: string[];
  resolved: boolean;
};

const steps = [
  { id: "import", label: "Import", description: "Datei laden & Rollen vergeben" },
  { id: "validation", label: "Validierung", description: "Import prüfen" },
  { id: "grouping", label: "Gruppierung", description: "Serien bündeln" },
  { id: "modeling", label: "Modeling", description: "Fit & Parameter" },
  { id: "report", label: "Report", description: "Ergebnis teilen" }
];

const sampleExperiments: SampleExperiment[] = Array.from({ length: 20 }, (_, index) => {
  const statusCycle: ExperimentStatus[] = ["clean", "needs-info", "fit-done"];
  const status = statusCycle[index % statusCycle.length];
  return {
    experimentId: `exp-${index + 1}`,
    name: `Experiment ${index + 1}`,
    substrate: index % 2 === 0 ? "Substrate A" : "Substrate B",
    temperature: `${22 + (index % 6)}°C`,
    status
  };
});

const baseQuestions: Question[] = [
  {
    id: "q1",
    prompt: "Is the reaction volume constant across all replicates?",
    options: ["Yes, constant", "No, varies", "Unknown"],
    resolved: false
  },
  {
    id: "q2",
    prompt: "Should we normalize the time-series to t0?",
    options: ["Normalize to t0", "Keep raw", "Depends per replicate"],
    resolved: false
  },
  {
    id: "q3",
    prompt: "Which substrate concentration is the primary reference?",
    options: ["1.0 mM", "2.5 mM", "5.0 mM"],
    resolved: false
  }
];

const initialQuestionsByExperiment = sampleExperiments.reduce<Record<string, Question[]>>(
  (acc, experiment) => {
    acc[experiment.experimentId] = baseQuestions.map((question) => ({ ...question }));
    return acc;
  },
  {}
);

const initialAuditEntries: AuditEntry[] = [
  {
    id: "audit-1",
    ts: "2025-01-05T09:12:00.000Z",
    type: "SYSTEM_SEED",
    payload: {
      summary: "CSV ingested, columns mapped to time/value/metadata."
    }
  },
  {
    id: "audit-2",
    ts: "2025-01-05T09:21:00.000Z",
    type: "SYSTEM_SEED",
    payload: {
      summary: "3 rows missing metadata, 1 outlier in replicate 2."
    }
  }
];

const statusLabel: Record<ExperimentStatus, string> = {
  clean: "Clean",
  "needs-info": "Needs info",
  broken: "Broken",
  "fit-done": "Fit done",
  mixed: "Mixed"
};

const statusTone: Record<ExperimentStatus, string> = {
  clean: "status-clean",
  "needs-info": "status-warning",
  broken: "status-danger",
  "fit-done": "status-done",
  mixed: "status-neutral"
};

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return `${date.toLocaleDateString("en-GB")} ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
};

const createAuditEntry = (type: string, payload: Record<string, unknown>): AuditEntry => ({
  id: `audit-${Math.random().toString(36).slice(2, 10)}`,
  ts: new Date().toISOString(),
  type,
  payload
});

const createDatasetShell = (
  fileName: string,
  createdAt = new Date()
): Dataset => ({
  id: `dataset-${Math.random().toString(36).slice(2, 10)}`,
  name: fileName,
  createdAt: createdAt.toISOString(),
  experiments: [],
  audit: []
});

const findDefaultTimeColumn = (headers: string[]): number | null => {
  const index = headers.findIndex((header) => /\b(time|t)\b/i.test(header.trim()));
  return index >= 0 ? index : null;
};

function App() {
  const [activeStepId, setActiveStepId] = useState<string>(steps[0].id);
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<string[]>([]);
  const [questionsByExperiment, setQuestionsByExperiment] = useState(
    initialQuestionsByExperiment
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>("q1");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState(initialAuditEntries);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [rawTables, setRawTables] = useState<RawTable[]>([]);
  const [activeRawTable, setActiveRawTable] = useState<RawTable | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importFileType, setImportFileType] = useState<string | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mappingSelection, setMappingSelection] = useState<MappingSelection>({
    firstRowIsHeader: true,
    timeColumnIndex: null,
    valueColumnIndices: [],
    experimentColumnIndex: null,
    replicateColumnIndex: null
  });
  const [mappingErrors, setMappingErrors] = useState<MappingError[]>([]);
  const [mappingStats, setMappingStats] = useState<MappingStats | null>(null);
  const [mappingSuccess, setMappingSuccess] = useState<MappingStats | null>(null);
  const [mappingSuccessShown, setMappingSuccessShown] = useState(false);
  const [lastAppliedSelection, setLastAppliedSelection] =
    useState<MappingSelection | null>(null);
  const [importReport, setImportReport] = useState<ValidationReport | null>(null);
  const mappingPanelRef = useRef<HTMLDivElement | null>(null);

  const importedExperiments = useMemo(
    () => dataset?.experiments ?? [],
    [dataset?.experiments]
  );
  const normalizedActiveTable = useMemo(
    () =>
      activeRawTable
        ? normalizeMappingTable(activeRawTable, mappingSelection.firstRowIsHeader)
        : null,
    [activeRawTable, mappingSelection.firstRowIsHeader]
  );
  const experimentStatusMap = useMemo(() => {
    if (!importReport) {
      return new Map<string, ExperimentStatus>();
    }
    return new Map(
      importReport.experimentSummaries.map((summary) => [summary.experimentId, summary.status])
    );
  }, [importReport]);
  const sidebarExperiments = useMemo<SidebarExperiment[]>(() => {
    if (importedExperiments.length > 0) {
      return importedExperiments.map((experiment) => ({
        experimentId: experiment.experimentId,
        name: experiment.name ?? "Untitled experiment",
        subtitle: `${experiment.series.length} series`,
        status: experimentStatusMap.get(experiment.experimentId) ?? "clean",
        source: "imported",
        seriesCount: experiment.series.length
      }));
    }

    return sampleExperiments.map((experiment) => ({
      experimentId: experiment.experimentId,
      name: experiment.name,
      subtitle: `${experiment.substrate} · ${experiment.temperature}`,
      status: experiment.status,
      source: "sample"
    }));
  }, [experimentStatusMap, importedExperiments]);

  const selectedExperiments = useMemo(
    () =>
      sidebarExperiments.filter((experiment) =>
        selectedExperimentIds.includes(experiment.experimentId)
      ),
    [selectedExperimentIds, sidebarExperiments]
  );

  const selectedStatusSummary = useMemo<ExperimentStatus | null>(() => {
    if (selectedExperiments.length === 0) {
      return null;
    }
    const statuses = new Set(selectedExperiments.map((experiment) => experiment.status));
    if (statuses.size === 1) {
      return selectedExperiments[0].status;
    }
    return "mixed";
  }, [selectedExperiments]);

  const activeExperiment = selectedExperiments[0] ?? null;

  const questionsForActive = activeExperiment
    ? questionsByExperiment[activeExperiment.experimentId] ?? []
    : [];

  const unresolvedQuestions = questionsForActive.filter((question) => !question.resolved);

  const activeQuestion = questionsForActive.find(
    (question) => question.id === activeQuestionId
  );

  useEffect(() => {
    if (sidebarExperiments.length === 0) {
      setSelectedExperimentIds([]);
      return;
    }
    setSelectedExperimentIds((prev) => {
      const next = prev.filter((id) =>
        sidebarExperiments.some((experiment) => experiment.experimentId === id)
      );
      if (next.length > 0) {
        return next;
      }
      return [sidebarExperiments[0].experimentId];
    });
  }, [sidebarExperiments]);

  useEffect(() => {
    setQuestionsByExperiment((prev) => {
      const next = { ...prev };
      sidebarExperiments.forEach((experiment) => {
        if (!next[experiment.experimentId]) {
          next[experiment.experimentId] = baseQuestions.map((question) => ({
            ...question
          }));
        }
      });
      return next;
    });
  }, [sidebarExperiments]);

  useEffect(() => {
    if (!activeExperiment) {
      setActiveQuestionId(null);
      return;
    }
    const nextQuestion = questionsByExperiment[activeExperiment.experimentId]?.find(
      (question) => !question.resolved
    );
    setActiveQuestionId(nextQuestion?.id ?? null);
    setSelectedAnswer(null);
  }, [activeExperiment?.experimentId, questionsByExperiment]);

  useEffect(() => {
    setDataset((prev) => (prev ? { ...prev, audit: auditEntries } : prev));
  }, [auditEntries]);

  const columnScanPayload = useMemo<ColumnScanPayload | null>(() => {
    if (!normalizedActiveTable) {
      return null;
    }
    const columnProfiles = buildColumnSummaries(normalizedActiveTable);
    if (columnProfiles.length === 0) {
      return null;
    }
    const getHeader = (index: number | null): string | null =>
      index !== null && columnProfiles[index] ? columnProfiles[index].name : null;
    const valueHeaders = mappingSelection.valueColumnIndices
      .map((index) => columnProfiles[index]?.name)
      .filter((header): header is string => typeof header === "string");

    const structuralSummary = {
      time: getHeader(mappingSelection.timeColumnIndex),
      values: valueHeaders,
      experiment: getHeader(mappingSelection.experimentColumnIndex),
      replicate: getHeader(mappingSelection.replicateColumnIndex)
    };
    const knownStructuralColumns = Array.from(
      new Set(
        [
          structuralSummary.time,
          structuralSummary.experiment,
          structuralSummary.replicate,
          ...structuralSummary.values
        ].filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0
        )
      )
    );

    return {
      columns: columnProfiles,
      experimentCount: mappingStats?.experimentCount ?? null,
      knownStructuralColumns,
      structuralSummary
    };
  }, [mappingSelection, mappingStats, normalizedActiveTable]);

  useEffect(() => {
    if (!activeRawTable) {
      return;
    }
    setMappingSelection({
      firstRowIsHeader: true,
      timeColumnIndex: findDefaultTimeColumn(activeRawTable.headers),
      valueColumnIndices: [],
      experimentColumnIndex: null,
      replicateColumnIndex: null
    });
    setMappingErrors([]);
    setMappingStats(null);
    setMappingSuccess(null);
    setMappingSuccessShown(false);
    setLastAppliedSelection(null);
    setImportReport(null);
  }, [activeRawTable]);

  useEffect(() => {
    if (!mappingSuccess || mappingSuccessShown) {
      return;
    }
    setAuditEntries((prev) => [
      createAuditEntry("MAPPING_SUCCESS_SHOWN", {
        experimentCount: mappingSuccess.experimentCount,
        seriesCount: mappingSuccess.seriesCount,
        pointCount: mappingSuccess.pointCount
      }),
      ...prev
    ]);
    setMappingSuccessShown(true);
  }, [mappingSuccess, mappingSuccessShown]);

  const isSameSelection = (
    current: MappingSelection,
    last: MappingSelection | null
  ): boolean => {
    if (!last) {
      return false;
    }
    return (
      current.firstRowIsHeader === last.firstRowIsHeader &&
      current.timeColumnIndex === last.timeColumnIndex &&
      current.experimentColumnIndex === last.experimentColumnIndex &&
      current.replicateColumnIndex === last.replicateColumnIndex &&
      current.valueColumnIndices.length === last.valueColumnIndices.length &&
      current.valueColumnIndices.every((value, index) => value === last.valueColumnIndices[index])
    );
  };

  const handleMappingSelectionChange = (next: MappingSelection) => {
    setMappingSelection(next);
    setMappingErrors([]);
    setMappingStats(null);
    if (mappingSuccess && !isSameSelection(next, lastAppliedSelection)) {
      setMappingSuccess(null);
      setMappingSuccessShown(false);
      setLastAppliedSelection(null);
    }
  };

  const scrollToExperimentCard = (experimentId: string) => {
    if (activeStepId !== "validation") {
      return;
    }
    window.setTimeout(() => {
      const element = document.getElementById(`validation-experiment-${experimentId}`);
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        element.focus();
      }
    }, 0);
  };

  const handleExperimentToggle = (id: string) => {
    setSelectedAnswer(null);
    if (selectedExperimentIds.includes(id)) {
      const next = selectedExperimentIds.filter((selectedId) => selectedId !== id);
      setSelectedExperimentIds(next);
      scrollToExperimentCard(id);
      return;
    }
    if (selectedExperimentIds.length >= 3) {
      return;
    }
    setSelectedExperimentIds([...selectedExperimentIds, id]);
    scrollToExperimentCard(id);
  };

  const handleAnswerApply = () => {
    if (!activeExperiment || !activeQuestion || !selectedAnswer) {
      return;
    }

    setQuestionsByExperiment((prev) => {
      const nextQuestions = prev[activeExperiment.experimentId].map((question) => {
        if (question.id !== activeQuestion.id) {
          return question;
        }
        return { ...question, resolved: true };
      });
      return { ...prev, [activeExperiment.experimentId]: nextQuestions };
    });

    setAuditEntries((prev) => [
      createAuditEntry("DECISION_APPLIED", {
        decision: selectedAnswer,
        question: activeQuestion.prompt
      }),
      ...prev
    ]);

    setSelectedAnswer(null);
    const nextUnresolved = unresolvedQuestions.filter(
      (question) => question.id !== activeQuestion.id
    );
    setActiveQuestionId(nextUnresolved[0]?.id ?? null);
  };

  const handleFileUpload = async (file: File) => {
    setImportError(null);
    setImportFileName(file.name);
    setImportFileType(null);
    setRawTables([]);
    setActiveRawTable(null);
    setAvailableSheets([]);
    setSelectedSheet(null);
    setMappingSuccess(null);
    setMappingSuccessShown(false);
    setLastAppliedSelection(null);
    const uploadEntry = createAuditEntry("FILE_UPLOADED", {
      fileName: file.name,
      fileType: file.name.split(".").pop()?.toLowerCase()
    });

    try {
      const result = await parseFile(file);
      setImportFileType(result.fileType);
      setRawTables(result.rawTables);
      setActiveRawTable(result.activeTable);
      setAvailableSheets(result.sheetNames);
      setSelectedSheet(result.activeTable.sheetName ?? result.sheetNames[0] ?? null);

      const parsedEntry = createAuditEntry("FILE_PARSED", {
        fileName: file.name,
        fileType: result.fileType,
        sheet: result.activeTable.sheetName ?? "Sheet1"
      });

      setAuditEntries((prev) => {
        const nextAuditEntries = [parsedEntry, uploadEntry, ...prev];
        setDataset((current) => {
          if (current) {
            return { ...current, experiments: [], name: file.name, audit: nextAuditEntries };
          }
          const shell = createDatasetShell(file.name);
          return { ...shell, audit: nextAuditEntries };
        });
        return nextAuditEntries;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown parse error.";
      setImportError(message);
      const failedEntry = createAuditEntry("FILE_PARSE_FAILED", {
        fileName: file.name,
        message
      });
      setAuditEntries((prev) => [failedEntry, uploadEntry, ...prev]);
    }
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const table = rawTables.find((item) => item.sheetName === sheetName);
    if (!table || !importFileName) {
      return;
    }
    setActiveRawTable(table);
    setDataset((current) => {
      if (!current) {
        return createDatasetShell(importFileName);
      }
      return { ...current, experiments: [] };
    });
  };

  const handleApplyMapping = () => {
    if (!activeRawTable || !importFileName) {
      return;
    }
    const result = applyMappingToDataset({
      table: activeRawTable,
      selection: mappingSelection,
      fileName: importFileName,
      datasetId: dataset?.id,
      createdAt: dataset?.createdAt
    });

    setMappingErrors(result.errors);
    setMappingStats(result.dataset ? result.stats : null);
    setMappingSuccess(null);
    setMappingSuccessShown(false);

    if (!result.dataset || !result.resolvedColumns) {
      return;
    }

    const report = generateImportValidationReport(result.dataset);
    const mappingEntry = createAuditEntry("MAPPING_APPLIED", {
      timeColumn: result.resolvedColumns.time,
      valueColumns: result.resolvedColumns.values,
      experimentColumn: result.resolvedColumns.experiment,
      replicateColumn: result.resolvedColumns.replicate,
      experimentCount: result.stats.experimentCount,
      seriesCount: result.stats.seriesCount,
      pointCount: result.stats.pointCount
    });
    const reportEntry = createAuditEntry("IMPORT_REPORT_GENERATED", {
      status: report.status,
      summary: `${report.status} · ${report.counts.experiments} experiments, ${report.counts.series} series, ${report.counts.points} points, ${report.counts.droppedPoints} dropped.`
    });

    setImportReport(report);
    setAuditEntries((prev) => [reportEntry, mappingEntry, ...prev]);
    setDataset({ ...result.dataset, audit: auditEntries });
    setMappingSuccess(result.stats);
    setLastAppliedSelection(mappingSelection);
  };

  const handleBackToMapping = () => {
    setActiveStepId("import");
    window.setTimeout(() => {
      mappingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      mappingPanelRef.current?.focus();
    }, 0);
  };

  const handleContinueFromValidation = () => {
    if (!importReport || importReport.status === "broken") {
      return;
    }
    if (selectedExperiments.some((experiment) => experiment.status === "broken")) {
      return;
    }
    setActiveStepId("grouping");
  };

  const handleContinueToValidation = () => {
    setActiveStepId("validation");
  };

  const formatAuditPayload = (entry: AuditEntry): string => {
    const payload = entry.payload as Record<string, unknown>;
    if (typeof payload.summary === "string") {
      return payload.summary;
    }
    if (entry.type === "FILE_UPLOADED") {
      const fileName = typeof payload.fileName === "string" ? payload.fileName : "upload";
      return `File ${fileName} queued for parsing.`;
    }
    if (entry.type === "FILE_PARSED") {
      const fileName = typeof payload.fileName === "string" ? payload.fileName : "file";
      const sheet = typeof payload.sheet === "string" ? payload.sheet : "sheet";
      return `Parsed ${fileName} (${sheet}).`;
    }
    if (entry.type === "FILE_PARSE_FAILED") {
      const message = typeof payload.message === "string" ? payload.message : "Parsing failed.";
      return message;
    }
    if (entry.type === "DECISION_APPLIED") {
      const decision = typeof payload.decision === "string" ? payload.decision : "Applied";
      return `Decision: ${decision}.`;
    }
    if (entry.type === "MAPPING_APPLIED") {
      const experiments =
        typeof payload.experimentCount === "number" ? payload.experimentCount : 0;
      const series = typeof payload.seriesCount === "number" ? payload.seriesCount : 0;
      const points = typeof payload.pointCount === "number" ? payload.pointCount : 0;
      return `Mapping applied: ${experiments} experiments, ${series} series, ${points} points.`;
    }
    if (entry.type === "IMPORT_REPORT_GENERATED") {
      const status = typeof payload.status === "string" ? payload.status : "unknown";
      const summary = typeof payload.summary === "string" ? payload.summary : "";
      return summary ? `Import report: ${summary}` : `Import report status: ${status}.`;
    }
    if (entry.type === "MAPPING_SUCCESS_SHOWN") {
      const experiments =
        typeof payload.experimentCount === "number" ? payload.experimentCount : 0;
      const series = typeof payload.seriesCount === "number" ? payload.seriesCount : 0;
      return `Mapping success message shown (${experiments} experiments, ${series} series).`;
    }
    return "Audit entry recorded.";
  };

  const renderImportStep = () => (
    <div className="content-stack">
      <section className="panel upload-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Schritt 1 · Import &amp; Mapping</p>
            <h2>Daten ziehen, Struktur sichern</h2>
            <p className="muted">
              Lade CSV/XLSX, prüfe Kopfzeile und ordne Zeit- und Wertspalten zu. Wir zeigen dir sofort, ob die Struktur stimmig ist.
            </p>
          </div>
          <div className="header-chips">
            <span className="pill muted-pill">Guided Upload</span>
            {importFileName && <span className="pill info-pill">Neu: {importFileName}</span>}
          </div>
        </header>
        <div className="upload-grid">
          <div
            className={`upload-zone ${isDragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) {
                void handleFileUpload(file);
              }
            }}
          >
            <p className="eyebrow">Datei hier ablegen</p>
            <h3>CSV oder XLSX hochladen</h3>
            <p className="muted">
              Wir empfehlen eine Kopfzeile mit sprechenden Namen (time, value, experiment). Kein Format-Raten nötig.
            </p>
            <div className="upload-actions">
              <label className="primary file-picker">
                Datei wählen
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleFileUpload(file);
                    }
                    event.target.value = "";
                  }}
                />
              </label>
              <span className="muted">oder per Drag &amp; Drop hier lassen</span>
            </div>
            {importError && <div className="callout error-callout">{importError}</div>}
            {importFileName && (
              <p className="muted subtle">Zuletzt geladen: {importFileName}</p>
            )}
          </div>
          <div className="upload-guidance">
            <h4>Quick-Checks</h4>
            <ul>
              <li>Erste Zeile = Header (kann gleich angepasst werden).</li>
              <li>Eine Zeitspalte + mindestens eine Wertespalte wählen.</li>
              <li>Optional: Experiment- und Replikat-Spalte angeben.</li>
              <li>Nach dem Mapping siehst du sofort eine Vorschau.</li>
            </ul>
          </div>
        </div>
      </section>

      {activeRawTable && (
        <section className="panel file-summary">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Import-Preview</p>
              <h3>Rohdaten geprüft</h3>
              <p className="muted">
                Wir lesen nur lokale Dateien. Wähle bei Bedarf ein anderes Sheet und prüfe die Header.
              </p>
            </div>
            <div className="stat-block">
              <p className="stat-label">Erkannte Spalten</p>
              <p className="stat-value">{activeRawTable.headers.length}</p>
            </div>
          </header>
          <div className="summary-grid">
            <div>
              <p className="muted">Dateityp</p>
              <p className="strong">{importFileType ?? "Unbekannt"}</p>
            </div>
            <div>
              <p className="muted">Zeilen</p>
              <p className="strong">{activeRawTable.rows.length}</p>
            </div>
            <div>
              <p className="muted">Aktives Sheet</p>
              <div className="sheet-select-row">
                <p className="strong">{activeRawTable.sheetName ?? "Sheet1"}</p>
                {availableSheets.length > 1 && (
                  <select
                    value={selectedSheet ?? ""}
                    onChange={(event) => handleSheetChange(event.target.value)}
                  >
                    {availableSheets.map((sheet) => (
                      <option key={sheet} value={sheet}>
                        {sheet}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
          <div className="headers-preview">
            <p className="muted">Header-Vorschau</p>
            <div className="chip-row">
              {activeRawTable.headers.slice(0, 8).map((header, index) => (
                <span key={`${header}-${index}`} className="chip">
                  {header}
                </span>
              ))}
              {activeRawTable.headers.length > 8 && (
                <span className="chip">+{activeRawTable.headers.length - 8}</span>
              )}
            </div>
          </div>
        </section>
      )}

      {activeRawTable && (
        <div ref={mappingPanelRef} tabIndex={-1} className="mapping-anchor">
          <MappingPanel
            table={activeRawTable}
            fileName={importFileName}
            selection={mappingSelection}
            onSelectionChange={handleMappingSelectionChange}
            onApply={handleApplyMapping}
            errors={mappingErrors}
            stats={mappingStats}
            successStats={mappingSuccess}
            onContinueToValidation={handleContinueToValidation}
          />
        </div>
      )}

      <section className="panel audit-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Audit-Log</p>
            <h3>Nachvollziehbarkeit</h3>
            <p className="muted">Die letzten Schritte aus Import &amp; Mapping.</p>
          </div>
        </header>
        <div className="audit-list compact">
          {auditEntries.slice(0, 4).map((entry) => (
            <article key={entry.id} className="audit-card">
              <div className="audit-meta">
                <span>{formatTimestamp(entry.ts)}</span>
                <span className="tag">{entry.type}</span>
              </div>
              <p className="strong">{formatAuditPayload(entry)}</p>
            </article>
          ))}
          {auditEntries.length === 0 && <p className="muted">Noch keine Einträge vorhanden.</p>}
        </div>
      </section>
    </div>
  );

  const renderStepContent = () => {
    if (activeStepId === "import") {
      return renderImportStep();
    }

    if (activeStepId === "validation") {
      return (
        <div className="page-card">
          <ValidationScreen
            dataset={dataset}
            report={importReport}
            onBackToMapping={handleBackToMapping}
            onContinue={handleContinueFromValidation}
            disableContinue={
              Boolean(importReport?.status === "broken") ||
              selectedExperiments.some((experiment) => experiment.status === "broken")
            }
          />
        </div>
      );
    }

    if (activeStepId === "grouping") {
      return (
        <div className="page-card">
          <GroupingScreen experiments={importedExperiments} columnScanPayload={columnScanPayload} />
        </div>
      );
    }

    if (selectedExperimentIds.length === 0) {
      return (
        <div className="page-card empty-state">
          <h3>No experiment selected</h3>
          <p>Selektiere ein Experiment, um den Schritt zu sehen.</p>
        </div>
      );
    }

    if (selectedExperimentIds.length > 1) {
      return (
        <div className="page-card comparison-grid">
          {selectedStatusSummary && (
            <div className="comparison-header">
              <div>
                <h3>Auswahl im Überblick</h3>
                <p className="meta">Vergleich für den Schritt {steps.find((step) => step.id === activeStepId)?.label ?? ""}.</p>
              </div>
              <span className={`status-pill ${statusTone[selectedStatusSummary]}`}>
                {statusLabel[selectedStatusSummary]}
              </span>
            </div>
          )}
          {selectedExperiments.map((experiment) => (
            <article key={experiment.experimentId} className="comparison-card">
              <h3>{experiment.name}</h3>
              <p className="meta">{experiment.subtitle}</p>
              <div className="step-card">
                <h4>{steps.find((step) => step.id === activeStepId)?.label}</h4>
                <p>
                  Placeholder summary für den aktuellen Schritt. Inhalte folgen, sobald der neue Flow für diesen Schritt steht.
                </p>
                <ul>
                  <li>Dataset quality: stable</li>
                  <li>Model fit: pending</li>
                  <li>Flags: 2 open</li>
                </ul>
              </div>
            </article>
          ))}
        </div>
      );
    }

    if (!activeExperiment) {
      return null;
    }

    if (activeStepId === "modeling") {
      return (
        <div className="page-card workspace-detail">
          <div className="detail-header">
            <div>
              <h2>{activeExperiment.name}</h2>
              <p className="meta">{activeExperiment.subtitle}</p>
            </div>
            <span className={`status-pill ${statusTone[activeExperiment.status]}`}>
              {statusLabel[activeExperiment.status]}
            </span>
          </div>
          <div className="detail-card">
            <h3>Modeling (Preview)</h3>
            <p>
              Der neue Modeling-Screen folgt dem Draft (Parameter links, Plot rechts). Bis dahin dient dieses Paneel als Platzhalter.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="page-card workspace-detail">
        <div className="detail-header">
          <div>
            <h2>{activeExperiment.name}</h2>
            <p className="meta">{activeExperiment.subtitle}</p>
          </div>
          <span className={`status-pill ${statusTone[activeExperiment.status]}`}>
            {statusLabel[activeExperiment.status]}
          </span>
        </div>
        <div className="detail-card">
          <h3>{steps.find((step) => step.id === activeStepId)?.label}</h3>
          <p>
            Dummy content für den kommenden Screen. Wir übernehmen den neuen Draft sukzessive für die weiteren Schritte.
          </p>
          <div className="detail-grid">
            <div>
              <h4>Key signals</h4>
              <ul>
                <li>12 timepoints, 3 replicates</li>
                <li>Baseline drift: low</li>
                <li>Confidence: medium</li>
              </ul>
            </div>
            <div>
              <h4>Next actions</h4>
              <ul>
                <li>Review mapping notes</li>
                <li>Confirm metadata assumptions</li>
                <li>Proceed to model selection</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const activeStepIndex = Math.max(steps.findIndex((step) => step.id === activeStepId), 0);
  const stepProgress =
    steps.length > 1 ? Math.max(0, (activeStepIndex / (steps.length - 1)) * 100) : 0;

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="header-container">
          <div className="brand">
            <div className="logo-box" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 2v7.31l-6.29 10.83a2 2 0 0 0 1.73 2.86h13.12a2 2 0 0 0 1.73-2.86L14 9.31V2" />
                <path d="M8.5 2h7" />
                <path d="M10 16h4" />
              </svg>
            </div>
            <div>
              <p className="eyebrow">Kinetik Researcher</p>
              <h1>Geführter Datensatz-Import</h1>
              <p className="muted">Projekt: Demo Batch · Status: lokal</p>
            </div>
          </div>
          <div className="user-chip">
            <div className="user-meta">
              <p className="strong">Dr. J. Doe</p>
              <p className="muted">Process Engineering</p>
            </div>
            <div className="avatar">JD</div>
          </div>
        </div>
      </header>

      <section className="stepper-container">
        <div className="stepper-track">
          <div className="stepper-progress" style={{ width: `${stepProgress}%` }} />
        </div>
        <div className="stepper-markers">
          {steps.map((step, index) => {
            const isActive = step.id === activeStepId;
            const isCompleted = index < activeStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                className={`stepper-item ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                onClick={() => setActiveStepId(step.id)}
                aria-current={isActive ? "step" : undefined}
              >
                <span className="step-circle">{isCompleted ? "✓" : index + 1}</span>
                <div className="step-labels">
                  <span className="label">{step.label}</span>
                  <span className="muted small">{step.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <main className="main-container">{renderStepContent()}</main>
    </div>
  );
}

export default App;
