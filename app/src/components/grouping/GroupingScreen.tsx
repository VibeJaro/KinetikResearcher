import type { Experiment } from "../../types/experiment";
import { ColumnScanPanel } from "./ColumnScanPanel";
import type { ColumnScanPayload } from "./columnScanTypes";
export type { ColumnScanPayload } from "./columnScanTypes";

type GroupingScreenProps = {
  experiments: Experiment[];
  columnScanPayload: ColumnScanPayload | null;
};

const fallbackColumnScanPayload: ColumnScanPayload = {
  experimentCount: 12,
  knownStructuralColumns: ["experimentId", "time", "signal"],
  columns: [
    {
      name: "Catalyst_used",
      typeHeuristic: "text",
      nonNullRatio: 0.95,
      examples: ["Pd/C", "Pd on C", "Pd/C reused"]
    },
    {
      name: "Additive",
      typeHeuristic: "text",
      nonNullRatio: 0.86,
      examples: ["Et3N", "K2CO3", "TEA"]
    },
    {
      name: "Temp [C]",
      typeHeuristic: "numeric",
      nonNullRatio: 0.98,
      examples: ["25", "40", "60"]
    },
    {
      name: "Comment",
      typeHeuristic: "text",
      nonNullRatio: 0.52,
      examples: ["blue tint", "slurry", "thin film"]
    }
  ]
};

export const GroupingScreen = ({ experiments, columnScanPayload }: GroupingScreenProps) => {
  return (
    <section className="grouping-screen">
      <header>
        <h3>Grouping preview</h3>
        <p className="meta">Experiments ready for grouping and downstream analysis.</p>
      </header>

      <div className="grouping-actions">
        <ColumnScanPanel
          payload={columnScanPayload}
          fallbackPayload={fallbackColumnScanPayload}
        />
      </div>

      {experiments.length === 0 ? (
        <div className="empty-state">
          <h3>No experiments to group</h3>
          <p>Import data and complete mapping to review grouping suggestions.</p>
        </div>
      ) : (
        <ul className="experiment-list">
          {experiments.map((experiment) => {
            const metadataKeys = Object.keys(experiment.metaRaw);
            return (
              <li key={experiment.experimentId} className="experiment-card">
                <div>
                  <h4>{experiment.name ?? "Untitled experiment"}</h4>
                  <p className="meta">
                    Series: {experiment.series.length} · Metadata keys: {metadataKeys.length}
                  </p>
                </div>
                {metadataKeys.length > 0 && (
                  <div className="meta">
                    {metadataKeys.slice(0, 3).map((key) => (
                      <span key={key} className="chip">
                        {key}: {String(experiment.metaRaw[key])}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
