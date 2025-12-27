import type { Dataset, Series } from "../../lib/import/types";
import type { ValidationReport } from "../../lib/import/validation";
import { normalizeTimeToSeconds, type TimeColumnType } from "../../lib/import/time";
import { ImportValidationReport } from "../import/ImportValidationReport";

type ValidationScreenProps = {
  dataset: Dataset | null;
  report: ValidationReport | null;
  onBackToMapping: () => void;
  onContinue: () => void;
  disableContinue?: boolean;
};

const getTimeType = (series: Series): TimeColumnType => {
  const metaValue = series.meta?.timeType;
  return metaValue === "datetime" ? "datetime" : "numeric";
};

const formatSeconds = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  const fixed = value.toFixed(2);
  return fixed.endsWith(".00") ? fixed.replace(".00", "") : fixed;
};

export const ValidationScreen = ({
  dataset,
  report,
  onBackToMapping,
  onContinue,
  disableContinue = false
}: ValidationScreenProps) => {
  const seriesSummaries =
    dataset?.experiments.flatMap((experiment) =>
      experiment.series.map((series) => {
        const timeType = getTimeType(series);
        const normalizedTime = normalizeTimeToSeconds({
          time: series.time,
          timeType
        });
        const experimentName = experiment.name ?? "Untitled experiment";
        const spanSeconds =
          normalizedTime.length > 1
            ? Math.max(...normalizedTime) - Math.min(...normalizedTime)
            : 0;

        return {
          experimentId: experiment.experimentId,
          experimentName,
          seriesId: series.id,
          seriesName: series.name,
          timeType,
          spanSeconds,
          pointCount: series.time.length
        };
      })
    ) ?? [];

  return (
    <div className="validation-screen">
      {seriesSummaries.length > 0 && (
        <section className="series-metrics">
          <header className="validation-header">
            <div>
              <h3>Series readiness</h3>
              <p className="meta">
                Time spans are normalized to seconds for plotting and quick checks.
              </p>
            </div>
          </header>
          <div className="validation-stats">
            {seriesSummaries.map((summary) => (
              <div key={summary.seriesId} className="experiment-card">
                <header>
                  <div>
                    <h5>{summary.seriesName}</h5>
                    <p className="meta">Experiment: {summary.experimentName}</p>
                  </div>
                </header>
                <p className="meta">
                  Time type: {summary.timeType === "datetime" ? "datetime (relative)" : "numeric"}
                </p>
                <p className="meta">Points: {summary.pointCount}</p>
                <p className="meta">Duration: {formatSeconds(summary.spanSeconds)} s</p>
              </div>
            ))}
          </div>
        </section>
      )}
      <ImportValidationReport
        report={report}
        onBackToMapping={onBackToMapping}
        onContinue={onContinue}
        disableContinue={disableContinue}
      />
    </div>
  );
};
