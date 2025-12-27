import { useMemo, useState } from "react";
import type { Dataset } from "../../lib/import/types";
import type {
  FactorValue,
  FinalGroup,
  GroupingRecipe
} from "../../lib/grouping/types";
import type { ColumnScanUIState, FactorExtractionState } from "../../lib/grouping/state";
import { applyGroupWarningFlags } from "../../lib/grouping/groupingRecipes";

const formatValue = (value: FactorValue): string => {
  if (value === null || value === undefined) {
    return "n/a";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "n/a";
  }
  return value;
};

const confidenceTone: Record<string, string> = {
  high: "confidence-high",
  medium: "confidence-medium",
  low: "confidence-low"
};

const defaultFactorCandidates = ["catalyst", "additive", "substrate", "solvent", "temperature"];

type GroupingStepProps = {
  dataset: Dataset | null;
  columnScanState: ColumnScanUIState;
  availableMetadataColumns: string[];
  onColumnScan: () => void;
  onToggleIncludeComments: (value: boolean) => void;
  onColumnSelectionChange: (column: string, enabled: boolean) => void;
  factorState: FactorExtractionState;
  onFactorExtraction: () => void;
  onFactorOverride: (
    experimentId: string,
    factorName: string,
    value: FactorValue,
    rationale?: string
  ) => void;
  groupingOptions: GroupingRecipe[];
  selectedRecipeId: string | null;
  onSelectRecipe: (recipeId: string) => void;
  groups: FinalGroup[];
  factorValues: Record<string, Record<string, FactorValue>>;
  onCreateGroup: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onMergeGroup: (sourceGroupId: string, targetGroupId: string) => void;
  onSplitGroup: (groupId: string) => void;
  onMoveExperiment: (experimentId: string, targetGroupId: string) => void;
  onFallback: (mode: "single" | "per-experiment") => void;
  onContinue: () => void;
};

