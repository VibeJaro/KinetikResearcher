import { useMemo, useState } from "react";
import type {
  ColumnScanRequest,
  ColumnScanResult,
  FactorExtractionRequest,
  FactorExtractionResponse,
  GroupingOption,
  ManualGroup
} from "../../lib/grouping/types";
import { buildColumnScanPayload, emptyColumnScanResult } from "../../lib/grouping/columnScan";
import {
  dedupeFactors,
  emptyFactorExtractionResponse,
  mergeOverrides,
  toRequestBatches
} from "../../lib/grouping/factorExtraction";
import { generateGroupingOptions, initializeManualGroups } from "../../lib/grouping/groupingOptions";
import { createGroup, mergeGroups, moveExperiment, renameGroup, splitGroup } from "../../lib/grouping/manualEditor";
import type { Dataset } from "../../lib/import/types";

type GroupingScreenProps = {
  dataset: Dataset | null;
  onContinue?: (groups: ManualGroup[]) => void;
  onAudit?: (entry: { type: string; payload?: Record<string, unknown> }) => void;
};

const knownStructuralColumns = ["experimentId", "time", "signal", "value", "replicate"];

const Warning = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-warning">
    <strong>Hinweis:</strong> {children}
  </div>
);

const defaultFactorCandidates = ["catalyst", "additive", "substrate", "solvent", "temperature", "batch", "note"];

const ConfidenceBadge = ({ level }: { level: "low" | "medium" | "high" }) => {
  const tone = level === "high" ? "status-done" : level === "medium" ? "status-info" : "status-warning";
  return <span className={`status-pill ${tone}`}>{level}</span>;
};

type ProvenanceViewProps = {
  provenance: { column: string; rawValueSnippet: string }[];
};

const ProvenanceView = ({ provenance }: ProvenanceViewProps) => (
  <div className="provenance">
    <p className="meta">Provenance</p>
    <ul>
      {provenance.map((entry, index) => (
        <li key={`${entry.column}-${index}`}>
          <strong>{entry.column}</strong>: <span className="meta">{entry.rawValueSnippet}</span>
        </li>
      ))}
    </ul>
  </div>
);

const Disclaimer = () => (
  <p className="disclaimer">
    Grouping suggestions are based on interpreted metadata and may be imperfect.
  </p>
);

