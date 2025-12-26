import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { parseFile } from "./lib/import/parseFile";
import { MappingPanel } from "./components/import/MappingPanel";
import { ImportValidationReport } from "./components/import/ImportValidationReport";
import {
  applyMappingToDataset,
  type MappingError,
  type MappingSelection,
  type MappingStats
} from "./lib/import/mapping";
import type { AuditEntry, Dataset, RawTable } from "./lib/import/types";
import type { ValidationFinding, ValidationReport } from "./lib/import/validation";
import {
  generateImportValidationReport,
  resolveValidationStatus
} from "./lib/import/validation";

// UI reference draft: design/kinetik-researcher.design-draft.html

type ExperimentStatus = "clean" | "needs-info" | "broken" | "fit-done";

type SampleExperiment = {
  id: string;
  name: string;
  substrate: string;
  temperature: string;
  status: ExperimentStatus;
};

type SidebarExperiment = {
  id: string;
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
  "Import & Mapping",
  "Validation",
  "Questions",
  "Modeling",
  "Diagnostics",
  "Report"
];

const sampleExperiments: SampleExperiment[] = Array.from({ length: 20 }, (_, index) => {
  const statusCycle: ExperimentStatus[] = ["clean", "needs-info", "fit-done"];
  const status = statusCycle[index % statusCycle.length];
  return {
    id: `exp-${index + 1}`,
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
    acc[experiment.id] = baseQuestions.map((question) => ({ ...question }));
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
  "fit-done": "Fit done"
};

const statusTone: Record<ExperimentStatus, string> = {
  clean: "status-clean",
  "needs-info": "status-warning",
  broken: "status-danger",
  "fit-done": "status-done"
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
  const [searchValue, setSearchValue] = useState("");
  const [activeStep, setActiveStep] = useState(steps[0]);
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<string[]>([]);
  const [questionsByExperiment, setQuestionsByExperiment] = useState(
    initialQuestionsByExperiment
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>("q1");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState(initialAuditEntries);
  const [filters, setFilters] = useState({
    clean: true,
    needsInfo: true,
    broken: true,
    fitDone: true
  });
  const [isAuditOpen, setIsAuditOpen] = useState(true);
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
  const [importReport, setImportReport] = useState<ValidationReport | null>(null);
  const mappingPanelRef = useRef<HTMLDivElement | null>(null);
  const validationPanelRef = useRef<HTMLDivElement | null>(null);

  const importedExperiments = dataset?.experiments ?? [];
  const experimentStatusById = useMemo(() => {
    const map = new Map<string, ExperimentStatus>();
    if (!importReport) {
      return map;
    }
    const findingsByExperiment = importReport.findings.reduce(
      (acc, finding) => {
        if (!finding.experimentId) {
          return acc;
        }
        const list = acc.get(finding.experimentId) ?? [];
        list.push(finding);
        acc.set(finding.experimentId, list);
        return acc;
      },
      new Map<string, ValidationFinding[]>()
    );
    importedExperiments.forEach((experiment) => {
      const findings = findingsByExperiment.get(experiment.id) ?? [];
      map.set(experiment.id, resolveValidationStatus(findings));
    });
    return map;
  }, [importReport, importedExperiments]);
  const sidebarExperiments = useMemo<SidebarExperiment[]>(() => {
    if (importedExperiments.length > 0) {
      return importedExperiments.map((experiment) => ({
        id: experiment.id,
        name: experiment.name,
        subtitle: `${experiment.series.length} series`,
        status: experimentStatusById.get(experiment.id) ?? "clean",
        source: "imported",
        seriesCount: experiment.series.length
      }));
    }

    return sampleExperiments.map((experiment) => ({
      id: experiment.id,
      name: experiment.name,
      subtitle: `${experiment.substrate} · ${experiment.temperature}`,
      status: experiment.status,
      source: "sample"
    }));
  }, [importedExperiments, experimentStatusById]);

  const selectedExperiments = useMemo(
    () =>
      sidebarExperiments.filter((experiment) =>
        selectedExperimentIds.includes(experiment.id)
      ),
    [selectedExperimentIds, sidebarExperiments]
  );

  const filteredExperiments = useMemo(() => {
    const query = searchValue.toLowerCase();
    return sidebarExperiments.filter((experiment) => {
      if (query && !experiment.name.toLowerCase().includes(query)) {
        return false;
      }
      if (!filters.clean && experiment.status === "clean") {
        return false;
      }
      if (!filters.needsInfo && experiment.status === "needs-info") {
        return false;
      }
      if (!filters.broken && experiment.status === "broken") {
        return false;
      }
      if (!filters.fitDone && experiment.status === "fit-done") {
        return false;
      }
      return true;
    });
  }, [searchValue, filters, sidebarExperiments]);

  const activeExperiment = selectedExperiments[0] ?? null;

  const questionsForActive = activeExperiment
    ? questionsByExperiment[activeExperiment.id] ?? []
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
        sidebarExperiments.some((experiment) => experiment.id === id)
      );
      if (next.length > 0) {
        return next;
      }
      return [sidebarExperiments[0].id];
    });
  }, [sidebarExperiments]);

  useEffect(() => {
    setQuestionsByExperiment((prev) => {
      const next = { ...prev };
      sidebarExperiments.forEach((experiment) => {
        if (!next[experiment.id]) {
          next[experiment.id] = baseQuestions.map((question) => ({ ...question }));
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
    const nextQuestion = questionsByExperiment[activeExperiment.id]?.find(
      (question) => !question.resolved
    );
    setActiveQuestionId(nextQuestion?.id ?? null);
    setSelectedAnswer(null);
  }, [activeExperiment?.id, questionsByExperiment]);

  useEffect(() => {
    setDataset((prev) => (prev ? { ...prev, audit: auditEntries } : prev));
  }, [auditEntries]);

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
    setImportReport(null);
  }, [activeRawTable]);

  useEffect(() => {
    if (!mappingSuccess) {
      return;
    }
    setMappingSuccess(null);
    setImportReport(null);
  }, [mappingSelection, mappingSuccess]);

  const handleExperimentToggle = (id: string) => {
    setSelectedAnswer(null);
    if (selectedExperimentIds.includes(id)) {
      const next = selectedExperimentIds.filter((selectedId) => selectedId !== id);
      setSelectedExperimentIds(next);
      if (activeStep === "Validation") {
        window.setTimeout(() => {
          const card = document.getElementById(`validation-exp-${id}`);
          card?.scrollIntoView({ behavior: "smooth", block: "start" });
          card?.focus();
        }, 0);
      }
      return;
    }
    if (selectedExperimentIds.length >= 3) {
      return;
    }
    setSelectedExperimentIds([...selectedExperimentIds, id]);
    if (activeStep === "Validation") {
      window.setTimeout(() => {
        const card = document.getElementById(`validation-exp-${id}`);
        card?.scrollIntoView({ behavior: "smooth", block: "start" });
        card?.focus();
      }, 0);
    }
  };

  const handleAnswerApply = () => {
    if (!activeExperiment || !activeQuestion || !selectedAnswer) {
      return;
    }

    setQuestionsByExperiment((prev) => {
      const nextQuestions = prev[activeExperiment.id].map((question) => {
        if (question.id !== activeQuestion.id) {
          return question;
        }
        return { ...question, resolved: true };
      });
      return { ...prev, [activeExperiment.id]: nextQuestions };
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
    setMappingSuccess(null);
    setAvailableSheets([]);
    setSelectedSheet(null);
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

    if (!result.dataset || !result.resolvedColumns) {
      setMappingSuccess(null);
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
    const successEntry = createAuditEntry("MAPPING_SUCCESS_SHOWN", {
      experimentCount: result.stats.experimentCount,
      seriesCount: result.stats.seriesCount
    });

    setImportReport(report);
    setMappingSuccess(result.stats);
    setAuditEntries((prev) =>
      mappingSuccess
        ? [reportEntry, mappingEntry, ...prev]
        : [successEntry, reportEntry, mappingEntry, ...prev]
    );
    setDataset({ ...result.dataset, audit: auditEntries });
  };

  const handleBackToMapping = () => {
    setActiveStep("Import & Mapping");
    window.setTimeout(() => {
      mappingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      mappingPanelRef.current?.focus();
    }, 0);
  };

  const handleContinueFromValidation = () => {
    if (!importReport || importReport.status === "broken") {
      return;
    }
    const selectedHasBroken = selectedExperiments.some(
      (experiment) => experiment.status === "broken"
    );
    if (selectedHasBroken) {
      return;
    }
    setActiveStep("Questions");
  };

  const handleContinueToValidation = () => {
    setActiveStep("Validation");
    window.setTimeout(() => {
      validationPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      validationPanelRef.current?.focus();
    }, 0);
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
      return `Success message shown: ${experiments} experiments, ${series} series created.`;
    }
    return "Audit entry recorded.";
  };

  const renderStepContent = () => {
    if (activeStep === "Import & Mapping") {
      return (
        <div className="import-panel">
          <div
            className={`upload-card ${isDragging ? "dragging" : ""}`}
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
            <h3>Import raw data</h3>
            <p>Drag &amp; drop a .csv or .xlsx file, or choose one to upload.</p>
            <label className="primary file-picker">
              Choose file
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
            {importFileName && (
              <p className="meta">Latest file: {importFileName}</p>
            )}
          </div>
          {importError && <div className="inline-error">{importError}</div>}
          {activeRawTable && (
            <div className="import-summary">
              <h4>Parsed preview</h4>
              <div className="summary-grid">
                <div>
                  <p className="meta">File type: {importFileType ?? "Unknown"}</p>
                  <p className="meta">Rows: {activeRawTable.rows.length}</p>
                  <p className="meta">Columns: {activeRawTable.headers.length}</p>
                </div>
                <div>
                  <p className="meta">
                    Sheet: {activeRawTable.sheetName ?? "Sheet1"}
                  </p>
                  {availableSheets.length > 1 && (
                    <label className="sheet-select">
                      Select sheet
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
                    </label>
                  )}
                </div>
              </div>
              <div className="headers-preview">
                <p className="meta">Headers</p>
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
            </div>
          )}
          {activeRawTable && (
            <div ref={mappingPanelRef} tabIndex={-1} className="mapping-anchor">
              <MappingPanel
                table={activeRawTable}
                fileName={importFileName}
                selection={mappingSelection}
                onSelectionChange={setMappingSelection}
                onApply={handleApplyMapping}
                onContinueToValidation={handleContinueToValidation}
                errors={mappingErrors}
                stats={mappingStats}
                successStats={mappingSuccess}
              />
            </div>
          )}
        </div>
      );
    }

    if (activeStep === "Validation") {
      const selectedHasBroken = selectedExperiments.some(
        (experiment) => experiment.status === "broken"
      );
      const canContinue =
        !!importReport && importReport.status !== "broken" && !selectedHasBroken;
      return (
        <div ref={validationPanelRef} tabIndex={-1} className="validation-anchor">
          <ImportValidationReport
            report={importReport}
            experiments={importedExperiments}
            selectedExperimentIds={selectedExperimentIds}
            onBackToMapping={handleBackToMapping}
            onContinue={handleContinueFromValidation}
            canContinue={canContinue}
          />
        </div>
      );
    }

    if (selectedExperimentIds.length === 0) {
      return (
        <div className="empty-state">
          <h3>No experiment selected</h3>
          <p>Select up to three experiments from the sidebar to begin.</p>
        </div>
      );
    }

    if (selectedExperimentIds.length > 1) {
      return (
        <div className="comparison-grid">
          {selectedExperiments.map((experiment) => (
            <article key={experiment.id} className="comparison-card">
              <h3>{experiment.name}</h3>
              <p className="meta">{experiment.subtitle}</p>
              <div className="step-card">
                <h4>{activeStep}</h4>
                <p>
                  Placeholder summary for {activeStep.toLowerCase()} across selected
                  experiments.
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

    if (activeStep === "Questions") {
      return (
        <div className="questions-view">
          <section className="questions-list">
            <h3>Open questions</h3>
            <ul>
              {questionsForActive.map((question) => (
                <li key={question.id} className={question.resolved ? "resolved" : ""}>
                  <button
                    type="button"
                    onClick={() => setActiveQuestionId(question.id)}
                    disabled={question.resolved}
                  >
                    {question.prompt}
                  </button>
                  {question.resolved && <span className="tag">Resolved</span>}
                </li>
              ))}
            </ul>
          </section>
          <section className="questions-detail">
            <h3>Active question</h3>
            {activeQuestion ? (
              <div className="question-card">
                <p className="question-prompt">{activeQuestion.prompt}</p>
                <div className="answer-grid">
                  {activeQuestion.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={option === selectedAnswer ? "active" : ""}
                      onClick={() => setSelectedAnswer(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="primary"
                  onClick={handleAnswerApply}
                  disabled={!selectedAnswer}
                >
                  Apply decision
                </button>
              </div>
            ) : (
              <p className="empty-state">All questions resolved for this experiment.</p>
            )}
          </section>
        </div>
      );
    }

    return (
      <div className="workspace-detail">
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
          <h3>{activeStep}</h3>
          <p>
            Dummy content for {activeStep.toLowerCase()} to mirror the draft layout. Use
            this panel for step-specific summaries, previews, or placeholders.
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Kinetik Researcher</h1>
          <p className="header-meta">Project: Heme Kinetics · Dataset: Batch 7</p>
        </div>
        <div className="header-status">
          <span className="status-pill status-info">Draft sync</span>
          <button type="button" className="ghost">
            Export
          </button>
          <button type="button" className="primary">Report</button>
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar left">
          <div className="sidebar-section">
            <label className="field-label" htmlFor="search">
              Search
            </label>
            <input
              id="search"
              type="search"
              placeholder="Search experiments"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </div>
          <div className="sidebar-section">
            <p className="section-title">Filters</p>
            <label className="toggle">
              <input
                type="checkbox"
                checked={filters.clean}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, clean: event.target.checked }))
                }
              />
              Clean
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={filters.needsInfo}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, needsInfo: event.target.checked }))
                }
              />
              Needs info
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={filters.broken}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, broken: event.target.checked }))
                }
              />
              Broken
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={filters.fitDone}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, fitDone: event.target.checked }))
                }
              />
              Fit done
            </label>
          </div>
          <div className="sidebar-section">
            <div className="section-header">
              <p className="section-title">
                {importedExperiments.length > 0 ? "Imported experiments" : "Sample experiments"}
              </p>
              <span className="badge">Selected {selectedExperimentIds.length}/3</span>
            </div>
            <ul className="experiment-list">
              {filteredExperiments.map((experiment) => {
                const isSelected = selectedExperimentIds.includes(experiment.id);
                return (
                  <li key={experiment.id}>
                    <button
                      type="button"
                      className={isSelected ? "selected" : ""}
                      onClick={() => handleExperimentToggle(experiment.id)}
                    >
                      <div>
                        <h4>{experiment.name}</h4>
                        <p className="meta">{experiment.subtitle}</p>
                      </div>
                      <span className={`status-dot ${statusTone[experiment.status]}`}>
                        {statusLabel[experiment.status]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="hint">
              Tip: select up to three experiments to compare.
            </p>
          </div>
        </aside>
        <main className="workspace">
          <nav className="stepper">
            {steps.map((step) => (
              <button
                key={step}
                type="button"
                className={step === activeStep ? "active" : ""}
                onClick={() => setActiveStep(step)}
              >
                {step}
              </button>
            ))}
          </nav>
          <section className="workspace-panel">{renderStepContent()}</section>
        </main>
        <aside className={`sidebar right ${isAuditOpen ? "open" : "collapsed"}`}>
          <div className="sidebar-header">
            <h3>Audit log</h3>
            <button type="button" onClick={() => setIsAuditOpen((prev) => !prev)}>
              {isAuditOpen ? "Hide" : "Show"}
            </button>
          </div>
          {isAuditOpen && (
            <div className="audit-list">
              {auditEntries.map((entry) => (
                <article key={entry.id}>
                  <div className="audit-meta">
                    <span>{formatTimestamp(entry.ts)}</span>
                    <span className="tag">{entry.type}</span>
                  </div>
                  <h4>{entry.type}</h4>
                  <p>{formatAuditPayload(entry)}</p>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
