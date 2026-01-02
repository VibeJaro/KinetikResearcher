import type { ValidationReport } from "../../lib/import/validation";

const statusLabel: Record<ValidationReport["status"], string> = {
  clean: "Bereit",
  "needs-info": "Info nötig",
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

const severityLabel: Record<string, string> = {
  info: "Hinweis",
  warn: "Warnung",
  error: "Fehler"
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
        <h3>Noch kein Validierungsreport</h3>
        <p>Wende zuerst ein Mapping an, um den Import-Check auszulösen.</p>
      </div>
    );
  }

  return (
    <section className="validation-report">
      <header className="validation-header">
        <div>
          <h3>Validierungsübersicht</h3>
          <p className="meta">
            Ergebnisse des Import-Checks nach dem Mapping. Lies die Hinweise und triff dann deine
            Entscheidung.
          </p>
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
          <p className="meta">Datenreihen</p>
          <strong>{report.counts.series}</strong>
        </div>
        <div>
          <p className="meta">Messpunkte</p>
          <strong>{report.counts.points}</strong>
        </div>
        <div>
          <p className="meta">Verworfene Punkte</p>
          <strong>{report.counts.droppedPoints}</strong>
        </div>
      </div>
      <div className="inline-success">
        <p className="success-title">Kurz-Anleitung</p>
        <ul className="guidance-list">
          <li>Wenn der Status „Bereit“ ist: Du kannst ohne Risiko weiter.</li>
          <li>
            Bei „Info nötig“: Lies die Hinweise, entscheide, ob du zurück ins Mapping gehst oder mit
            den bekannten Einschränkungen fortfährst.
          </li>
          <li>
            Bei „Blocker“: Geh zurück, passe das Mapping an oder bereinige die Quelle, bis die
            Blocker gelöst sind.
          </li>
        </ul>
      </div>
      <div className="validation-findings">
        <h4>Hinweise pro Experiment</h4>
        {report.datasetFindings.length > 0 && (
          <div className="validation-banner">
            <h5>Hinweise auf Datensatz-Ebene</h5>
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
              ? "Noch keine Experimente verfügbar, bitte Mapping oder Datei prüfen."
              : "Keine Auffälligkeiten in den importierten Reihen gefunden."}
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
                        : `${summary.findings.length} Hinweis${
                            summary.findings.length === 1 ? "" : "e"
                          } gefunden`}
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
                                  Datenreihe: {finding.seriesName}
                                </p>
                              )}
                              {finding.hint && (
                                <p className="hint-text">Tipp: {finding.hint}</p>
                              )}
                            </div>
                          </div>
                          <span className={`severity-pill ${severityTone[finding.severity]}`}>
                            {severityLabel[finding.severity] ?? finding.severity}
                          </span>
                        </div>
                        <details className="technical-details">
                          <summary>Technische Details anzeigen</summary>
                          <div className="meta">
                            <p>Code: {finding.code}</p>
                            {finding.details?.droppedPoints !== undefined && (
                              <p>Verworfene Punkte: {finding.details.droppedPoints}</p>
                            )}
                            {finding.details?.duplicateCount !== undefined && (
                              <p>Duplikate: {finding.details.duplicateCount}</p>
                            )}
                            {finding.details?.negativeCount !== undefined && (
                              <p>Negative Werte: {finding.details.negativeCount}</p>
                            )}
                            {finding.details?.pointCount !== undefined && (
                              <p>Gesamtpunkte: {finding.details.pointCount}</p>
                            )}
                            {finding.details?.timeIssueCount !== undefined && (
                              <p>Nicht-monotone Zeitpunkte: {finding.details.timeIssueCount}</p>
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
          Weiter
        </button>
      </div>
    </section>
  );
};
