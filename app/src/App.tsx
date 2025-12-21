import { useEffect, useMemo, useState } from "react";
import "./App.css";

// UI reference draft: design/kinetik-researcher.design-draft.html

type ExperimentStatus = "clean" | "needs-info" | "fit-done";

type Experiment = {
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

type AuditEntry = {
  id: string;
  timestamp: string;
  actor: "user" | "agent" | "system";
  action: string;
  rationale: string;
};

const steps = [
  "Import & Mapping",
  "Validation",
  "Questions",
  "Modeling",
  "Diagnostics",
  "Report"
];

const experiments: Experiment[] = Array.from({ length: 20 }, (_, index) => {
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

const initialQuestionsByExperiment = experiments.reduce<Record<string, Question[]>>(
  (acc, experiment) => {
    acc[experiment.id] = baseQuestions.map((question) => ({ ...question }));
    return acc;
  },
  {}
);

const initialAuditEntries: AuditEntry[] = [
  {
    id: "audit-1",
    timestamp: "2025-01-05 09:12",
    actor: "system",
    action: "Import completed",
    rationale: "CSV ingested, columns mapped to time/value/metadata."
  },
  {
    id: "audit-2",
    timestamp: "2025-01-05 09:21",
    actor: "agent",
    action: "Validation flags generated",
    rationale: "3 rows missing metadata, 1 outlier in replicate 2."
  }
];

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

const formatTimestamp = (): string => {
  const now = new Date();
  return `${now.toLocaleDateString("en-GB")} ${now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
};

function App() {
  const [searchValue, setSearchValue] = useState("");
  const [activeStep, setActiveStep] = useState(steps[0]);
  const [selectedExperimentIds, setSelectedExperimentIds] = useState<string[]>([
    experiments[0]?.id ?? ""
  ]);
  const [questionsByExperiment, setQuestionsByExperiment] = useState(
    initialQuestionsByExperiment
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>("q1");
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState(initialAuditEntries);
  const [filters, setFilters] = useState({
    clean: true,
    needsInfo: true,
    fitDone: true
  });
  const [isAuditOpen, setIsAuditOpen] = useState(true);

  const selectedExperiments = useMemo(
    () => experiments.filter((experiment) => selectedExperimentIds.includes(experiment.id)),
    [selectedExperimentIds]
  );

  const filteredExperiments = useMemo(() => {
    const query = searchValue.toLowerCase();
    return experiments.filter((experiment) => {
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
    const nextQuestion = questionsByExperiment[activeExperiment.id]?.find(
      (question) => !question.resolved
    );
    setActiveQuestionId(nextQuestion?.id ?? null);
    setSelectedAnswer(null);
  }, [activeExperiment?.id, questionsByExperiment]);

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
      {
        id: `audit-${prev.length + 1}`,
        timestamp: formatTimestamp(),
        actor: "user",
        action: `Decision applied: ${selectedAnswer}`,
        rationale: activeQuestion.prompt
      },
      ...prev
    ]);

    setSelectedAnswer(null);
    const nextUnresolved = unresolvedQuestions.filter(
      (question) => question.id !== activeQuestion.id
    );
    setActiveQuestionId(nextUnresolved[0]?.id ?? null);
  };

  const renderStepContent = () => {
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
              <p className="meta">{experiment.substrate}</p>
              <p className="meta">{experiment.temperature}</p>
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
            <p className="meta">
              {activeExperiment.substrate} · {activeExperiment.temperature}
            </p>
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
              {auditEntries.map((entry) => (
                <article key={entry.id}>
                  <div className="audit-meta">
                    <span>{entry.timestamp}</span>
                    <span className="tag">{entry.actor}</span>
                  </div>
                  <h4>{entry.action}</h4>
                  <p>{entry.rationale}</p>
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
