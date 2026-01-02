import type { ValidationReport, ValidationSeverity } from "../../lib/import/validation";

const statusLabel: Record<ValidationReport["status"], string> = {
  clean: "Alles sauber",
  "needs-info": "Prüfung nötig",
  broken: "Blocker"
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

const severityLabel: Record<ValidationSeverity, string> = {
  info: "Info",
  warn: "Warnung",
  error: "Fehler"
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
        <h3>Noch kein Validierungsbericht</h3>
        <p>Wende zuerst ein Mapping an, um den Import-Check zu starten.</p>
      </div>
    );
  }

  return (
    <section className="validation-report">
      <header className="validation-header">
        <div>
          <h3>Validierungsbericht</h3>
          <p className="meta">
            Sofort-Check nach dem Mapping. Grün = go, Gelb = nachfragen, Rot = zuerst beheben.
          </p>
          <div className="validation-guidance">
            <ul className="plain-list">
              <li>
                <strong>1. Status oben lesen:</strong> Blocker? Dann zurück zum Mapping, sonst weiter.
              </li>
              <li>
                <strong>2. Zahlen prüfen:</strong> Stimmen Experimente, Reihen und Punkte grob?
              </li>
              <li>
                <strong>3. Befunde öffnen:</strong> Hinweise je Experiment kurz lesen und entscheiden.
              </li>
            </ul>
          </div>
        </div>
        <span className={`status-pill ${statusTone[report.status]}`}>
          {statusLabel[report.status]}
        </span>
      </header>
      <div className="validation-stats">
        <div>
          <p className="meta">Experimente</p>
          <strong>{report.counts.experiments}</strong>
        </div>
        <div>
          <p className="meta">Zeitreihen</p>
          <strong>{report.counts.series}</strong>
        </div>
        <div>
          <p className="meta">Messpunkte gesamt</p>
          <strong>{report.counts.points}</strong>
        </div>
        <div>
          <p className="meta">Verworfene Punkte</p>
          <strong>{report.counts.droppedPoints}</strong>
        </div>
      </div>
      <div className="validation-findings">
        <h4>Befunde nach Experiment</h4>
        {report.datasetFindings.length > 0 && (
          <div className="validation-banner">
            <h5>Hinweise zum gesamten Datensatz</h5>
            <ul>
              {report.datasetFindings.map((finding) => (
                <li key={finding.code} className="banner-item">
                  <span className={`severity-icon ${severityTone[finding.severity]}`}>
                    {severityIcon[finding.severity]}
                  </span>
                  <div>
                    <p className="finding-title">{finding.title}</p>
                    <p className="meta">{finding.description}</p>
                    {finding.hint && <p className="hint-text">Aktion: {finding.hint}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {report.experimentSummaries.length === 0 ? (
          <p className="meta">
            {report.datasetFindings.length > 0
              ? "Es gibt noch keine Experimente zum Prüfen."
              : "Keine Probleme in den importierten Reihen gefunden."}
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
                        ? "Keine Auffälligkeiten für dieses Experiment."
                        : `${summary.findings.length} Befund${
                            summary.findings.length === 1 ? "" : "e"
                          } gefunden.`}
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
                                  Serie: {finding.seriesName}
                                </p>
                              )}
                              {finding.hint && (
                                <p className="hint-text">Aktion: {finding.hint}</p>
                              )}
                            </div>
                          </div>
                          <span className={`severity-pill ${severityTone[finding.severity]}`}>
                            {severityLabel[finding.severity]}
                          </span>
                        </div>
                        <details className="technical-details">
                          <summary>Technische Details anzeigen</summary>
                          <div className="meta">
                            <p>Code: {finding.code}</p>
                            {finding.details?.droppedPoints !== undefined && (
                              <p>Entfernte Punkte: {finding.details.droppedPoints}</p>
                            )}
                            {finding.details?.duplicateCount !== undefined && (
                              <p>Doppelte Punkte: {finding.details.duplicateCount}</p>
                            )}
                            {finding.details?.negativeCount !== undefined && (
                              <p>Negative Werte: {finding.details.negativeCount}</p>
                            )}
                            {finding.details?.pointCount !== undefined && (
                              <p>Gesamtpunkte: {finding.details.pointCount}</p>
                            )}
                            {finding.details?.timeIssueCount !== undefined && (
                              <p>Nicht steigende Schritte: {finding.details.timeIssueCount}</p>
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
          Zurück zum Mapping
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onContinue}
          disabled={disableContinue}
        >
          Weiter zur Gruppierung
        </button>
      </div>
    </section>
  );
};
