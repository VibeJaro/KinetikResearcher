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

type SeriesSummary = {
  experimentId: string;
  experimentName: string;
  seriesId: string;
  seriesName: string;
  timeType: TimeColumnType;
  spanSeconds: number;
  pointCount: number;
  normalizedTime: number[];
  values: number[];
};

const createSparklinePoints = (
  times: number[],
  values: number[],
  width = 260,
  height = 120,
  padding = 12
): { x: number; y: number }[] => {
  if (times.length === 0 || values.length === 0) return [];
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const spanTime = Math.max(maxTime - minTime, 1);
  const spanValue = Math.max(maxValue - minValue, 1e-6);
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  return times.map((time, index) => {
    const x = padding + ((time - minTime) / spanTime) * innerWidth;
    const y = height - padding - ((values[index] - minValue) / spanValue) * innerHeight;
    return { x, y };
  });
};

export const ValidationScreen = ({
  dataset,
  report,
  onBackToMapping,
  onContinue,
  disableContinue = false
}: ValidationScreenProps) => {
  const seriesSummaries: SeriesSummary[] =
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

  const renderSparkline = (summary: SeriesSummary) => {
    const points = createSparklinePoints(summary.normalizedTime, summary.values);
    if (points.length === 0) {
      return <p className="meta">Keine Messwerte vorhanden.</p>;
    }
    const viewBoxWidth = 260;
    const viewBoxHeight = 120;
    return (
      <svg
        className="series-chart"
        role="img"
        aria-label={`Verlauf der Serie ${summary.seriesName}`}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      >
        <polyline
          fill="none"
          stroke="#0f172a"
          strokeWidth="1.5"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        <g>
          {points.map((point, index) => (
            <circle
              key={`${summary.seriesId}-${index}`}
              cx={point.x}
              cy={point.y}
              r={2.5}
              fill="#0f172a"
            />
          ))}
        </g>
      </svg>
    );
  };

  return (
    <div className="validation-screen">
      <section className="validation-intro">
        <p className="eyebrow">Schritt 2 · Validierung</p>
        <h2>1-Minuten-Check: Passen die Daten?</h2>
        <p className="muted">
          Du siehst unten alle Reihen als Kacheln mit Mini-Diagramm, dazu den automatischen
          Validierungsbericht. Ziel: schnell erkennen, ob etwas grob falsch ist.
        </p>
        <ul className="plain-list inline">
          <li>
            <strong>Graph glatt?</strong> Dann ist die Reihe vermutlich ok.
          </li>
          <li>
            <strong>Sprünge/Einbrüche?</strong> Kurz mit Rohdaten abgleichen oder markieren.
          </li>
          <li>
            <strong>Blocker?</strong> Zurück zum Mapping, sonst direkt weiter zur Gruppierung.
          </li>
        </ul>
      </section>
      {seriesSummaries.length > 0 && (
        <section className="series-metrics">
          <header className="validation-header">
            <div>
              <h3>Serien-Check mit Vorschau</h3>
              <p className="meta">
                Zeitachsen sind auf Sekunden normiert. Blick auf Linie + Punkte: sehen Verlauf und
                Werte plausibel aus?
              </p>
            </div>
            <span className="pill soft">Schnell prüfen, dann runterscrollen</span>
          </header>
          <div className="series-grid">
            {seriesSummaries.map((summary) => (
              <div key={summary.seriesId} className="experiment-card">
                <header>
                  <div>
                    <h5>{summary.seriesName}</h5>
                    <p className="meta">Experiment: {summary.experimentName}</p>
                  </div>
                </header>
                {renderSparkline(summary)}
                <div className="series-meta-grid">
                  <p className="meta">
                    Zeittyp: {summary.timeType === "datetime" ? "Zeitstempel (relativ)" : "Numerisch"}
                  </p>
                  <p className="meta">Punkte: {summary.pointCount}</p>
                  <p className="meta">Dauer: {formatSeconds(summary.spanSeconds)} s</p>
                </div>
                <p className="hint-text">
                  Tipp: Wenn der Verlauf abbricht oder Zickzack zeigt, kurz die Zeit- oder Wertespalte
                  prüfen.
                </p>
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
