import { useEffect, useMemo, useState } from "react";
import { buildFactorExtractionPayloads, applyOverridesToFactors } from "../../lib/grouping/factorExtraction";
import { buildGroupingOptions } from "../../lib/grouping/groupingOptions";
import { buildColumnScanPayload, summarizeColumns } from "../../lib/grouping/metadataSummary";
import type { Dataset } from "../../lib/import/types";
import type {
  FactorExtractionResponse,
  FactorOverride,
  FactorValue,
  GroupDefinition,
  GroupingState
} from "../../lib/grouping/types";

type GroupingScreenProps = {
  dataset: Dataset | null;
  state: GroupingState;
  onStateChange: (next: GroupingState) => void;
  onBackToValidation: () => void;
  onContinueToModeling: () => void;
  addAuditEntry: (type: string, payload: Record<string, unknown>) => void;
};

const formatConfidence = (confidence: FactorValue["confidence"]) => {
  switch (confidence) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    default:
      return "Low";
  }
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "—";
  }
  const text = String(value).trim();
  return text || "—";
};

const baseCandidates = ["catalyst", "additive", "substrate", "solvent", "temperature", "batch", "note"];

const deriveFactorNames = (draft: GroupingState): string[] => {
  const names = new Set<string>(draft.factorCandidates.length ? draft.factorCandidates : baseCandidates);
  draft.factors.forEach((experiment) => {
    experiment.factors.forEach((factor) => names.add(factor.name));
  });
  return Array.from(names);
};

