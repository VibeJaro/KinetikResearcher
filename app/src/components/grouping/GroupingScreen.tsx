import { useMemo, useState } from "react";
import type { Dataset } from "../../lib/import/types";
import {
  buildGroupingOptions,
  deriveManualGroupSignatures,
  summarizeMetadataColumns
} from "../../lib/grouping/helpers";
import type {
  ColumnScanResult,
  FactorExtractionResult,
  FactorOverrides,
  GroupingRecipe,
  GroupingRecipeGroup
} from "../../lib/grouping/types";

type GroupingScreenProps = {
  dataset: Dataset | null;
  groupingState: GroupingState;
  onGroupingStateChange: (updater: (prev: GroupingState) => GroupingState) => void;
  onRunColumnScan: () => Promise<void>;
  onRunFactorExtraction: () => Promise<void>;
  onSelectGroupingOption: (recipe: GroupingRecipe) => void;
  onAssignExperiment: (experimentId: string, groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onSplitGroup: (groupId: string, experimentId: string) => void;
  onMergeGroups: (sourceGroupId: string, targetGroupId: string) => void;
  onFallbackAll: () => void;
  onFallbackPerExperiment: () => void;
  onOverride: (experimentId: string, factorName: string, value: string | number | null) => void;
  onContinue: () => void;
  onContinueToModeling: () => void;
};

export type GroupingState = {
  includeCommentColumns: boolean;
  selectedColumns: string[];
  columnScanResult: ColumnScanResult | null;
  columnScanLoading: boolean;
  factorExtractionResult: FactorExtractionResult | null;
  factorExtractionLoading: boolean;
  factorOverrides: FactorOverrides;
  groupingOptions: GroupingRecipe[];
  selectedGroupingOptionId: string | null;
  manualGroups: GroupingRecipeGroup[];
  notes?: string;
  uncertainties?: string[];
};

const confidenceTone: Record<string, string> = {
  low: "severity-warn",
  medium: "severity-info",
  high: "status-clean"
};

const ExperimentAssignment = ({
  groups,
  dataset,
  onAssign
}: {
  groups: GroupingRecipeGroup[];
  dataset: Dataset | null;
  onAssign: (experimentId: string, groupId: string) => void;
}) => {
  const experiments = dataset?.experiments ?? [];
  if (experiments.length === 0) {
    return <p className="meta">No experiments available for grouping.</p>;
  }
  return (
    <div className="assignment-table">
      <div className="assignment-header">
        <p>Experiment</p>
        <p>Group</p>
      </div>
      {experiments.map((experiment) => (
        <div key={experiment.id} className="assignment-row">
          <div>
            <strong>{experiment.name}</strong>
            <p className="meta">ID: {experiment.id}</p>
          </div>
          <select
            value={groups.find((group) => group.experimentIds.includes(experiment.id))?.groupId ?? ""}
            onChange={(event) => onAssign(experiment.id, event.target.value)}
          >
            <option value="">Unassigned</option>
            {groups.map((group) => (
              <option key={group.groupId} value={group.groupId}>
                {group.name ?? group.groupId}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
};

const GroupCards = ({
  groups,
  onRename,
  onSplit,
  onMerge,
  experimentsById
}: {
  groups: GroupingRecipeGroup[];
  onRename: (groupId: string, name: string) => void;
  onSplit: (groupId: string, experimentId: string) => void;
  onMerge: (sourceGroupId: string, targetGroupId: string) => void;
  experimentsById: Map<string, string>;
}) => {
  const [mergeSource, setMergeSource] = useState<string>("");
  const [mergeTarget, setMergeTarget] = useState<string>("");
  return (
    <div className="group-cards">
      {groups.map((group, index) => (
        <article key={group.groupId} className="group-card">
          <div className="group-card-header">
            <input
              value={group.name ?? `Group ${index + 1}`}
              onChange={(event) => onRename(group.groupId, event.target.value)}
            />
            {group.warning && <span className="status-pill status-warning">{group.warning}</span>}
          </div>
          <p className="meta">
            Signature:{" "}
            {Object.entries(group.signature)
              .filter(([_, value]) => value !== undefined && value !== null)
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ") || "No factors"}
          </p>
          <ul className="group-experiment-list">
            {group.experimentIds.map((experimentId) => (
              <li key={experimentId}>
                <div>
                  <strong>{experimentsById.get(experimentId) ?? experimentId}</strong>
                  <p className="meta">{experimentId}</p>
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => onSplit(group.groupId, experimentId)}
                >
                  Split out
                </button>
              </li>
            ))}
            {group.experimentIds.length === 0 && (
              <li className="meta">No experiments assigned yet.</li>
            )}
          </ul>
        </article>
      ))}
      {groups.length > 1 && (
        <div className="merge-panel">
          <h4>Merge groups</h4>
          <div className="merge-controls">
            <select value={mergeSource} onChange={(event) => setMergeSource(event.target.value)}>
              <option value="">Source</option>
              {groups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.name ?? group.groupId}
                </option>
              ))}
            </select>
            <span>→</span>
            <select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}>
              <option value="">Target</option>
              {groups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.name ?? group.groupId}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="primary"
              disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget}
              onClick={() => {
                onMerge(mergeSource, mergeTarget);
                setMergeSource("");
                setMergeTarget("");
              }}
            >
              Merge
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const GroupingScreen = ({
  dataset,
  groupingState,
  onGroupingStateChange,
  onRunColumnScan,
  onRunFactorExtraction,
  onSelectGroupingOption,
  onAssignExperiment,
  onRenameGroup,
  onSplitGroup,
  onMergeGroups,
  onFallbackAll,
  onFallbackPerExperiment,
  onOverride,
  onContinue,
  onContinueToModeling
}: GroupingScreenProps) => {
  const experimentsById = useMemo(() => {
    const map = new Map<string, string>();
    dataset?.experiments.forEach((experiment) => {
      map.set(experiment.id, experiment.name);
    });
    return map;
  }, [dataset?.experiments]);

  const columnSummaries = useMemo(
    () => summarizeMetadataColumns(dataset),
    [dataset?.experiments]
  );

  const handleColumnToggle = (column: string, checked: boolean) => {
    onGroupingStateChange((prev) => {
      const nextColumns = checked
        ? Array.from(new Set([...prev.selectedColumns, column]))
        : prev.selectedColumns.filter((item) => item !== column);
      return { ...prev, selectedColumns: nextColumns };
    });
  };

  const factorNames =
    groupingState.factorExtractionResult?.factorNames ??
    groupingState.columnScanResult?.factorCandidates ??
    [];

  const factorExperiments = groupingState.factorExtractionResult?.experiments ?? [];
  const groupingOptions = useMemo(
    () => buildGroupingOptions(groupingState.factorExtractionResult, groupingState.factorOverrides),
    [groupingState.factorExtractionResult, groupingState.factorOverrides]
  );

  const manualGroups = useMemo(
    () =>
      deriveManualGroupSignatures(
        groupingState.manualGroups,
        groupingState.factorExtractionResult,
        groupingState.factorOverrides
      ),
    [groupingState.manualGroups, groupingState.factorExtractionResult, groupingState.factorOverrides]
  );

  const runGroupingOptionSelection = (recipe: GroupingRecipe) => {
    onSelectGroupingOption(recipe);
  };

  return (
    <div className="grouping-screen">
      <header className="validation-header">
        <div>
          <h3>Grouping</h3>
          <p className="meta">
            LLM-assisted metadata understanding → deterministic grouping suggestions →
            manual curation.
          </p>
        </div>
        <span className="status-pill status-info">
          Grouping suggestions are based on interpreted metadata and may be imperfect.
        </span>
      </header>

      <section className="stage-card">
        <div className="stage-header">
          <div>
            <h4>1) Column scan</h4>
            <p className="meta">Suggest relevant metadata columns for grouping.</p>
          </div>
          <div className="stage-actions">
            <label className="toggle">
              <input
                type="checkbox"
                checked={groupingState.includeCommentColumns}
                onChange={(event) =>
                  onGroupingStateChange((prev) => ({
                    ...prev,
                    includeCommentColumns: event.target.checked
                  }))
                }
              />
              Include free-text/comment columns
            </label>
            <button
              type="button"
              className="primary"
              onClick={() => {
                void onRunColumnScan();
              }}
              disabled={groupingState.columnScanLoading || columnSummaries.length === 0}
            >
              {groupingState.columnScanLoading ? "Scanning..." : "Run column scan"}
            </button>
          </div>
        </div>

        {columnSummaries.length === 0 && (
          <p className="meta">No metadata columns available. Import data to continue.</p>
        )}
        {columnSummaries.length > 0 && (
          <div className="column-summary-grid">
            {columnSummaries.map((column) => (
              <article key={column.name} className="column-chip">
                <div className="column-chip-header">
                  <strong>{column.name}</strong>
                  <span className="badge">{column.typeHeuristic}</span>
                </div>
                <p className="meta">
                  non-null: {(column.nonNullRatio * 100).toFixed(0)}% · examples:{" "}
                  {column.examples.join(", ")}
                </p>
              </article>
            ))}
          </div>
        )}

        {groupingState.columnScanResult && (
          <div className="scan-results">
            <h5>Suggested columns</h5>
            <div className="checkbox-grid">
              {groupingState.columnScanResult.selectedColumns
                .filter(
                  (column) =>
                    groupingState.includeCommentColumns ||
                    groupingState.columnScanResult?.columnRoles?.[column] !== "comment"
                )
                .map((column) => {
                  const checked = groupingState.selectedColumns.includes(column);
                  return (
                    <label key={column} className="checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => handleColumnToggle(column, event.target.checked)}
                      />
                      {column}
                      {groupingState.columnScanResult?.columnRoles?.[column] && (
                        <span className="tag">
                          {groupingState.columnScanResult?.columnRoles?.[column]}
                        </span>
                      )}
                    </label>
                  );
                })}
            </div>
            {groupingState.columnScanResult.notes && (
              <p className="meta">Notes: {groupingState.columnScanResult.notes}</p>
            )}
            {groupingState.columnScanResult.uncertainties &&
              groupingState.columnScanResult.uncertainties.length > 0 && (
                <ul className="meta">
                  {groupingState.columnScanResult.uncertainties.map((item) => (
                    <li key={item}>Uncertainty: {item}</li>
                  ))}
                </ul>
              )}
          </div>
        )}
      </section>

      <section className="stage-card">
        <div className="stage-header">
          <div>
            <h4>2) Factor extraction</h4>
            <p className="meta">Normalize metadata into factors with provenance.</p>
          </div>
          <button
            type="button"
            className="primary"
            onClick={() => {
              void onRunFactorExtraction();
            }}
            disabled={
              groupingState.factorExtractionLoading ||
              groupingState.selectedColumns.length === 0 ||
              !groupingState.columnScanResult
            }
          >
            {groupingState.factorExtractionLoading ? "Extracting..." : "Extract factors"}
          </button>
        </div>

        {factorExperiments.length > 0 ? (
          <div className="factor-table">
            <div className="factor-row factor-header">
              <div>Experiment</div>
              {factorNames.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
            {factorExperiments.map((experiment) => (
              <div key={experiment.experimentId} className="factor-row">
                <div>
                  <strong>{experimentsById.get(experiment.experimentId) ?? experiment.experimentId}</strong>
                  <p className="meta">{experiment.experimentId}</p>
                </div>
                {factorNames.map((factorName) => {
                  const factor =
                    experiment.factors.find((item) => item.name === factorName) ??
                    ({ value: null, confidence: "low", provenance: [] } as any);
                  const currentOverride =
                    groupingState.factorOverrides[experiment.experimentId]?.[factorName];
                  const displayValue =
                    currentOverride !== undefined ? currentOverride : factor.value ?? "—";
                  return (
                    <div key={`${experiment.experimentId}-${factorName}`} className="factor-cell">
                      <span className={`status-pill ${confidenceTone[factor.confidence] || ""}`}>
                        {factor.confidence}
                      </span>
                      <p className="meta">Value: {displayValue ?? "—"}</p>
                      <details>
                        <summary>Provenance</summary>
                        {factor.provenance.length === 0 && <p className="meta">No provenance.</p>}
                        {factor.provenance.map((prov, index) => (
                          <p key={index} className="meta">
                            {prov.column}: {prov.rawValueSnippet}
                          </p>
                        ))}
                      </details>
                      <label className="override-input">
                        Manual override
                        <input
                          type="text"
                          value={displayValue ?? ""}
                          onChange={(event) =>
                            onOverride(
                              experiment.experimentId,
                              factorName,
                              event.target.value || null
                            )
                          }
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">
            Run factor extraction to see normalized factors and provenance. Selected columns are
            required.
          </p>
        )}
      </section>

      <section className="stage-card">
        <div className="stage-header">
          <div>
            <h4>3) Group proposals</h4>
            <p className="meta">Deterministic grouping options built from extracted factors.</p>
          </div>
        </div>
        {groupingOptions.length === 0 && <p className="meta">No grouping options yet.</p>}
        {groupingOptions.length > 0 && (
          <div className="grouping-options">
            {groupingOptions.map((option) => (
              <button
                key={option.recipeId}
                type="button"
                className={`grouping-card ${
                  groupingState.selectedGroupingOptionId === option.recipeId ? "active" : ""
                }`}
                onClick={() => runGroupingOptionSelection(option)}
              >
                <div className="grouping-card-header">
                  <h5>{option.description}</h5>
                  <span className="badge">{option.groups.length} groups</span>
                </div>
                <p className="meta">
                  Sizes: {option.groups.map((group) => group.experimentIds.length).join(", ")}
                </p>
                <p className="meta">
                  Factors: {option.groups[0]?.signature ? Object.keys(option.groups[0].signature).join(", ") : "n/a"}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="stage-card">
        <div className="stage-header">
          <div>
            <h4>4) Manual group editor</h4>
            <p className="meta">Drag-free, explicit controls. Mixed factors are flagged.</p>
          </div>
          <div className="stage-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                onFallbackAll();
              }}
            >
              Single group fallback
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                onFallbackPerExperiment();
              }}
            >
              One group per experiment
            </button>
          </div>
        </div>

        <ExperimentAssignment
          dataset={dataset}
          groups={manualGroups}
          onAssign={(experimentId, groupId) => {
            onAssignExperiment(experimentId, groupId);
          }}
        />

        <GroupCards
          groups={manualGroups}
          experimentsById={experimentsById}
          onRename={(groupId, name) => onRenameGroup(groupId, name)}
          onSplit={(groupId, experimentId) => {
            onSplitGroup(groupId, experimentId);
          }}
          onMerge={(sourceGroupId, targetGroupId) => {
            onMergeGroups(sourceGroupId, targetGroupId);
          }}
        />
      </section>

      <footer className="grouping-footer">
        <div>
          <p className="meta">
            Low-confidence factors remain visible. Provenance stays attached. No metadata is dropped.
          </p>
        </div>
        <div className="footer-actions">
          <button type="button" className="ghost" onClick={onContinue}>
            Continue to Questions
          </button>
          <button type="button" className="primary" onClick={onContinueToModeling}>
            Continue to Model &amp; Fit
          </button>
        </div>
      </footer>
    </div>
  );
};
