import type { ValidationReport } from "../../lib/import/validation";

type ValidationReportProps = {
  report: ValidationReport;
  onBackToMapping: () => void;
  onContinue: () => void;
  canContinue: boolean;
};

const statusLabels: Record<ValidationReport["status"], string> = {
  clean: "Clean",
  "needs-info": "Needs info",
  broken: "Broken"
};

const statusTone: Record<ValidationReport["status"], string> = {
  clean: "status-clean",
  "needs-info": "status-warning",
  broken: "status-error"
};

export const ValidationReportPanel = ({
  report,
  onBackToMapping,
  onContinue,
  canContinue
}: ValidationReportProps) => (
  <div className="validation-report">
    <header className="validation-header">
      <div>
        <h3>Validation</h3>
        <p className="meta">
          Experiments: {report.summary.experiments} · Series: {report.summary.series} ·
          Points: {report.summary.totalPoints} · Dropped: {report.summary.droppedPoints}
        </p>
      </div>
      <span className={`status-pill ${statusTone[report.status]}`}>
        {statusLabels[report.status]}
      </span>
    </header>

    <div className="validation-body">
      <h4>Findings</h4>
      {report.findings.length === 0 ? (
        <p className="meta">No validation findings for the current dataset.</p>
      ) : (
        <ul className="validation-findings">
          {report.findings.map((finding, index) => (
            <li key={`${finding.id}-${index}`} className={`finding ${finding.severity}`}>
              <span className="tag">{finding.severity.toUpperCase()}</span>
              <div>
                <p>{finding.message}</p>
                {(finding.experimentName || finding.seriesName) && (
                  <p className="meta">
                    {finding.experimentName ?? "Unknown experiment"} ·{" "}
                    {finding.seriesName ?? "Unknown series"}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>

    <div className="validation-actions">
      <button type="button" className="ghost" onClick={onBackToMapping}>
        Back to mapping
      </button>
      <button type="button" className="primary" onClick={onContinue} disabled={!canContinue}>
        Continue
      </button>
    </div>
  </div>
);
