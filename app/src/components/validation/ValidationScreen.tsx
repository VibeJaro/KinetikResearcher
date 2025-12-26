import { useMemo } from "react";
import type { Dataset, TimeUnit } from "../../lib/import/types";
import type { ValidationFinding, ValidationReport, ValidationStatus } from "../../lib/import/validation";
import { resolveStatus } from "../../lib/import/validation";
import { computeTimeMetrics, normalizeTimeToSeconds } from "../../lib/validation/time";

const statusLabel: Record<ValidationStatus, string> = {
  clean: "Clean",
  "needs-info": "Needs info",
  broken: "Broken"
};

const statusTone: Record<ValidationStatus, string> = {
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

const chartPalette = ["#2563eb", "#16a34a", "#f59e0b", "#8b5cf6", "#0ea5e9", "#dc2626"];

type ValidationScreenProps = {
  dataset: Dataset | null;
  report: ValidationReport | null;
  selectedTimeUnit: TimeUnit;
  onTimeUnitChange: (next: TimeUnit) => void;
  onBackToMapping: () => void;
  onContinue: () => void;
  disableContinue?: boolean;
};

type SeriesView = {
  id: string;
  name: string;
  tSeconds: number[];
  y: number[];
  color: string;
  metrics: ReturnType<typeof computeTimeMetrics>;
};

type ExperimentView = {
  id: string;
  name: string;
  status: ValidationStatus;
  findings: ValidationFinding[];
  series: SeriesView[];
  metrics: {
    points: number;
    timeSpan: { min: number; max: number };
    dtMin: number;
    dtMedian: number;
    monotonic: boolean;
    droppedPoints: number;
  };
};

const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const formatSeconds = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
};

const buildExperimentViews = ({
  dataset,
  report,
  selectedTimeUnit
}: {
  dataset: Dataset;
  report: ValidationReport;
  selectedTimeUnit: TimeUnit;
}): ExperimentView[] => {
  const findingsByExperiment = new Map<string, ValidationFinding[]>(
    report.experimentSummaries.map((summary) => [summary.experimentId, summary.findings])
  );

  return dataset.experiments.map((experiment) => {
    const seriesViews: SeriesView[] = experiment.series.map((series, index) => {
      const timeInfo = series.meta?.timeInfo;
      const normalized = normalizeTimeToSeconds({
        rawValues: timeInfo?.rawValues ?? series.time,
        detectedType: timeInfo?.detectedType ?? "numeric",
        selectedUnit: selectedTimeUnit,
        declaredUnit: timeInfo?.declaredUnit ?? null
      });
      return {
        id: series.id,
        name: series.name,
        tSeconds: normalized.seconds,
        y: series.y,
        color: chartPalette[index % chartPalette.length],
        metrics: computeTimeMetrics(normalized.seconds)
      };
    });

    const positiveDiffs = seriesViews.flatMap((series) => series.metrics.positiveDiffs);
    const timeMins = seriesViews
      .filter((series) => series.metrics.points > 0)
      .map((series) => series.metrics.minTime);
    const timeMaxes = seriesViews
      .filter((series) => series.metrics.points > 0)
      .map((series) => series.metrics.maxTime);
    const points = seriesViews.reduce((sum, series) => sum + series.metrics.points, 0);
    const droppedPoints = experiment.series.reduce(
      (sum, series) => sum + (series.meta?.droppedPoints ?? 0),
      0
    );
    const findings = findingsByExperiment.get(experiment.id) ?? [];
    const status = resolveStatus(findings);

    return {
      id: experiment.id,
      name: experiment.name,
      status,
      findings,
      series: seriesViews,
      metrics: {
        points,
        timeSpan: {
          min: timeMins.length > 0 ? Math.min(...timeMins) : 0,
          max: timeMaxes.length > 0 ? Math.max(...timeMaxes) : 0
        },
        dtMin: positiveDiffs.length > 0 ? Math.min(...positiveDiffs) : 0,
        dtMedian: median(positiveDiffs),
        monotonic: seriesViews.every((series) => series.metrics.monotonic),
        droppedPoints
      }
    };
  });
};

const focusElementById = (elementId: string) => {
  const element = document.getElementById(elementId);
  if (element instanceof HTMLElement) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus();
  }
};

