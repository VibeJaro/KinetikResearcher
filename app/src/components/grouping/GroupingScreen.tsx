import type { Experiment } from "../../types/experiment";

type GroupingScreenProps = {
  experiments: Experiment[];
};

export const GroupingScreen = ({ experiments }: GroupingScreenProps) => {
  if (import.meta.env.DEV) {
    console.info("[grouping] first experiment shape", experiments?.[0]);
  }

  if (experiments.length === 0) {
    return (
      <div className="empty-state">
        <h3>No experiments to group</h3>
        <p>Import data and complete mapping to review grouping suggestions.</p>
      </div>
    );
  }

  return (
    <section className="grouping-screen">
      <header>
        <h3>Grouping preview</h3>
        <p className="meta">Experiments ready for grouping and downstream analysis.</p>
      </header>
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
    </section>
  );
};
