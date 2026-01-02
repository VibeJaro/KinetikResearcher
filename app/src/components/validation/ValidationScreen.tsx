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

const SeriesPreviewChart = ({
  time,
  values
}: {
  time: number[];
  values: number[];
}) => {
  const viewWidth = 240;
  const viewHeight = 96;
  const padding = 10;
  const pairs = time
    .map((t, index) => ({ x: t, y: values[index] }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (pairs.length === 0) {
    return <p className="meta">Keine numerischen Daten verfügbar.</p>;
  }

  const xMin = Math.min(...pairs.map((p) => p.x));
  const xMax = Math.max(...pairs.map((p) => p.x));
  const yMin = Math.min(...pairs.map((p) => p.y));
  const yMax = Math.max(...pairs.map((p) => p.y));
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const toSvgX = (x: number) =>
    padding + ((x - xMin) / xRange) * (viewWidth - padding * 2);
  const toSvgY = (y: number) =>
    viewHeight - padding - ((y - yMin) / yRange) * (viewHeight - padding * 2);

  const pathData = pairs
    .map((point, index) => `${index === 0 ? "M" : "L"} ${toSvgX(point.x)} ${toSvgY(point.y)}`)
    .join(" ");

  return (
    <svg
      className="series-chart"
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      role="img"
      aria-label="Miniatur-Diagramm der Messwerte"
    >
      <path d={pathData} fill="none" stroke="#0f172a" strokeWidth="1.25" />
      {pairs.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={toSvgX(point.x)}
          cy={toSvgY(point.y)}
          r={3}
          fill="#0f172a"
        />
      ))}
    </svg>
  );
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
        const experimentName = experiment.name ?? "Unbenanntes Experiment";
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
          pointCount: series.time.length,
          normalizedTime,
          values: series.y
        };
      })
    ) ?? [];

  return (
    <div className="validation-screen">
      <section className="validation-guidance">
        <h2>Validierung</h2>
        <p className="meta">
          Hier checkst du, ob die importierten Daten logisch sind, bevor du sie gruppierst oder
          modellierst. Lies die Hinweise, klicke dich durch die Kacheln und entscheide dann, ob du
          weitergehst.
        </p>
        <ul className="guidance-list">
          <li>
            <strong>1. Serien-Check:</strong> Verlauf und Werte kurz ansehen. Wir normalisieren die
            Zeit automatisch auf Sekunden.
          </li>
          <li>
            <strong>2. Findings lesen:</strong> Jede Warnung sagt dir klar, was passiert ist und wie
            du reagieren kannst.
          </li>
          <li>
            <strong>3. Entscheidung:</strong> Wenn alles plausibel aussieht, klick auf „Weiter“ –
            sonst geh mit „Zurück“ noch einmal ins Mapping.
          </li>
        </ul>
      </section>
      {seriesSummaries.length > 0 && (
        <section className="series-metrics">
          <header className="validation-header">
            <div>
              <h3>Serien-Check</h3>
              <p className="meta">
                Jede Kachel zeigt Dauer, Messpunkte und einen Mini-Plot (Punkte + Linie) für einen
                schnellen Plausibilitäts-Check.
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
                <SeriesPreviewChart time={summary.normalizedTime} values={summary.values} />
                <div className="chart-meta">
                  <p className="meta">
                    Zeitachse: {summary.timeType === "datetime" ? "Zeitstempel (relativ)" : "Zahlen"}
                  </p>
                  <p className="meta">Messpunkte: {summary.pointCount}</p>
                  <p className="meta">Dauer: {formatSeconds(summary.spanSeconds)} s</p>
                </div>
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
