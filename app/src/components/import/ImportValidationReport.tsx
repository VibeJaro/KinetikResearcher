import type { ValidationReport } from "../../lib/import/validation";

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

const severityIcon: Record<string, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "⛔"
};

type ImportValidationReportProps = {
  report: ValidationReport | null;
  onBackToMapping: () => void;
  onContinue: () => void;
  disableContinue?: boolean;
};

export const ImportValidationReport = ({
  report,
  onBackToMapping,
  onContinue,
  disableContinue = false
}: ImportValidationReportProps) => {
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
        <h4>Findings by experiment</h4>
        {report.datasetFindings.length > 0 && (
          <div className="validation-banner">
            <h5>Dataset-level issues</h5>
            <ul>
              {report.datasetFindings.map((finding) => (
                <li key={finding.code} className="banner-item">
                  <span className={`severity-icon ${severityTone[finding.severity]}`}>
                    {severityIcon[finding.severity]}
                  </span>
                  <div>
                    <p className="finding-title">{finding.title}</p>
                    <p className="meta">{finding.description}</p>
                    {finding.hint && <p className="hint-text">{finding.hint}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {report.experimentSummaries.length === 0 ? (
          <p className="meta">
            {report.datasetFindings.length > 0
              ? "No experiments are available to review yet."
              : "No issues detected in the imported series."}
          </p>
        ) : (
          <div className="experiment-findings">
            {report.experimentSummaries.map((summary) => (
              <article
                key={summary.experimentId}
                id={`validation-experiment-${summary.experimentId}`}
                tabIndex={-1}
                className="experiment-card"
              >
                <header>
                  <div>
                    <h5>{summary.experimentName}</h5>
                    <p className="meta">
                      {summary.findings.length === 0
                        ? "No issues detected for this experiment."
                        : `${summary.findings.length} finding${
                            summary.findings.length === 1 ? "" : "s"
                          }`}
                    </p>
                  </div>
                  <span className={`status-pill ${statusTone[summary.status]}`}>
                    {statusLabel[summary.status]}
                  </span>
                </header>
                {summary.findings.length > 0 && (
                  <ul>
                    {summary.findings.map((finding, index) => (
                      <li key={`${finding.code}-${index}`}>
                        <div className="finding-main">
                          <div className="finding-header">
                            <span
                              className={`severity-icon ${severityTone[finding.severity]}`}
                              aria-hidden="true"
                            >
                              {severityIcon[finding.severity]}
                            </span>
                            <div>
                              <p className="finding-title">{finding.title}</p>
                              <p className="meta">{finding.description}</p>
                              {finding.seriesName && (
                                <p className="meta">
                                  Series: {finding.seriesName}
                                </p>
                              )}
                              {finding.hint && (
                                <p className="hint-text">{finding.hint}</p>
                              )}
                            </div>
                          </div>
                          <span className={`severity-pill ${severityTone[finding.severity]}`}>
                            {finding.severity}
                          </span>
                        </div>
                        <details className="technical-details">
                          <summary>Show technical details</summary>
                          <div className="meta">
                            <p>Code: {finding.code}</p>
                            {finding.details?.droppedPoints !== undefined && (
                              <p>Dropped points: {finding.details.droppedPoints}</p>
                            )}
                            {finding.details?.duplicateCount !== undefined && (
                              <p>Duplicate points: {finding.details.duplicateCount}</p>
                            )}
                            {finding.details?.negativeCount !== undefined && (
                              <p>Negative values: {finding.details.negativeCount}</p>
                            )}
                            {finding.details?.pointCount !== undefined && (
                              <p>Total points: {finding.details.pointCount}</p>
                            )}
                            {finding.details?.timeIssueCount !== undefined && (
                              <p>Non-increasing steps: {finding.details.timeIssueCount}</p>
                            )}
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="validation-actions">
        <button type="button" className="btn btn-ghost" onClick={onBackToMapping}>
          Back to mapping
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onContinue}
          disabled={disableContinue}
        >
          Continue
        </button>
      </div>
    </section>
  );
};
