import { useMemo, useState } from 'react';
import './App.css';
import {
  experiments,
  initialAudit,
  initialQuestions,
  steps,
  type AuditEntry,
  type Experiment,
  type Question
} from './data/fakeData';

const STATUS_LABELS: Record<Experiment['status'], string> = {
  clean: 'Clean',
  'needs-info': 'Needs info',
  'fit-done': 'Fit done'
};

const STATUS_CLASS: Record<Experiment['status'], string> = {
  clean: 'status status--clean',
  'needs-info': 'status status--needs',
  'fit-done': 'status status--fit'
};

const DESIGN_DRAFT_PATH = 'design/kinetik-researcher.design-draft.html';

const formatTimestamp = () => new Date().toLocaleString();

const getInitialQuestions = () => {
  const base: Record<string, Question[]> = {};
  experiments.forEach((experiment) => {
    base[experiment.id] = (initialQuestions[experiment.id] ?? []).map((question) => ({
      ...question
    }));
  });
  return base;
};

export const App = () => {
  const [selectedIds, setSelectedIds] = useState<string[]>([experiments[0].id]);
  const [activeStep, setActiveStep] = useState(steps[0].id);
  const [panelOpen, setPanelOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ clean: true, needs: true, fit: true });
  const [questionsByExperiment, setQuestionsByExperiment] = useState(getInitialQuestions);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(initialAudit);

  const filteredExperiments = useMemo(() => {
    return experiments.filter((experiment) => {
      if (searchTerm.trim() && !experiment.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      if (experiment.status === 'clean' && !filters.clean) return false;
      if (experiment.status === 'needs-info' && !filters.needs) return false;
      if (experiment.status === 'fit-done' && !filters.fit) return false;
      return true;
    });
  }, [filters.clean, filters.fit, filters.needs, searchTerm]);

  const selectedExperiments = useMemo(
    () => experiments.filter((experiment) => selectedIds.includes(experiment.id)),
    [selectedIds]
  );

  const activeExperiment = selectedExperiments[0];

  const activeQuestions = activeExperiment
    ? questionsByExperiment[activeExperiment.id] ?? []
    : [];

  const openQuestions = activeQuestions.filter((question) => !question.resolved);
  const activeQuestion = openQuestions[0];

  const toggleSelection = (experimentId: string) => {
    setSelectedAnswers({});
    setSelectedIds((prev) => {
      if (prev.includes(experimentId)) {
        const next = prev.filter((id) => id !== experimentId);
        return next.length ? next : prev;
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, experimentId];
    });
  };

  const handleAnswerSelection = (questionId: string, value: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const applyDecision = (question: Question) => {
    const answer = selectedAnswers[question.id];
    if (!answer || !activeExperiment) return;

    setQuestionsByExperiment((prev) => {
      const nextQuestions = prev[activeExperiment.id].map((existing) =>
        existing.id === question.id ? { ...existing, resolved: true } : existing
      );
      return { ...prev, [activeExperiment.id]: nextQuestions };
    });

    const newEntry: AuditEntry = {
      id: `audit-${Date.now()}`,
      timestamp: formatTimestamp(),
      actor: 'user',
      action: `Decision applied for ${activeExperiment.name}`,
      rationale: `${question.prompt} → ${answer}`,
      references: `step:${activeStep}`
    };

    setAuditEntries((prev) => [newEntry, ...prev]);
  };

  const renderQuestionsPane = (experiment: Experiment) => {
    const questions = questionsByExperiment[experiment.id] ?? [];
    const open = questions.filter((question) => !question.resolved);
    const resolved = questions.filter((question) => question.resolved);
    const active = open[0];

    return (
      <section className="card" key={experiment.id}>
        <header className="card__header">
          <div>
            <p className="card__title">{experiment.name}</p>
            <p className="card__meta">{experiment.dataset}</p>
          </div>
          <span className={STATUS_CLASS[experiment.status]}>{STATUS_LABELS[experiment.status]}</span>
        </header>
        <div className="card__body">
          <div className="question-list">
            <h4>Open questions</h4>
            {open.length === 0 && <p className="muted">All questions resolved.</p>}
            {open.map((question) => (
              <div key={question.id} className="question-item">
                <p>{question.prompt}</p>
              </div>
            ))}
          </div>
          {active && (
            <div className="question-active">
              <h4>Active question</h4>
              <p className="question-active__prompt">{active.prompt}</p>
              <div className="question-options">
                {active.options.map((option) => (
                  <button
                    key={option}
                    className={
                      selectedAnswers[active.id] === option
                        ? 'button button--primary'
                        : 'button button--ghost'
                    }
                    type="button"
                    onClick={() => handleAnswerSelection(active.id, option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button
                className="button button--primary"
                type="button"
                onClick={() => applyDecision(active)}
                disabled={!selectedAnswers[active.id]}
              >
                Apply decision
              </button>
            </div>
          )}
          {resolved.length > 0 && (
            <div className="question-resolved">
              <h4>Resolved</h4>
              <ul>
                {resolved.map((question) => (
                  <li key={question.id}>{question.prompt}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderStepContent = (experiment: Experiment) => {
    if (activeStep === 'questions') {
      return renderQuestionsPane(experiment);
    }

    const cards = {
      import: {
        title: 'Import & Mapping',
        description: 'Check column mapping, units, and raw series integrity.',
        items: ['Raw file: kinetics_batch_01.csv', 'Mapping: time → column A', 'Units: ms → s']
      },
      validation: {
        title: 'Validation',
        description: 'Flags and quality checks before modeling.',
        items: ['2 minor warnings', 'Sampling density: OK', 'Baseline drift: none']
      },
      modeling: {
        title: 'Modeling',
        description: 'Select model families and fit settings.',
        items: ['Recommended: First-order decay', 'Initial guess: k = 0.12', 'Fit status: pending']
      },
      diagnostics: {
        title: 'Diagnostics',
        description: 'Residuals, parameter correlation, confidence intervals.',
        items: ['Residuals within tolerance', 'AIC comparison queued', 'Correlation matrix pending']
      },
      report: {
        title: 'Report',
        description: 'Generate narratives and export summaries.',
        items: ['Draft summary ready', 'Export: PDF/Markdown', 'Audit log attached']
      }
    } as const;

    const step = cards[activeStep as Exclude<typeof activeStep, 'questions'>];

    return (
      <section className="card" key={`${experiment.id}-${activeStep}`}>
        <header className="card__header">
          <div>
            <p className="card__title">{step.title}</p>
            <p className="card__meta">{experiment.name}</p>
          </div>
          <span className={STATUS_CLASS[experiment.status]}>{STATUS_LABELS[experiment.status]}</span>
        </header>
        <div className="card__body">
          <p className="card__description">{step.description}</p>
          <ul className="card__list">
            {step.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div>
            <h1>Kinetik Researcher</h1>
            <p className="header-subtitle">Project Atlas · Dataset 05</p>
          </div>
          <span className="badge">Status: Active</span>
        </div>
        <div className="header-actions">
          <button className="button button--ghost" type="button">
            Export
          </button>
          <button className="button button--primary" type="button">
            Generate Report
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <div className="sidebar__search">
            <input
              type="search"
              placeholder="Search experiments"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <p className="muted">Select up to 3 experiments</p>
          </div>
          <div className="sidebar__filters">
            <label>
              <input
                type="checkbox"
                checked={filters.clean}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, clean: event.target.checked }))
                }
              />
              Clean
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.needs}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, needs: event.target.checked }))
                }
              />
              Needs info
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.fit}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, fit: event.target.checked }))
                }
              />
              Fit done
            </label>
          </div>
          <div className="sidebar__list">
            {filteredExperiments.map((experiment) => (
              <button
                key={experiment.id}
                className={
                  selectedIds.includes(experiment.id)
                    ? 'experiment-item experiment-item--active'
                    : 'experiment-item'
                }
                type="button"
                onClick={() => toggleSelection(experiment.id)}
              >
                <div>
                  <p className="experiment-name">{experiment.name}</p>
                  <p className="experiment-meta">
                    {experiment.dataset} · {experiment.temperature}
                  </p>
                </div>
                <span className={STATUS_CLASS[experiment.status]}>
                  {STATUS_LABELS[experiment.status]}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="workspace">
          <nav className="stepper">
            {steps.map((step) => (
              <button
                key={step.id}
                type="button"
                className={step.id === activeStep ? 'stepper__item stepper__item--active' : 'stepper__item'}
                onClick={() => setActiveStep(step.id)}
              >
                {step.label}
              </button>
            ))}
          </nav>

          <div className={selectedIds.length > 1 ? 'workspace__grid' : 'workspace__single'}>
            {selectedExperiments.map((experiment) => renderStepContent(experiment))}
            {selectedExperiments.length === 0 && (
              <div className="empty-state">
                <p>Select an experiment to view details.</p>
              </div>
            )}
          </div>
        </main>

        <aside className={panelOpen ? 'audit-panel' : 'audit-panel audit-panel--collapsed'}>
          <div className="audit-panel__header">
            <div>
              <h3>Audit & Decisions</h3>
              <p className="muted">Chronological log</p>
            </div>
            <button className="button button--ghost" type="button" onClick={() => setPanelOpen(!panelOpen)}>
              {panelOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          {panelOpen && (
            <div className="audit-panel__list">
              {auditEntries.map((entry) => (
                <div key={entry.id} className="audit-entry">
                  <div className="audit-entry__meta">
                    <span className="audit-entry__timestamp">{entry.timestamp}</span>
                    <span className={`pill pill--${entry.actor}`}>{entry.actor}</span>
                  </div>
                  <p className="audit-entry__action">{entry.action}</p>
                  <p className="audit-entry__rationale">{entry.rationale}</p>
                  {entry.references && <p className="audit-entry__ref">{entry.references}</p>}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <footer className="app-footer">
        <p>
          UI skeleton derived from design draft: <code>{DESIGN_DRAFT_PATH}</code>
        </p>
      </footer>
    </div>
  );
};
