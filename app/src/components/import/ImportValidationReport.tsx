import { useMemo, useState } from "react";
import type { Experiment } from "../../lib/import/types";
import type { ValidationFinding, ValidationReport } from "../../lib/import/validation";

const statusLabel: Record<ValidationReport["status"], string> = {
  clean: "Clean",
  "needs-info": "Needs info",
  broken: "Broken"
};

const statusTone: Record<ValidationReport["status"], string> = {
  clean: "status-clean",
  "needs-info": "status-warning",
  broken: "status-danger"
};

const severityTone: Record<string, string> = {
  info: "severity-info",
  warn: "severity-warn",
  error: "severity-error"
};

type ImportValidationReportProps = {
  report: ValidationReport | null;
  experiments: Experiment[];
  selectedExperimentIds: string[];
  onBackToMapping: () => void;
  onContinue: () => void;
  canContinue: boolean;
};

export const ImportValidationReport = ({
  report,
  experiments,
  selectedExperimentIds,
  onBackToMapping,
  onContinue,
  canContinue
}: ImportValidationReportProps) => {
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});

  const datasetFindings = useMemo(
    () => report?.findings.filter((finding) => !finding.experimentId) ?? [],
    [report]
  );

  const findingsByExperiment = useMemo(() => {
    const map = new Map<string, ValidationFinding[]>();
    report?.findings.forEach((finding) => {
      if (!finding.experimentId) {
        return;
      }
      const existing = map.get(finding.experimentId) ?? [];
      existing.push(finding);
      map.set(finding.experimentId, existing);
    });
    return map;
  }, [report]);

  if (!report) {
    return (
      <div className="empty-state">
        <h3>No validation report yet</h3>
        <p>Apply a mapping to generate the import validation summary.</p>
      </div>
    );
  }

  return (
    <section className="validation-report">
      <header className="validation-header">
        <div>
          <h3>Validation summary</h3>
          <p className="meta">Import checks after mapping.</p>
        </div>
        <span className={`status-pill ${statusTone[report.status]}`}>
          {statusLabel[report.status]}
        </span>
      </header>
      <div className="validation-stats">
        <div>
          <p className="meta">Experiments</p>
          <strong>{report.counts.experiments}</strong>
        </div>
        <div>
          <p className="meta">Series</p>
          <strong>{report.counts.series}</strong>
        </div>
        <div>
          <p className="meta">Total points</p>
          <strong>{report.counts.points}</strong>
        </div>
        <div>
          <p className="meta">Dropped points</p>
          <strong>{report.counts.droppedPoints}</strong>
        </div>
      </div>
      <div className="validation-findings">
        <h4>Findings</h4>
        {datasetFindings.length > 0 && (
          <div className="dataset-banner">
            <strong>Dataset-level issues</strong>
            <ul>
              {datasetFindings.map((finding, index) => (
                <li key={`${finding.code}-${index}`}>
                  <div className="severity-icon severity-error" aria-hidden="true" />
                  <div>
                    <p className="finding-title">{finding.title}</p>
                    <p className="meta">{finding.summary}</p>
                    {finding.hint && <p className="meta">{finding.hint}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {report.findings.length === 0 ? (
          <p className="meta">No issues detected in the imported series.</p>
        ) : (
          <div className="experiment-findings">
            {experiments.map((experiment) => {
              const findings = findingsByExperiment.get(experiment.id) ?? [];
              const isSelected = selectedExperimentIds.includes(experiment.id);
              return (
                <article
                  key={experiment.id}
                  id={`validation-exp-${experiment.id}`}
                  className={`experiment-card ${isSelected ? "selected" : ""}`}
                  tabIndex={-1}
                >
                  <header>
                    <h5>{experiment.name}</h5>
                    <span className="meta">
                      {findings.length === 0
                        ? "No issues detected."
                        : `${findings.length} finding${findings.length === 1 ? "" : "s"}`}
                    </span>
                  </header>
                  {findings.length === 0 ? (
                    <p className="meta">This experiment imported cleanly.</p>
                  ) : (
                    <ul>
                      {findings.map((finding, index) => {
                        const key = `${experiment.id}-${finding.code}-${index}`;
                        const isOpen = openDetails[key];
                        return (
                          <li key={key}>
                            <div className="finding-main">
                              <div
                                className={`severity-icon ${severityTone[finding.severity]}`}
                                aria-hidden="true"
                              />
                              <div>
                                <p className="finding-title">{finding.title}</p>
                                <p className="meta">{finding.summary}</p>
                                {finding.hint && <p className="meta">{finding.hint}</p>}
                                {finding.seriesName && (
                                  <p className="meta">Series: {finding.seriesName}</p>
                                )}
                              </div>
                            </div>
                            <div className="finding-actions">
                              <span
                                className={`severity-pill ${severityTone[finding.severity]}`}
                              >
                                {finding.severity}
                              </span>
                              {finding.technicalDetails && (
                                <button
                                  type="button"
                                  className="ghost tiny"
                                  onClick={() =>
                                    setOpenDetails((prev) => ({
                                      ...prev,
                                      [key]: !isOpen
                                    }))
                                  }
                                >
                                  {isOpen ? "Hide technical details" : "Show technical details"}
                                </button>
                              )}
                            </div>
                            {isOpen && finding.technicalDetails && (
                              <div className="technical-details">
                                <p className="meta">{finding.technicalDetails}</p>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
      <div className="validation-actions">
        <button type="button" className="ghost" onClick={onBackToMapping}>
          Back to mapping
        </button>
        <button
          type="button"
          className="primary"
          onClick={onContinue}
          disabled={!canContinue}
        >
          Continue
        </button>
      </div>
    </section>
  );
};
