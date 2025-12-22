import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent
} from "react";
import "./App.css";
import {
  buildDatasetFromRawTable,
  parseCsvText,
  parseXlsxData
} from "./lib/import/parse";
import type {
  AuditEntry,
  Dataset,
  Experiment as ImportedExperiment,
  RawTable
} from "./lib/import/types";

// UI reference draft: design/kinetik-researcher.design-draft.html

type ExperimentStatus = "clean" | "needs-info" | "fit-done";

type SampleExperiment = {
  id: string;
  name: string;
  substrate: string;
  temperature: string;
  status: ExperimentStatus;
};

type Question = {
  id: string;
  prompt: string;
  options: string[];
  resolved: boolean;
};

type SidebarExperiment = {
  id: string;
  name: string;
  meta: string;
  statusLabel: string;
  statusTone: string;
  source: "imported" | "sample";
  raw: SampleExperiment | ImportedExperiment;
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

const statusLabel: Record<ExperimentStatus, string> = {
  clean: "Clean",
  "needs-info": "Needs info",
  "fit-done": "Fit done"
};

const statusTone: Record<ExperimentStatus, string> = {
  clean: "status-clean",
  "needs-info": "status-warning",
  "fit-done": "status-done"
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString("en-GB")} ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
};

const createAuditEntry = (type: string, payload: Record<string, unknown>): AuditEntry => ({
  id: crypto.randomUUID(),
  ts: new Date().toISOString(),
  type,
  payload
});