export const GroupingScreen = ({
  dataset,
  state,
  onStateChange,
  onBackToValidation,
  onContinueToModeling,
  addAuditEntry
}: GroupingScreenProps) => {
  const [columnScanLoading, setColumnScanLoading] = useState(false);
  const [factorExtractionLoading, setFactorExtractionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeProvenance, setActiveProvenance] = useState<{
    experimentId: string;
    factorName: string;
    provenance: FactorValue["provenance"];
  } | null>(null);
  const [overrideDraft, setOverrideDraft] = useState<{
    experimentId: string;
    factorName: string;
    value: string;
    reason: string;
  } | null>(null);

  const columnPayload = useMemo(() => buildColumnScanPayload(dataset), [dataset]);
  const columnSummaries = useMemo(() => summarizeColumns(dataset), [dataset]);

  const factorNames = useMemo(() => deriveFactorNames(state), [state]);

  const applyStateUpdate = (updater: (prev: GroupingState) => GroupingState) => {
    const nextDraft = updater(state);
    const available = deriveFactorNames(nextDraft);
    const options = buildGroupingOptions({
      experiments: nextDraft.factors,
      overrides: nextDraft.overrides,
      availableFactors: available
    });
    const selectedOption =
      options.find((option) => option.recipeId === nextDraft.selectedOptionId) ??
      options[0] ??
      null;

    onStateChange({
      ...nextDraft,
      groupingOptions: options,
      selectedOptionId: selectedOption?.recipeId ?? null,
      groups:
        nextDraft.manualGroupsDirty && nextDraft.groups.length > 0
          ? nextDraft.groups
          : selectedOption?.groups ?? nextDraft.groups
    });
  };

  useEffect(() => {
    if (state.factorCandidates.length === 0 && state.columnScan) {
      applyStateUpdate((prev) => ({
        ...prev,
        factorCandidates: state.columnScan?.factorCandidates ?? baseCandidates
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.columnScan]);

  const handleRunColumnScan = async () => {
    if (!columnPayload) {
      setError("No metadata available. Import and validate data first.");
      return;
    }
    setError(null);
    setColumnScanLoading(true);
    addAuditEntry("LLM_COLUMN_SCAN_REQUESTED", {
      experimentCount: columnPayload.experimentCount,
      columnCount: columnPayload.columns.length
    });
    try {
      const response = await fetch("/api/column-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(columnPayload)
      });
      const result = (await response.json()) as Record<string, unknown>;
      const nextColumns = Array.isArray(result.selectedColumns)
        ? (result.selectedColumns.filter((item): item is string => typeof item === "string") ?? [])
        : [];
      const columnRoles =
        (result.columnRoles as Record<string, "condition" | "comment" | "unknown">) ?? {};
      const filteredColumns = state.includeComments
        ? nextColumns
        : nextColumns.filter((column) => columnRoles[column] !== "comment");
      applyStateUpdate((prev) => ({
        ...prev,
        columnScan: {
          selectedColumns: filteredColumns,
          columnRoles,
          factorCandidates:
            (result.factorCandidates as string[] | undefined) && Array.isArray(result.factorCandidates)
              ? (result.factorCandidates as string[])
              : baseCandidates,
          notes: typeof result.notes === "string" ? result.notes : "",
          uncertainties:
            Array.isArray(result.uncertainties) && result.uncertainties.every((item) => typeof item === "string")
              ? (result.uncertainties as string[])
              : []
        },
        selectedColumns: filteredColumns,
        factorCandidates:
          Array.isArray(result.factorCandidates) && result.factorCandidates.every((item) => typeof item === "string")
            ? (result.factorCandidates as string[])
            : baseCandidates
      }));
      addAuditEntry("LLM_COLUMN_SCAN_COMPLETED", {
        selectedColumns: nextColumns
      });
    } catch (scanError) {
      const message =
        scanError instanceof Error ? scanError.message : "Column scan failed. Please retry.";
      setError(message);
    } finally {
      setColumnScanLoading(false);
    }
  };

  const handleToggleColumnSelection = (column: string) => {
    applyStateUpdate((prev) => {
      const nextColumns = prev.selectedColumns.includes(column)
        ? prev.selectedColumns.filter((item) => item !== column)
        : [...prev.selectedColumns, column];
      return { ...prev, selectedColumns: nextColumns };
    });
  };

  const handleToggleComments = () => {
    applyStateUpdate((prev) => {
      if (!prev.columnScan) {
        return { ...prev, includeComments: !prev.includeComments };
      }
      const include = !prev.includeComments;
      const filteredColumns = include
        ? prev.selectedColumns
        : prev.selectedColumns.filter(
            (column) => prev.columnScan?.columnRoles?.[column] !== "comment"
          );
      return { ...prev, includeComments: include, selectedColumns: filteredColumns };
    });
  };

  const handleFactorExtraction = async () => {
    if (!dataset || state.selectedColumns.length === 0) {
      setError("Select at least one metadata column before extracting factors.");
      return;
    }
    setFactorExtractionLoading(true);
    setError(null);
    const payloads = buildFactorExtractionPayloads({
      dataset,
      selectedColumns: state.selectedColumns,
      factorCandidates: factorNames
    });
    addAuditEntry("LLM_FACTOR_EXTRACTION_REQUESTED", {
      batches: payloads.length,
      experiments: dataset.experiments.length
    });
    try {
      const batchResults: FactorExtractionResponse["experiments"][] = [];
      for (const payload of payloads) {
        // eslint-disable-next-line no-await-in-loop
        const response = await fetch("/api/factor-extraction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const parsed = (await response.json()) as FactorExtractionResponse;
        if (parsed?.experiments) {
          batchResults.push(parsed.experiments);
        }
      }
      const merged: FactorExtractionResponse["experiments"] = [];
      batchResults.forEach((batch) => merged.push(...batch));
      applyStateUpdate((prev) => ({
        ...prev,
        factors: merged,
        manualGroupsDirty: false
      }));
      addAuditEntry("LLM_FACTOR_EXTRACTION_COMPLETED", {
        experiments: merged.length
      });
    } catch (factorError) {
      const message =
        factorError instanceof Error ? factorError.message : "Factor extraction failed.";
      setError(message);
    } finally {
      setFactorExtractionLoading(false);
    }
  };

  const handleOverrideSave = () => {
    if (!overrideDraft) {
      return;
    }
    const { experimentId, factorName, value, reason } = overrideDraft;
    const timestamp = new Date().toISOString();
    applyStateUpdate((prev) => {
      const existing = prev.overrides[experimentId] ?? {};
      const nextOverride: FactorOverride = {
        value,
        reason: reason.trim() || undefined,
        updatedAt: timestamp
      };
      return {
        ...prev,
        overrides: {
          ...prev.overrides,
          [experimentId]: { ...existing, [factorName]: nextOverride }
        },
        manualGroupsDirty: true
      };
    });
    addAuditEntry("FACTOR_OVERRIDDEN_MANUALLY", {
      experimentId,
      factor: factorName,
      value,
      reason
    });
    setOverrideDraft(null);
  };

  const handleSelectGroupingOption = (recipeId: string) => {
    applyStateUpdate((prev) => ({
      ...prev,
      selectedOptionId: recipeId,
      manualGroupsDirty: false
    }));
    addAuditEntry("GROUPING_OPTION_SELECTED", {
      recipeId
    });
  };

  const createGroupId = (prefix: string) =>
    `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

  const handleCreateGroup = () => {
    applyStateUpdate((prev) => ({
      ...prev,
      groups: [
        ...prev.groups,
        {
          groupId: createGroupId("group"),
          name: "New group",
          experimentIds: [],
          signature: {},
          createdFromRecipe: prev.selectedOptionId ?? "manual"
        }
      ],
      manualGroupsDirty: true
    }));
    addAuditEntry("GROUP_CREATED", { groups: (state.groups?.length ?? 0) + 1 });
  };

  const handleRenameGroup = (groupId: string, name: string) => {
    applyStateUpdate((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.groupId === groupId ? { ...group, name } : group
      ),
      manualGroupsDirty: true
    }));
    addAuditEntry("GROUP_RENAMED", { groupId, name });
  };

  const handleMergeGroups = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return;
    }
    applyStateUpdate((prev) => {
      const source = prev.groups.find((group) => group.groupId === sourceId);
      const target = prev.groups.find((group) => group.groupId === targetId);
      if (!source || !target) {
        return prev;
      }
      const mergedExperiments = Array.from(
        new Set([...target.experimentIds, ...source.experimentIds])
      );
      return {
        ...prev,
        groups: prev.groups
          .filter((group) => group.groupId !== sourceId)
          .map((group) =>
            group.groupId === targetId ? { ...group, experimentIds: mergedExperiments } : group
          ),
        manualGroupsDirty: true
      };
    });
    addAuditEntry("GROUP_MERGED", { sourceId, targetId });
  };

  const handleSplitGroup = (groupId: string) => {
    applyStateUpdate((prev) => {
      const target = prev.groups.find((group) => group.groupId === groupId);
      if (!target) {
        return prev;
      }
      const newGroups: GroupDefinition[] = target.experimentIds.map((experimentId) => ({
        groupId: createGroupId("split"),
        name: `Split ${experimentId}`,
        experimentIds: [experimentId],
        signature: target.signature,
        createdFromRecipe: "manual"
      }));
      const remaining = prev.groups.filter((group) => group.groupId !== groupId);
      return {
        ...prev,
        groups: [...remaining, ...newGroups],
        manualGroupsDirty: true
      };
    });
    addAuditEntry("GROUP_SPLIT", { groupId });
  };

  const handleMoveExperiment = (experimentId: string, targetGroupId: string) => {
    applyStateUpdate((prev) => {
      const currentGroup = prev.groups.find((group) =>
        group.experimentIds.includes(experimentId)
      );
      const nextGroups = prev.groups.map((group) => {
        if (group.groupId === targetGroupId) {
          return { ...group, experimentIds: Array.from(new Set([...group.experimentIds, experimentId])) };
        }
        if (group.groupId === currentGroup?.groupId) {
          return {
            ...group,
            experimentIds: group.experimentIds.filter((id) => id !== experimentId)
          };
        }
        return group;
      });
      return { ...prev, groups: nextGroups, manualGroupsDirty: true };
    });
    addAuditEntry("EXPERIMENT_MOVED_GROUP", { experimentId, targetGroupId });
  };

  const availableExperiments = dataset?.experiments ?? [];

  const buildFallbackAllInOne = () => {
    if (availableExperiments.length === 0) {
      return;
    }
    applyStateUpdate((prev) => ({
      ...prev,
      groups: [
        {
          groupId: createGroupId("all"),
          name: "All experiments",
          experimentIds: availableExperiments.map((experiment) => experiment.id),
          signature: {},
          createdFromRecipe: "manual-fallback"
        }
      ],
      manualGroupsDirty: true,
      selectedOptionId: "manual-fallback"
    }));
  };

  const buildFallbackPerExperiment = () => {
    if (availableExperiments.length === 0) {
      return;
    }
    applyStateUpdate((prev) => ({
      ...prev,
      groups: availableExperiments.map((experiment) => ({
        groupId: createGroupId("solo"),
        name: `Group ${experiment.name}`,
        experimentIds: [experiment.id],
        signature: {},
        createdFromRecipe: "manual-fallback"
      })),
      manualGroupsDirty: true,
      selectedOptionId: "manual-fallback"
    }));
  };

  const factorizedWithOverrides = useMemo(
    () => applyOverridesToFactors(state.factors, state.overrides),
    [state.factors, state.overrides]
  );

  const groupWarnings = (group: GroupDefinition): string[] => {
    const experimentsInGroup = factorizedWithOverrides.filter((item) =>
      group.experimentIds.includes(item.experimentId)
    );
    const factorsOfInterest = ["catalyst", "additive", "substrate", "solvent", "temperature"];
    const warnings: string[] = [];
    factorsOfInterest.forEach((factorName) => {
      const values = experimentsInGroup
        .map((item) => item.factors.find((factor) => factor.name === factorName)?.value)
        .filter((value) => value !== null && value !== undefined);
      const uniqueValues = new Set(values.map((value) => String(value)));
      if (uniqueValues.size > 1) {
        warnings.push(`Mixed ${factorName} values`);
      }
    });
    return warnings;
  };

  const experimentNameMap = useMemo(
    () =>
      new Map<string, string>(
        availableExperiments.map((experiment) => [experiment.id, experiment.name])
      ),
    [availableExperiments]
  );

  const ungroupedExperiments = availableExperiments.filter(
    (experiment) => !state.groups.some((group) => group.experimentIds.includes(experiment.id))
  );

  return (
    <div className="grouping-screen">
      <header className="grouping-header">
        <div>
          <h3>Grouping</h3>
          <p className="meta">
            LLM-assisted grouping based on metadata. Grouping suggestions are based on interpreted metadata and may be imperfect.
          </p>
        </div>
        <div className="grouping-actions">
          <button type="button" onClick={onBackToValidation}>
            Back to validation
          </button>
          <button type="button" className="primary" onClick={onContinueToModeling}>
            Continue to Model &amp; Fit
          </button>
        </div>
      </header>

      {error && <div className="inline-error">{error}</div>}

      <section className="grouping-stage">
        <header>
          <div>
            <h4>1) Column Scan</h4>
            <p className="meta">LLM proposes relevant metadata columns for grouping.</p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={handleRunColumnScan}
            disabled={columnScanLoading || !columnPayload}
          >
            {columnScanLoading ? "Scanning…" : "Run column scan"}
          </button>
        </header>
        <div className="column-summary-grid">
          {columnSummaries.map((column) => (
            <article key={column.name} className="column-summary">
              <div className="column-header">
                <label>
                  <input
                    type="checkbox"
                    checked={state.selectedColumns.includes(column.name)}
                    onChange={() => handleToggleColumnSelection(column.name)}
                  />
                  <span>{column.name}</span>
                </label>
                <span className="badge">{column.typeHeuristic}</span>
              </div>
              <p className="meta">
                Non-null: {(column.nonNullRatio * 100).toFixed(0)}%
              </p>
              <p className="meta">Examples: {column.examples.map(formatValue).join(", ")}</p>
            </article>
          ))}
          {columnSummaries.length === 0 && (
            <p className="meta">No metadata columns detected.</p>
          )}
        </div>
        <div className="column-scan-footer">
          <label className="toggle">
            <input
              type="checkbox"
              checked={state.includeComments}
              onChange={handleToggleComments}
            />
            Include free-text/comment columns
          </label>
          {state.columnScan?.notes && <p className="meta">{state.columnScan.notes}</p>}
          {state.columnScan?.uncertainties && state.columnScan.uncertainties.length > 0 && (
            <ul className="meta">
              {state.columnScan.uncertainties.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grouping-stage">
        <header>
          <div>
            <h4>2) Factor Extraction</h4>
            <p className="meta">
              Normalize metadata into structured factors with provenance and confidence.
            </p>
          </div>
          <button
            type="button"
            className="primary"
            onClick={handleFactorExtraction}
            disabled={factorExtractionLoading || state.selectedColumns.length === 0}
          >
            {factorExtractionLoading ? "Extracting…" : "Extract factors"}
          </button>
        </header>
        {state.factors.length > 0 ? (
          <div className="factor-table">
            <div className="factor-table-header">
              <div>Experiment</div>
              {factorNames.map((name) => (
                <div key={name}>{name}</div>
              ))}
            </div>
            {factorizedWithOverrides.map((experiment) => (
              <div key={experiment.experimentId} className="factor-table-row">
                <div>
                  <strong>{experimentNameMap.get(experiment.experimentId) ?? experiment.experimentId}</strong>
                </div>
                {factorNames.map((factorName) => {
                  const factor = experiment.factors.find((item) => item.name === factorName);
                  const override =
                    state.overrides[experiment.experimentId]?.[factorName] ?? null;
                  return (
                    <div key={`${experiment.experimentId}-${factorName}`} className="factor-cell">
                      <div className="factor-value">
                        <span>{override ? override.value : formatValue(factor?.value)}</span>
                        <span className={`confidence ${factor?.confidence ?? "low"}`}>
                          {formatConfidence(factor?.confidence ?? "low")}
                        </span>
                        {override && <span className="tag">Override</span>}
                      </div>
                      <div className="factor-actions">
                        {factor?.provenance?.length ? (
                          <button
                            type="button"
                            onClick={() =>
                              setActiveProvenance({
                                experimentId: experiment.experimentId,
                                factorName,
                                provenance: factor.provenance
                              })
                            }
                          >
                            Provenance
                          </button>
                        ) : (
                          <span className="meta">No provenance</span>
                        )}
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            setOverrideDraft({
                              experimentId: experiment.experimentId,
                              factorName,
                              value: override?.value ?? formatValue(factor?.value),
                              reason: ""
                            })
                          }
                        >
                          Override
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">Run extraction to populate factors.</p>
        )}
      </section>

      <section className="grouping-stage">
        <header>
          <div>
            <h4>3) Group Proposal</h4>
            <p className="meta">Deterministic grouping options based on extracted factors.</p>
          </div>
        </header>
        <div className="grouping-options">
          {state.groupingOptions.map((option) => (
            <article key={option.recipeId} className={`grouping-card ${state.selectedOptionId === option.recipeId ? "active" : ""}`}>
              <header>
                <h5>{option.description}</h5>
                <span className="badge">{option.groups.length} groups</span>
              </header>
              <p className="meta">Factors: {option.factorsUsed.join(", ") || "none"}</p>
              <div className="group-size-row">
                {option.groups.map((group) => (
                  <span key={group.groupId} className="chip">
                    {group.experimentIds.length}×
                  </span>
                ))}
              </div>
              <button type="button" onClick={() => handleSelectGroupingOption(option.recipeId)}>
                Use this recipe
              </button>
            </article>
          ))}
          {state.groupingOptions.length === 0 && (
            <p className="meta">Compute factors to see grouping recipes.</p>
          )}
        </div>
      </section>

      <section className="grouping-stage">
        <header>
          <div>
            <h4>4) Manual Group Editor</h4>
            <p className="meta">
              Adjust groups manually. Mixing experiments with different catalysts/additives is allowed but flagged.
            </p>
          </div>
        <div className="grouping-actions">
          <button type="button" onClick={handleCreateGroup}>
            Create group
          </button>
        </div>
      </header>
        {state.groups.length === 0 && availableExperiments.length > 0 && (
          <div className="fallback-row">
            <button type="button" onClick={buildFallbackAllInOne}>
              Fallback: one group with all experiments
            </button>
            <button type="button" className="secondary" onClick={buildFallbackPerExperiment}>
              Fallback: one group per experiment
            </button>
          </div>
        )}
        <div className="group-editor">
          {state.groups.map((group) => (
            <article key={group.groupId} className="group-card">
              <header>
                <input
                  value={group.name}
                  onChange={(event) => handleRenameGroup(group.groupId, event.target.value)}
                />
                <div className="group-card-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const target =
                        state.groups.find((item) => item.groupId !== group.groupId)?.groupId ??
                        "";
                      if (target) {
                        handleMergeGroups(group.groupId, target);
                      }
                    }}
                  >
                    Merge into next
                  </button>
                  <button type="button" className="ghost" onClick={() => handleSplitGroup(group.groupId)}>
                    Split
                  </button>
                </div>
              </header>
              <p className="meta">Signature: {Object.entries(group.signature).map(([key, value]) => `${key}: ${formatValue(value)}`).join(", ") || "n/a"}</p>
              {groupWarnings(group).length > 0 && (
                <div className="warning-badge">
                  {groupWarnings(group).join("; ")}
                </div>
              )}
              <ul className="group-experiments">
                {group.experimentIds.map((experimentId) => (
                  <li key={experimentId}>
                    <div>
                      <strong>{experimentNameMap.get(experimentId) ?? experimentId}</strong>
                    </div>
                    <select
                      value={group.groupId}
                      onChange={(event) => handleMoveExperiment(experimentId, event.target.value)}
                    >
                      {state.groups.map((target) => (
                        <option key={target.groupId} value={target.groupId}>
                          {target.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
                {group.experimentIds.length === 0 && (
                  <li className="meta">No experiments assigned.</li>
                )}
              </ul>
            </article>
          ))}
          {state.groups.length === 0 && (
            <p className="meta">Select a grouping recipe to populate groups.</p>
          )}
        </div>
        {ungroupedExperiments.length > 0 && (
          <div className="ungrouped">
            <h5>Ungrouped experiments</h5>
            <p className="meta">Assign remaining experiments to a group.</p>
            <div className="ungrouped-list">
              {ungroupedExperiments.map((experiment) => (
                <div key={experiment.id} className="ungrouped-item">
                  <span>{experiment.name}</span>
                  <select
                    onChange={(event) => handleMoveExperiment(experiment.id, event.target.value)}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select group
                    </option>
                    {state.groups.map((group) => (
                      <option key={group.groupId} value={group.groupId}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {activeProvenance && (
        <div className="provenance-panel">
          <header>
            <h4>
              Provenance · {activeProvenance.factorName} · {activeProvenance.experimentId}
            </h4>
            <button type="button" onClick={() => setActiveProvenance(null)}>
              Close
            </button>
          </header>
          <ul>
            {activeProvenance.provenance.map((entry, index) => (
              <li key={`${entry.column}-${index}`}>
                <strong>{entry.column}</strong>
                <p className="meta">{entry.rawValueSnippet}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {overrideDraft && (
        <div className="override-panel">
          <header>
            <h4>Override factor</h4>
            <button type="button" onClick={() => setOverrideDraft(null)}>
              Cancel
            </button>
          </header>
          <p className="meta">
            {overrideDraft.factorName} · {overrideDraft.experimentId}
          </p>
          <label className="field">
            Value
            <input
              value={overrideDraft.value}
              onChange={(event) =>
                setOverrideDraft((prev) =>
                  prev ? { ...prev, value: event.target.value } : prev
                )
              }
            />
          </label>
          <label className="field">
            Reason (optional)
            <input
              value={overrideDraft.reason}
              onChange={(event) =>
                setOverrideDraft((prev) =>
                  prev ? { ...prev, reason: event.target.value } : prev
                )
              }
            />
          </label>
          <div className="override-actions">
            <button type="button" className="primary" onClick={handleOverrideSave}>
              Save override
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