const renderSeriesPlot = (seriesViews: SeriesView[]) => {
  const width = 520;
  const height = 200;
  const padding = 24;

  const points = seriesViews.flatMap((series) =>
    series.tSeconds.map((t, index) => ({ x: t, y: series.y[index], color: series.color }))
  );

  if (points.length === 0) {
    return (
      <div className="plot-empty">
        <p className="meta">No valid points to plot.</p>
      </div>
    );
  }

  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xRange = maxX - minX || 1;
  const yRange = maxY - minY || 1;

  const scaleX = (value: number) =>
    padding + ((value - minX) / xRange) * (width - padding * 2);
  const scaleY = (value: number) =>
    height - padding - ((value - minY) / yRange) * (height - padding * 2);

  return (
    <div className="plot-container">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Experiment time series plot"
      >
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#e2e8f0"
        />
        <line
          x1={padding}
          y1={height - padding}
          x2={padding}
          y2={padding}
          stroke="#e2e8f0"
        />
        {seriesViews.map((series) => {
          if (series.tSeconds.length === 0) {
            return null;
          }
          const pointString = series.tSeconds
            .map((t, index) => `${scaleX(t)},${scaleY(series.y[index])}`)
            .join(" ");
          return (
            <g key={series.id}>
              <polyline
                points={pointString}
                fill="none"
                stroke={series.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {series.tSeconds.map((t, index) => (
                <circle
                  key={`${series.id}-pt-${index}`}
                  cx={scaleX(t)}
                  cy={scaleY(series.y[index])}
                  r={3}
                  fill="#ffffff"
                  stroke={series.color}
                  strokeWidth={1.5}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="plot-labels">
        <span className="y-label">Signal</span>
        <span className="x-label">t (s)</span>
      </div>
    </div>
  );
};

export const ValidationScreen = ({
  dataset,
  report,
  selectedTimeUnit,
  onTimeUnitChange,
  onBackToMapping,
  onContinue,
  disableContinue = false
}: ValidationScreenProps) => {
  const experimentViews = useMemo(() => {
    if (!dataset || !report) {
      return [];
    }
    return buildExperimentViews({ dataset, report, selectedTimeUnit });
  }, [dataset, report, selectedTimeUnit]);

  if (!dataset || !report) {
    return (
      <div className="empty-state">
        <h3>No validation report yet</h3>
        <p>Apply a mapping to generate the import validation summary.</p>
      </div>
    );
  }

  const statusCounts = experimentViews.reduce(
    (acc, experiment) => {
      acc[experiment.status] += 1;
      return acc;
    },
    { clean: 0, "needs-info": 0, broken: 0 } as Record<ValidationStatus, number>
  );

  return (
    <section className="validation-screen">
      <header className="validation-header">
        <div>
          <h3>Validation</h3>
          <p className="meta">
            Per-experiment quality checks, plots, and time-axis handling.
          </p>
        </div>
        <span className={`status-pill ${statusTone[report.status]}`}>
          {statusLabel[report.status]}
        </span>
      </header>

      <div className="validation-summary">
        <div>
          <p className="meta">Experiments</p>
          <strong>{report.counts.experiments}</strong>
        </div>
        <div>
          <p className="meta">Series</p>
          <strong>{report.counts.series}</strong>
        </div>
        <div>
          <p className="meta">Points</p>
          <strong>{report.counts.points}</strong>
        </div>
        <div>
          <p className="meta">Dropped rows</p>
          <strong>{report.counts.droppedPoints}</strong>
        </div>
        <div>
          <p className="meta">Clean</p>
          <strong>{statusCounts.clean}</strong>
        </div>
        <div>
          <p className="meta">Needs info</p>
          <strong>{statusCounts["needs-info"]}</strong>
        </div>
        <div>
          <p className="meta">Broken</p>
          <strong>{statusCounts.broken}</strong>
        </div>
        <label className="time-unit-selector">
          Time unit
          <select
            value={selectedTimeUnit}
            onChange={(event) => onTimeUnitChange(event.target.value as TimeUnit)}
          >
            <option value="seconds">seconds</option>
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </label>
      </div>

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

      <div className="experiment-validation-grid">
        {experimentViews.map((experiment) => (
          <article
            key={experiment.id}
            id={`validation-experiment-${experiment.id}`}
            tabIndex={-1}
            className="validation-experiment-card"
          >
            <header className="experiment-card-header">
              <div>
                <h4>{experiment.name}</h4>
                <p className="meta">
                  {experiment.findings.length === 0
                    ? "No findings"
                    : `${experiment.findings.length} finding${
                        experiment.findings.length === 1 ? "" : "s"
                      }`}
                </p>
              </div>
              <span className={`status-pill ${statusTone[experiment.status]}`}>
                {statusLabel[experiment.status]}
              </span>
            </header>

            {renderSeriesPlot(experiment.series)}

            <div className="validation-metrics">
              <div>
                <p className="meta">Points</p>
                <strong>{experiment.metrics.points}</strong>
              </div>
              <div>
                <p className="meta">Time span (s)</p>
                <strong>
                  {formatSeconds(experiment.metrics.timeSpan.min)} …{" "}
                  {formatSeconds(experiment.metrics.timeSpan.max)}
                </strong>
              </div>
              <div>
                <p className="meta">Δt min / median (s)</p>
                <strong>
                  {formatSeconds(experiment.metrics.dtMin)} /{" "}
                  {formatSeconds(experiment.metrics.dtMedian)}
                </strong>
              </div>
              <div>
                <p className="meta">Monotonic time</p>
                <strong>{experiment.metrics.monotonic ? "Yes" : "No"}</strong>
              </div>
              <div>
                <p className="meta">Dropped rows</p>
                <strong>{experiment.metrics.droppedPoints}</strong>
              </div>
            </div>

            <div className="validation-findings-list">
              <h5>Findings</h5>
              {experiment.findings.length === 0 ? (
                <p className="meta">No issues detected.</p>
              ) : (
                <ul>
                  {experiment.findings.map((finding, index) => {
                    const findingId = `finding-${experiment.id}-${index}`;
                    return (
                      <li
                        key={`${finding.code}-${index}`}
                        id={findingId}
                        className="validation-finding"
                        onClick={() => focusElementById(findingId)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            focusElementById(findingId);
                          }
                        }}
                      >
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
                                <p className="meta">Series: {finding.seriesName}</p>
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
                        {(finding.details || finding.code) && (
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
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="validation-actions">
        <button type="button" className="ghost" onClick={onBackToMapping}>
          Back to mapping
        </button>
        <button
          type="button"
          className="primary"
          onClick={onContinue}
          disabled={disableContinue}
        >
          Continue
        </button>
      </div>
    </section>
  );
};