function App() {
  const [searchValue, setSearchValue] = useState("");
  const [activeStep, setActiveStep] = useState(steps[0]);
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<string[]>([
    sampleExperiments[0]?.id ?? ""
  ]);
  const [questionsByExperiment, setQuestionsByExperiment] = useState(
    initialQuestionsByExperiment
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>("q1");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [filters, setFilters] = useState({
    clean: true,
    needsInfo: true,
    fitDone: true
  });
  const [isAuditOpen, setIsAuditOpen] = useState(true);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [rawTable, setRawTable] = useState<RawTable | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const importedExperiments = useMemo<SidebarExperiment[]>(() => {
    return (dataset?.experiments ?? []).map((experiment) => ({
      id: experiment.id,
      name: experiment.name,
      meta: `${experiment.series.length} series`,
      statusLabel: "Imported",
      statusTone: "status-info",
      source: "imported",
      raw: experiment
    }));
  }, [dataset?.experiments]);

  const sampleExperimentCards = useMemo<SidebarExperiment[]>(() => {
    return sampleExperiments.map((experiment) => ({
      id: experiment.id,
      name: experiment.name,
      meta: `${experiment.substrate} · ${experiment.temperature}`,
      statusLabel: statusLabel[experiment.status],
      statusTone: statusTone[experiment.status],
      source: "sample",
      raw: experiment
    }));
  }, []);

  const allExperiments = useMemo(
    () => [...importedExperiments, ...sampleExperimentCards],
    [importedExperiments, sampleExperimentCards]
  );

  const selectedExperiments = useMemo(
    () => allExperiments.filter((experiment) => selectedExperimentIds.includes(experiment.id)),
    [allExperiments, selectedExperimentIds]
  );

  const filteredExperiments = useMemo(() => {
    const query = searchValue.toLowerCase();
    return sampleExperiments.filter((experiment) => {
      if (query && !experiment.name.toLowerCase().includes(query)) {
        return false;
      }
      if (!filters.clean && experiment.status === "clean") {
        return false;
      }
      if (!filters.needsInfo && experiment.status === "needs-info") {
        return false;
      }
      if (!filters.fitDone && experiment.status === "fit-done") {
        return false;
      }
      return true;
    });
  }, [searchValue, filters]);

  const filteredImportedExperiments = useMemo(() => {
    const query = searchValue.toLowerCase();
    return importedExperiments.filter((experiment) =>
      query ? experiment.name.toLowerCase().includes(query) : true
    );
  }, [importedExperiments, searchValue]);

  const activeExperiment = selectedExperiments[0] ?? null;

  const questionsForActive = activeExperiment
    ? questionsByExperiment[activeExperiment.id] ?? []
    : [];

  const unresolvedQuestions = questionsForActive.filter((question) => !question.resolved);

  const activeQuestion = questionsForActive.find(
    (question) => question.id === activeQuestionId
  );

  useEffect(() => {
    if (!activeExperiment) {
      setActiveQuestionId(null);
      return;
    }
    if (activeExperiment.source !== "sample") {
      setActiveQuestionId(null);
      return;
    }
    const nextQuestion = questionsByExperiment[activeExperiment.id]?.find(
      (question) => !question.resolved
    );
    setActiveQuestionId(nextQuestion?.id ?? null);
    setSelectedAnswer(null);
  }, [activeExperiment?.id, activeExperiment?.source, questionsByExperiment]);

  useEffect(() => {
    if (allExperiments.length === 0) {
      setSelectedExperimentIds([]);
      return;
    }
    setSelectedExperimentIds((prev) => {
      const allowedIds = new Set(allExperiments.map((experiment) => experiment.id));
      const filtered = prev.filter((id) => allowedIds.has(id));
      if (filtered.length === 0) {
        return [allExperiments[0].id];
      }
      return filtered;
    });
  }, [allExperiments]);

  const handleExperimentToggle = (id: string) => {
    setSelectedAnswer(null);
    if (selectedExperimentIds.includes(id)) {
      const next = selectedExperimentIds.filter((selectedId) => selectedId !== id);
      setSelectedExperimentIds(next);
      return;
    }
    if (selectedExperimentIds.length >= 3) {
      return;
    }
    setSelectedExperimentIds([...selectedExperimentIds, id]);
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
        answer: selectedAnswer,
        question: activeQuestion.prompt,
        experimentId: activeExperiment.id
      }),
      ...prev
    ]);

    setSelectedAnswer(null);
    const nextUnresolved = unresolvedQuestions.filter(
      (question) => question.id !== activeQuestion.id
    );
    setActiveQuestionId(nextUnresolved[0]?.id ?? null);
  };

  const handleFileParse = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    setUploadedFileName(file.name);
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const uploadEntry = createAuditEntry("FILE_UPLOADED", {
      name: file.name,
      type: extension,
      size: file.size
    });
    setAuditEntries((prev) => [uploadEntry, ...prev]);

    try {
      let parsedRawTable: RawTable;
      let parsedSheetNames: string[] = [];

      if (extension === "csv") {
        const text = await file.text();
        parsedRawTable = parseCsvText(text);
      } else if (extension === "xlsx") {
        const data = await file.arrayBuffer();
        const parsed = parseXlsxData(data);
        parsedRawTable = parsed.rawTable;
        parsedSheetNames = parsed.sheetNames;
      } else {
        throw new Error("Unsupported file type. Please upload a .csv or .xlsx file.");
      }

      const parsedEntry = createAuditEntry("FILE_PARSED", {
        name: file.name,
        type: extension,
        sheet: parsedRawTable.sheetName ?? null,
        columns: parsedRawTable.headers.length,
        rows: parsedRawTable.rows.length
      });

      const nextAuditEntries = [parsedEntry, uploadEntry];
      setAuditEntries((prev) => [parsedEntry, ...prev]);

      const nextDataset = buildDatasetFromRawTable(file.name, parsedRawTable, nextAuditEntries);
      setDataset(nextDataset);
      setRawTable(parsedRawTable);
      setSheetNames(parsedSheetNames);
      setUploadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse file.";
      setUploadError(message);
      const failureEntry = createAuditEntry("FILE_PARSE_FAILED", {
        name: file.name,
        type: extension,
        message
      });
      setAuditEntries((prev) => [failureEntry, ...prev]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    void handleFileParse(file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    void handleFileParse(file);
  };

  const renderImportStep = () => {
    return (
      <div className="import-panel">
        <div
          className={`upload-card ${isDragActive ? "drag-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={handleDrop}
        >
          <div>
            <h3>Upload data file</h3>
            <p className="meta">
              Drag & drop a .csv or .xlsx file here. We will parse headers + rows and
              create a draft dataset.
            </p>
          </div>
          <div className="upload-actions">
            <button
              type="button"
              className="primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? "Parsing..." : "Choose file"}
            </button>
            <span className="hint">Supported: .csv, .xlsx</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileInputChange}
            hidden
          />
        </div>
        {uploadError && <p className="upload-error">Error: {uploadError}</p>}
        {rawTable && (
          <div className="detail-card rawtable-preview">
            <div className="detail-header">
              <div>
                <h3>Parsed table preview</h3>
                <p className="meta">
                  {uploadedFileName ?? "Uploaded file"} · {rawTable.rows.length} rows ·{" "}
                  {rawTable.headers.length} columns
                </p>
              </div>
              {rawTable.sheetName && (
                <span className="status-pill status-info">
                  Sheet: {rawTable.sheetName}
                </span>
              )}
            </div>
            {sheetNames.length > 1 && (
              <p className="hint">
                {sheetNames.length} sheets detected. Sheet selection will be available
                in a later step.
              </p>
            )}
            <div className="rawtable-grid">
              <div>
                <h4>Headers</h4>
                <ul>
                  {rawTable.headers.slice(0, 6).map((header) => (
                    <li key={header}>{header}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Sample row</h4>
                <ul>
                  {(rawTable.rows[0] ?? []).slice(0, 6).map((value, index) => (
                    <li key={`${index}-${String(value)}`}>{String(value ?? "∅")}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Auto-mapping</h4>
                {dataset?.experiments.length ? (
                  <p className="meta">
                    1 experiment created with {dataset.experiments[0].series.length}{" "}
                    series.
                  </p>
                ) : (
                  <p className="meta">
                    No time/value pair detected yet. Mapping will be configured in
                    the next step.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderStepContent = () => {
    if (activeStep === "Import & Mapping") {
      return renderImportStep();
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
              <p className="meta">{experiment.meta}</p>
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
      if (activeExperiment.source !== "sample") {
        return (
          <div className="empty-state">
            <h3>No questions yet</h3>
            <p>Questions will appear after mapping is reviewed.</p>
          </div>
        );
      }
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

    const importedExperiment =
      activeExperiment.source === "imported"
        ? (activeExperiment.raw as ImportedExperiment)
        : null;

    return (
      <div className="workspace-detail">
        <div className="detail-header">
          <div>
            <h2>{activeExperiment.name}</h2>
            <p className="meta">
              {activeExperiment.meta}
            </p>
          </div>
          <span className={`status-pill ${activeExperiment.statusTone}`}>
            {activeExperiment.statusLabel}
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
                {activeExperiment.source === "imported" && importedExperiment ? (
                  <>
                    <li>Auto-mapped series count: {importedExperiment.series.length}</li>
                    <li>Rows available: {rawTable?.rows.length ?? 0}</li>
                    <li>Columns available: {rawTable?.headers.length ?? 0}</li>
                  </>
                ) : (
                  <>
                    <li>12 timepoints, 3 replicates</li>
                    <li>Baseline drift: low</li>
                    <li>Confidence: medium</li>
                  </>
                )}
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

  const formatAuditPayload = (entry: AuditEntry) => {
    if (entry.type === "FILE_UPLOADED") {
      return `File: ${entry.payload.name ?? "unknown"} · Type: ${
        entry.payload.type ?? "unknown"
      }`;
    }
    if (entry.type === "FILE_PARSED") {
      return `Sheet: ${entry.payload.sheet ?? "n/a"} · Rows: ${
        entry.payload.rows ?? "?"
      }`;
    }
    if (entry.type === "FILE_PARSE_FAILED") {
      return `Failure: ${entry.payload.message ?? "Unknown error"}`;
    }
    if (entry.type === "DECISION_APPLIED") {
      return `Answer: ${entry.payload.answer ?? ""}`;
    }
    return JSON.stringify(entry.payload);
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
              <p className="section-title">Experiments</p>
              <span className="badge">Selected {selectedExperimentIds.length}/3</span>
            </div>
            {importedExperiments.length > 0 && (
              <>
                <p className="section-subtitle">Imported dataset</p>
                <ul className="experiment-list">
                  {filteredImportedExperiments.map((experiment) => {
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
                            <p className="meta">{experiment.meta}</p>
                          </div>
                          <span className={`status-dot ${experiment.statusTone}`}>
                            {experiment.statusLabel}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <p className="section-subtitle">
              {importedExperiments.length > 0
                ? "Sample experiments (placeholder)"
                : "Sample experiments"}
            </p>
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
                        <p className="meta">
                          {experiment.substrate} · {experiment.temperature}
                        </p>
                      </div>
                      <span className={`status-dot ${statusTone[experiment.status]}`}>
                        {statusLabel[experiment.status]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="hint">Tip: select up to three experiments to compare.</p>
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
              {auditEntries.length === 0 && (
                <p className="empty-state">No audit entries yet.</p>
              )}
              {auditEntries.map((entry) => (
                <article key={entry.id}>
                  <div className="audit-meta">
                    <span>{formatTimestamp(entry.ts)}</span>
                    <span className="tag">{entry.type}</span>
                  </div>
                  <h4>{entry.type.replace(/_/g, " ")}</h4>
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