export const GroupingStep = ({
  dataset,
  columnScanState,
  availableMetadataColumns,
  onColumnScan,
  onToggleIncludeComments,
  onColumnSelectionChange,
  factorState,
  onFactorExtraction,
  onFactorOverride,
  groupingOptions,
  selectedRecipeId,
  onSelectRecipe,
  groups,
  factorValues,
  onCreateGroup,
  onRenameGroup,
  onMergeGroup,
  onSplitGroup,
  onMoveExperiment,
  onFallback,
  onContinue
}: GroupingStepProps) => {
  const [activeProvenance, setActiveProvenance] = useState<{
    experimentId: string;
    factorName: string;
  } | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<{
    experimentId: string;
    factorName: string;
    value: string;
    rationale: string;
  } | null>(null);

  const experiments = dataset?.experiments ?? [];

  const factorNames = useMemo(() => {
    const names = new Set<string>();
    factorState.experiments.forEach((experiment) => {
      experiment.factors.forEach((factor) => names.add(factor.name));
    });
    return Array.from(names);
  }, [factorState.experiments]);

  const candidateColumns = useMemo(() => {
    const fromResponse = columnScanState.suggestedColumns;
    const combined = new Set([...fromResponse, ...availableMetadataColumns]);
    return Array.from(combined);
  }, [availableMetadataColumns, columnScanState.suggestedColumns]);

  const groupsWithWarnings = useMemo(
    () =>
      groups.map((group) =>
        applyGroupWarningFlags(
          {
            groupId: group.groupId,
            name: group.name,
            experimentIds: group.experimentIds,
            signature: group.signature
          },
          factorValues
        )
      ),
    [factorValues, groups]
  );

  const experimentToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    groups.forEach((group) => {
      group.experimentIds.forEach((experimentId) => {
        map[experimentId] = group.groupId;
      });
    });
    return map;
  }, [groups]);

  const currentProvenance = useMemo(() => {
    if (!activeProvenance) {
      return null;
    }
    const experiment = factorState.experiments.find(
      (item) => item.experimentId === activeProvenance.experimentId
    );
    const factor = experiment?.factors.find((item) => item.name === activeProvenance.factorName);
    return factor ?? null;
  }, [activeProvenance, factorState.experiments]);

  const saveOverride = () => {
    if (!overrideDraft) {
      return;
    }
    const numeric = Number(overrideDraft.value);
    const parsedValue =
      overrideDraft.value.trim() === ""
        ? null
        : Number.isNaN(numeric)
          ? overrideDraft.value
          : numeric;
    onFactorOverride(
      overrideDraft.experimentId,
      overrideDraft.factorName,
      parsedValue,
      overrideDraft.rationale.trim() || undefined
    );
    setOverrideDraft(null);
  };

  return (
    <div className="grouping-step">
      <header className="grouping-header">
        <div>
          <h3>Grouping</h3>
          <p className="meta">
            LLM-assisted metadata understanding to propose grouping options for shared kinetic
            models. The user keeps control and can adjust everything.
          </p>
          <p className="disclaimer">Grouping suggestions are based on interpreted metadata and may be imperfect.</p>
        </div>
        <div className="grouping-actions">
          <button type="button" className="primary" onClick={onContinue}>
            Continue to Model &amp; Fit
          </button>
        </div>
      </header>

      <div className="grouping-grid">
        <section className="llm-card">
          <header className="card-header">
            <div>
              <h4>1) Column scan</h4>
              <p className="meta">
                LLM identifies metadata columns that influence kinetic behavior. Free-text/comment
                columns can be toggled on demand.
              </p>
            </div>
            <div className="inline-actions">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={columnScanState.includeCommentColumns}
                  onChange={(event) => onToggleIncludeComments(event.target.checked)}
                />
                Include free-text/comment columns
              </label>
              <button type="button" className="secondary" onClick={onColumnScan}>
                {columnScanState.status === "loading" ? "Scanning…" : "Run column scan"}
              </button>
            </div>
          </header>

          {columnScanState.error && <div className="inline-error">{columnScanState.error}</div>}
          <div className="column-toggle-list">
            {candidateColumns.length === 0 && (
              <p className="meta">No metadata columns available yet.</p>
            )}
            {candidateColumns.map((column) => {
              const role = columnScanState.columnRoles[column] ?? "unknown";
              const isComment = role === "comment" && !columnScanState.includeCommentColumns;
              return (
                <label key={column} className="checkbox">
                  <input
                    type="checkbox"
                    checked={columnScanState.selectedColumns.includes(column)}
                    disabled={isComment}
                    onChange={(event) => onColumnSelectionChange(column, event.target.checked)}
                  />
                  <span className="column-label">
                    {column}
                    {role !== "unknown" && <span className={`role-pill role-${role}`}>{role}</span>}
                    {isComment && <span className="meta">(comment excluded)</span>}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="scan-notes">
            <p className="meta">
              Suggested factors: {(columnScanState.factorCandidates.length > 0
                ? columnScanState.factorCandidates
                : defaultFactorCandidates
              ).join(", ")}
            </p>
            {columnScanState.notes && <p className="meta">Notes: {columnScanState.notes}</p>}
            {columnScanState.uncertainties && columnScanState.uncertainties.length > 0 && (
              <ul className="meta uncertainties">
                {columnScanState.uncertainties.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="llm-card">
          <header className="card-header">
            <div>
              <h4>2) Factor extraction</h4>
              <p className="meta">
                LLM normalizes selected metadata into structured factors per experiment with
                provenance and confidence.
              </p>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={onFactorExtraction}
              disabled={columnScanState.selectedColumns.length === 0}
            >
              {factorState.status === "loading" ? "Extracting…" : "Extract factors"}
            </button>
          </header>
          {factorState.error && <div className="inline-error">{factorState.error}</div>}
          {factorNames.length === 0 && (
            <p className="meta">
              No factors extracted yet. Run the factor extraction once columns are selected.
            </p>
          )}
          {factorNames.length > 0 && (
            <div className="factor-table-wrapper">
              <table className="factor-table">
                <thead>
                  <tr>
                    <th>Experiment</th>
                    {factorNames.map((name) => (
                      <th key={name}>{name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {factorState.experiments.map((experiment) => (
                    <tr key={experiment.experimentId}>
                      <td className="experiment-label">{experiment.experimentId}</td>
                      {factorNames.map((name) => {
                        const factor = experiment.factors.find((item) => item.name === name);
                        const override = factorState.overrides[experiment.experimentId]?.[name];
                        const value = override ? override.value : factor?.value;
                        return (
                          <td key={`${experiment.experimentId}-${name}`}>
                            <button
                              type="button"
                              className="factor-cell"
                              onClick={() => setActiveProvenance({
                                experimentId: experiment.experimentId,
                                factorName: name
                              })}
                            >
                              <span className="factor-value">{formatValue(value)}</span>
                              {factor && (
                                <span className={`confidence-badge ${confidenceTone[factor.confidence]}`}>
                                  {factor.confidence}
                                </span>
                              )}
                            </button>
                            <div className="factor-actions">
                              <button
                                type="button"
                                className="ghost"
                                onClick={() =>
                                  setOverrideDraft({
                                    experimentId: experiment.experimentId,
                                    factorName: name,
                                    value: value === null || value === undefined ? "" : String(value),
                                    rationale: ""
                                  })
                                }
                              >
                                Override
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {activeProvenance && currentProvenance && (
            <div className="provenance-panel">
              <div>
                <p className="meta">
                  Provenance for {activeProvenance.factorName} · {activeProvenance.experimentId}
                </p>
                <p>Original value: {formatValue(currentProvenance.value)}</p>
                <p className="meta">Confidence: {currentProvenance.confidence}</p>
                <ul>
                  {currentProvenance.provenance.map((item) => (
                    <li key={`${item.column}-${item.rawValueSnippet}`}>
                      {item.column}: {item.rawValueSnippet}
                    </li>
                  ))}
                </ul>
              </div>
              <button type="button" className="ghost" onClick={() => setActiveProvenance(null)}>
                Close
              </button>
            </div>
          )}
          {overrideDraft && (
            <div className="override-panel">
              <div>
                <p className="meta">
                  Override {overrideDraft.factorName} for {overrideDraft.experimentId}
                </p>
                <input
                  type="text"
                  value={overrideDraft.value}
                  onChange={(event) =>
                    setOverrideDraft((prev) => prev && { ...prev, value: event.target.value })
                  }
                  placeholder="Enter replacement value"
                />
                <input
                  type="text"
                  value={overrideDraft.rationale}
                  onChange={(event) =>
                    setOverrideDraft((prev) => prev && { ...prev, rationale: event.target.value })
                  }
                  placeholder="Optional rationale"
                />
              </div>
              <div className="override-actions">
                <button type="button" className="ghost" onClick={() => setOverrideDraft(null)}>
                  Cancel
                </button>
                <button type="button" className="primary" onClick={saveOverride}>
                  Save override
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="llm-card">
          <header className="card-header">
            <div>
              <h4>3) Grouping proposals</h4>
              <p className="meta">
                Deterministic grouping recipes based on extracted factors. Pick one before editing
                manually.
              </p>
            </div>
          </header>
          {groupingOptions.length === 0 && (
            <p className="meta">Run factor extraction to generate grouping options.</p>
          )}
          <div className="grouping-options-grid">
            {groupingOptions.map((option) => (
              <button
                key={option.recipeId}
                type="button"
                className={`grouping-option ${option.recipeId === selectedRecipeId ? "active" : ""}`}
                onClick={() => onSelectRecipe(option.recipeId)}
              >
                <div className="option-header">
                  <h5>{option.description}</h5>
                  <span className="badge">{option.groups.length} groups</span>
                </div>
                <p className="meta">Factors: {option.factors.join(", ")}</p>
                <p className="meta">
                  Sizes: {option.groups.map((group) => group.experimentIds.length).join(", ")}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="llm-card">
          <header className="card-header">
            <div>
              <h4>4) Manual group editor</h4>
              <p className="meta">
                Move experiments, split/merge groups, and rename them. Conflicting catalysts/additives
                are flagged but allowed.
              </p>
            </div>
            <div className="inline-actions">
              <button type="button" className="ghost" onClick={() => onFallback("single")}>
                One group (all)
              </button>
              <button type="button" className="ghost" onClick={() => onFallback("per-experiment")}>
                One per experiment
              </button>
              <button type="button" className="secondary" onClick={onCreateGroup}>
                Create group
              </button>
            </div>
          </header>
          <div className="group-editor">
            <div className="group-cards">
              {groupsWithWarnings.map((group) => (
                <article key={group.groupId} className="group-card">
                  <div className="group-card-header">
                    <input
                      type="text"
                      value={group.name}
                      onChange={(event) => onRenameGroup(group.groupId, event.target.value)}
                    />
                    <div className="group-card-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => onSplitGroup(group.groupId)}
                      >
                        Split
                      </button>
                      {groups.length > 1 && (
                        <select
                          value=""
                          onChange={(event) => {
                            if (event.target.value) {
                              onMergeGroup(group.groupId, event.target.value);
                            }
                          }}
                        >
                          <option value="">Merge into…</option>
                          {groups
                            .filter((candidate) => candidate.groupId !== group.groupId)
                            .map((candidate) => (
                              <option key={candidate.groupId} value={candidate.groupId}>
                                {candidate.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <p className="meta">
                    Signature: {Object.entries(group.signature).length === 0
                      ? "n/a"
                      : Object.entries(group.signature)
                          .map(([key, value]) => `${key}: ${formatValue(value)}`)
                          .join(" · ")}
                  </p>
                  {group.warnings && group.warnings.length > 0 && (
                    <p className="warning-badge">Warnings: {group.warnings.join(", ")}</p>
                  )}
                  <ul className="group-experiments">
                    {group.experimentIds.map((experimentId) => (
                      <li key={`${group.groupId}-${experimentId}`}>{experimentId}</li>
                    ))}
                  </ul>
                </article>
              ))}
              {groupsWithWarnings.length === 0 && <p className="meta">No groups yet.</p>}
            </div>
            <div className="experiment-assignment">
              <h5>Assign experiments</h5>
              {experiments.map((experiment) => (
                <div key={experiment.id} className="assignment-row">
                  <div>
                    <p className="meta">{experiment.id}</p>
                    <p className="meta subtle">{experiment.name}</p>
                  </div>
                  <select
                    value={experimentToGroup[experiment.id] ?? ""}
                    onChange={(event) => onMoveExperiment(experiment.id, event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {groups.map((group) => (
                      <option key={group.groupId} value={group.groupId}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