export const GroupingScreen = ({ dataset, onContinue, onAudit }: GroupingScreenProps) => {
  const experiments = dataset?.experiments ?? [];
  const groupingExperiments = useMemo(
    () =>
      experiments.map((experiment) => ({
        experimentId: experiment.id,
        metaRaw: experiment.metaRaw ?? {}
      })),
    [experiments]
  );
  const [columnScanResult, setColumnScanResult] = useState<ColumnScanResult>(emptyColumnScanResult);
  const [includeComments, setIncludeComments] = useState(false);
  const [factorResponse, setFactorResponse] = useState<FactorExtractionResponse>(
    emptyFactorExtractionResponse
  );
  const [factorOverrides, setFactorOverrides] = useState<
    Record<string, Record<string, { value: string | number | null; note?: string }>>
  >({});
  const [selectedGroupingOption, setSelectedGroupingOption] = useState<string | null>(null);
  const [manualGroups, setManualGroups] = useState<ManualGroup[]>([]);
  const [activeStage, setActiveStage] = useState<"scan" | "factors" | "grouping" | "manual">(
    "scan"
  );
  const [columnScanError, setColumnScanError] = useState<string | null>(null);
  const [factorError, setFactorError] = useState<string | null>(null);

  const columnScanPayload: ColumnScanRequest | null = useMemo(() => {
    if (groupingExperiments.length === 0) {
      return null;
    }
    return buildColumnScanPayload({
      experiments: groupingExperiments,
      knownStructuralColumns
    });
  }, [groupingExperiments]);

  const factorRequest: FactorExtractionRequest | null = useMemo(() => {
    if (groupingExperiments.length === 0) {
      return null;
    }
    const selectedColumns = columnScanResult.selectedColumns.filter((column) => {
      if (includeComments) {
        return true;
      }
      return columnScanResult.columnRoles[column] !== "comment";
    });
    const factorCandidates =
      columnScanResult.factorCandidates.length > 0
        ? columnScanResult.factorCandidates
        : defaultFactorCandidates;
    return {
      factorCandidates,
      selectedColumns,
      experiments: groupingExperiments.map((experiment) => ({
        experimentId: experiment.experimentId,
        meta: experiment.metaRaw
      }))
    } satisfies FactorExtractionRequest;
  }, [columnScanResult, groupingExperiments, includeComments]);

  const factorTable = useMemo(() => mergeOverrides(factorResponse, factorOverrides), [factorOverrides, factorResponse]);

  const factorPresence = useMemo(() => {
    const available = new Set<string>();
    Object.values(factorTable).forEach((factors) => {
      factors.forEach((factor) => available.add(factor.name));
    });
    return Array.from(available);
  }, [factorTable]);

  const groupingOptions = useMemo<GroupingOption[]>(() => {
    const normalizedFactorTable: Record<string, Record<string, string | number | null>> = {};
    Object.entries(factorTable).forEach(([experimentId, factors]) => {
      normalizedFactorTable[experimentId] = factors.reduce<Record<string, string | number | null>>(
        (acc, factor) => {
          const value = factor.override?.value ?? factor.value;
          acc[factor.name] = value;
          return acc;
        },
        {}
      );
    });
    return generateGroupingOptions({
      factorTable: normalizedFactorTable,
      availableFactors: factorPresence
    });
  }, [factorPresence, factorTable]);

  const handleColumnScan = async () => {
    if (!columnScanPayload) {
      return;
    }
    setColumnScanError(null);
    onAudit?.({ type: "LLM_COLUMN_SCAN_REQUESTED" });
    try {
      const response = await fetch("/api/column-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(columnScanPayload)
      });
      if (!response.ok) {
        const text = await response.text();
        setColumnScanError(`Column scan failed (${response.status}). ${text || "No details."}`);
        return;
      }
      const json = (await response.json()) as ColumnScanResult;
      setColumnScanResult(json);
      setActiveStage("factors");
      onAudit?.({ type: "LLM_COLUMN_SCAN_COMPLETED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown column scan error.";
      setColumnScanError(message);
    }
  };

  const handleFactorExtraction = async () => {
    if (!factorRequest) {
      return;
    }
    setFactorError(null);
    onAudit?.({ type: "LLM_FACTOR_EXTRACTION_REQUESTED" });
    const batches = toRequestBatches(factorRequest, 50);
    const aggregated: FactorExtractionResponse = { experiments: [] };
    try {
      for (const batch of batches) {
        const response = await fetch("/api/factor-extraction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch)
        });
        if (!response.ok) {
          const text = await response.text();
          setFactorError(`Factor extraction failed (${response.status}). ${text || "No details."}`);
          return;
        }
        const json = (await response.json()) as FactorExtractionResponse;
        aggregated.experiments.push(...json.experiments);
      }
      // Deduplicate factors per experiment to keep UI compact
      aggregated.experiments = aggregated.experiments.map((experiment) => ({
        ...experiment,
        factors: dedupeFactors(experiment.factors)
      }));
      setFactorResponse(aggregated);
      setActiveStage("grouping");
      onAudit?.({ type: "LLM_FACTOR_EXTRACTION_COMPLETED" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown factor extraction error.";
      setFactorError(message);
    }
  };

  const handleOverride = (experimentId: string, factorName: string, value: string) => {
    setFactorOverrides((prev) => ({
      ...prev,
      [experimentId]: {
        ...(prev[experimentId] ?? {}),
        [factorName]: { value }
      }
    }));
    onAudit?.({
      type: "FACTOR_OVERRIDDEN_MANUALLY",
      payload: { experimentId, factorName }
    });
  };

  const handleSelectGroupingOption = (recipeId: string) => {
    setSelectedGroupingOption(recipeId);
    const option = groupingOptions.find((item) => item.recipeId === recipeId);
    if (!option) {
      return;
    }
    setManualGroups(
      initializeManualGroups(
        option,
        experiments.reduce<Record<string, string>>((acc, exp) => {
          acc[exp.id] = exp.name;
          return acc;
        }, {})
      )
    );
    setActiveStage("manual");
    onAudit?.({ type: "GROUPING_OPTION_SELECTED", payload: { recipeId } });
  };

  const handleCreateGroup = () => {
    setManualGroups((prev) => createGroup(prev, `Group ${prev.length + 1}`));
    onAudit?.({ type: "GROUP_CREATED" });
  };

  const handleRenameGroup = (groupId: string, name: string) => {
    setManualGroups((prev) => renameGroup(prev, groupId, name));
    onAudit?.({ type: "GROUP_RENAMED", payload: { groupId } });
  };

  const handleMergeGroups = (groupIds: string[]) => {
    setManualGroups((prev) => mergeGroups(prev, groupIds, "Merged group"));
    onAudit?.({ type: "GROUP_MERGED", payload: { groupIds } });
  };

  const handleSplitGroup = (groupId: string, partitions: string[][]) => {
    setManualGroups((prev) => splitGroup(prev, groupId, partitions));
    onAudit?.({ type: "GROUP_SPLIT", payload: { groupId } });
  };

  const handleMoveExperiment = (experimentId: string, targetGroupId: string) => {
    setManualGroups((prev) => moveExperiment(prev, experimentId, targetGroupId));
    onAudit?.({ type: "EXPERIMENT_MOVED_GROUP", payload: { experimentId, targetGroupId } });
  };

  const handleFinalize = () => {
    let groupsToSave = manualGroups;
    if (groupsToSave.length === 0) {
      groupsToSave = [
        {
          groupId: "group-all",
          name: "All experiments",
          experimentIds: experiments.map((exp) => exp.id),
          signature: {},
          createdFromRecipe: selectedGroupingOption ?? "manual"
        }
      ];
    }
    onContinue?.(groupsToSave);
  };

  const resolveGroupWarnings = (group: ManualGroup): string[] => {
    const valuesByFactor = new Map<string, Set<string | number | null>>();
    group.experimentIds.forEach((id) => {
      const factors = factorTable[id];
      if (!factors) {
        return;
      }
      factors.forEach((factor) => {
        const set = valuesByFactor.get(factor.name) ?? new Set();
        set.add(factor.override?.value ?? factor.value ?? null);
        valuesByFactor.set(factor.name, set);
      });
    });
    return Array.from(valuesByFactor.entries())
      .filter(([, set]) => set.size > 1)
      .map(([name]) => name);
  };

  return (
    <div className="grouping-screen">
      <header className="grouping-header">
        <div>
          <h3>Grouping</h3>
          <p className="meta">LLM-assisted column scan → factor extraction → grouping</p>
        </div>
        <div className="stage-indicator">
          <span className={activeStage === "scan" ? "active" : ""}>1. Column scan</span>
          <span className={activeStage === "factors" ? "active" : ""}>2. Factors</span>
          <span className={activeStage === "grouping" ? "active" : ""}>3. Grouping</span>
          <span className={activeStage === "manual" ? "active" : ""}>4. Manual edit</span>
        </div>
      </header>

      <Disclaimer />

      <section className="grouping-section">
        <header className="section-header">
          <div>
            <h4>Step 1 · Column scan</h4>
            <p className="meta">LLM suggests grouping-relevant columns with roles.</p>
          </div>
          <div className="actions">
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeComments}
                onChange={(event) => setIncludeComments(event.target.checked)}
              />
              Include free-text/comment columns
            </label>
            <button type="button" className="primary" onClick={handleColumnScan} disabled={!columnScanPayload}>
              Run column scan
            </button>
          </div>
        </header>
        <div className="card">
          <p className="meta">Selected columns</p>
          {experiments.length === 0 && <p className="meta">Import and map experiments to enable grouping.</p>}
          {columnScanResult.selectedColumns.length === 0 ? (
            <p className="meta">No columns selected yet.</p>
          ) : (
            <div className="chip-row">
              {columnScanResult.selectedColumns.map((column) => (
                <label key={column} className="checkbox">
                  <input
                    type="checkbox"
                    checked
                    onChange={() => {
                      setColumnScanResult((prev) => ({
                        ...prev,
                        selectedColumns: prev.selectedColumns.filter((item) => item !== column)
                      }));
                    }}
                  />
                  {column} <span className="meta">{columnScanResult.columnRoles[column]}</span>
                </label>
              ))}
            </div>
          )}
          {columnScanResult.notes && <p className="meta">{columnScanResult.notes}</p>}
          {columnScanResult.uncertainties && columnScanResult.uncertainties.length > 0 && (
            <Warning>Uncertainty: {columnScanResult.uncertainties.join("; ")}</Warning>
          )}
          {columnScanError && <div className="inline-error">{columnScanError}</div>}
        </div>
      </section>

      <section className="grouping-section">
        <header className="section-header">
          <div>
            <h4>Step 2 · Factor extraction</h4>
            <p className="meta">LLM extracts factors with provenance and confidence.</p>
          </div>
          <button type="button" className="primary" onClick={handleFactorExtraction} disabled={!factorRequest}>
            Run factor extraction
          </button>
        </header>

        <div className="factor-table">
          {factorError && <div className="inline-error">{factorError}</div>}
          {factorResponse.experiments.length === 0 ? (
            <p className="meta">No factors yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Experiment</th>
                  {factorPresence.map((factor) => (
                    <th key={factor}>{factor}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {factorResponse.experiments.map((experiment) => (
                  <tr key={experiment.experimentId}>
                    <td>
                      <div className="stack">
                        <span>{experiment.experimentId}</span>
                        {experiment.warnings && experiment.warnings.length > 0 && (
                          <p className="meta">Warnings: {experiment.warnings.join("; ")}</p>
                        )}
                      </div>
                    </td>
                    {factorPresence.map((factorName) => {
                      const factor = experiment.factors.find((item) => item.name === factorName);
                      if (!factor) {
                        return <td key={factorName} className="meta">—</td>;
                      }
                      const override = factorOverrides[experiment.experimentId]?.[factorName];
                      const value = override?.value ?? factor.value;
                      return (
                        <td key={factorName}>
                          <div className="factor-cell">
                            <div className="factor-value">
                              <input
                                defaultValue={value ?? ""}
                                onBlur={(event) => handleOverride(experiment.experimentId, factorName, event.target.value)}
                                placeholder="Override"
                              />
                              <ConfidenceBadge level={factor.confidence} />
                            </div>
                            <ProvenanceView provenance={factor.provenance} />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="grouping-section">
        <header className="section-header">
          <div>
            <h4>Step 3 · Group proposals</h4>
            <p className="meta">Deterministic grouping options from extracted factors.</p>
          </div>
        </header>

        <div className="option-grid">
          {groupingOptions.length === 0 ? (
            <p className="meta">No grouping options yet.</p>
          ) : (
            groupingOptions.map((option) => (
              <article key={option.recipeId} className={`option-card ${selectedGroupingOption === option.recipeId ? "active" : ""}`}>
                <header>
                  <h5>{option.description}</h5>
                  <p className="meta">Factors: {option.factorsUsed.join(", ")}</p>
                </header>
                <p className="meta">Groups: {option.groups.length}</p>
                <div className="chip-row">
                  {option.groups.map((group) => (
                    <span key={group.groupId} className="chip">{group.experimentIds.length} exp</span>
                  ))}
                </div>
                <button type="button" onClick={() => handleSelectGroupingOption(option.recipeId)} className="primary">
                  Select
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="grouping-section">
        <header className="section-header">
          <div>
            <h4>Step 4 · Manual group editor</h4>
            <p className="meta">Move experiments, rename, merge, split.</p>
          </div>
          <div className="actions">
            <button type="button" className="ghost" onClick={handleCreateGroup}>New group</button>
            <button type="button" className="primary" onClick={handleFinalize}>Continue to Model &amp; Fit</button>
          </div>
        </header>

        <div className="manual-editor">
          <div className="experiment-list">
            <h5>Experiments</h5>
            {manualGroups.length === 0 && (
              <p className="meta">Select a grouping option or create a group to begin.</p>
            )}
            <ul>
              {experiments.map((experiment) => (
                <li key={experiment.id}>
                  <span>{experiment.name}</span>
                  <div className="chip-row">
                    <span className="chip">meta: {Object.keys(experiment.metaRaw).length}</span>
                  </div>
                  <div className="chip-row">
                    {manualGroups.map((group) => (
                      <button
                        key={`${experiment.id}-${group.groupId}`}
                        type="button"
                        onClick={() => handleMoveExperiment(experiment.id, group.groupId)}
                      >
                        Move to {group.name}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="group-columns">
            {manualGroups.map((group) => (
              <article key={group.groupId} className="group-card">
                <header>
                  <input
                    defaultValue={group.name}
                    onBlur={(event) => handleRenameGroup(group.groupId, event.target.value)}
                  />
                  <div className="stack">
                    <p className="meta">{group.experimentIds.length} experiments</p>
                    {resolveGroupWarnings(group).length > 0 && (
                      <span className="tag status-warning">
                        Mixed factors: {resolveGroupWarnings(group).join(", ")}
                      </span>
                    )}
                  </div>
                </header>
                <ul>
                  {group.experimentIds.map((id) => {
                    const exp = experiments.find((item) => item.id === id);
                    return (
                      <li key={id}>
                        {exp?.name ?? id}
                        <button type="button" className="ghost" onClick={() => handleMoveExperiment(id, group.groupId)}>
                          Keep
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {group.experimentIds.length > 1 && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      handleSplitGroup(
                        group.groupId,
                        group.experimentIds.map((id) => [id])
                      )
                    }
                  >
                    Split into singles
                  </button>
                )}
              </article>
            ))}
            {manualGroups.length > 1 && (
              <div className="group-card">
                <h5>Merge tools</h5>
                <p className="meta">Merge all groups into one combined set.</p>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => handleMergeGroups(manualGroups.map((group) => group.groupId))}
                >
                  Merge all
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
