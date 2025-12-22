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

type ImportValidationReportProps = {
  report: ValidationReport | null;
  onBackToMapping: () => void;
  onContinue: () => void;
};

export const ImportValidationReport = ({
  report,
  onBackToMapping,
  onContinue
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
        <h4>Findings</h4>
        {report.findings.length === 0 ? (
          <p className="meta">No issues detected in the imported series.</p>
        ) : (
          <ul>
            {report.findings.map((finding, index) => (
              <li key={`${finding.code}-${index}`}>
                <div>
                  <p className="finding-title">
                    {finding.code.replace(/_/g, " ")}
                  </p>
                  <p className="meta">
                    {finding.message}
                    {finding.seriesName
                      ? ` (${finding.seriesName} · ${finding.experimentName ?? ""})`
                      : ""}
                  </p>
                </div>
                <span className={`severity-pill ${severityTone[finding.severity]}`}>
                  {finding.severity}
                </span>
              </li>
            ))}
          </ul>
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
          disabled={report.status === "broken"}
        >
          Continue
        </button>
      </div>
    </section>
  );
};
