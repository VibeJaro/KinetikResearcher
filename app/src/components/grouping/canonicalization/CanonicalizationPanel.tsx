import { useEffect, useMemo, useState } from "react";
import {
  collectUniqueValues,
  validateCanonicalAssignments
} from "../../../lib/canonicalization";
import type {
  CanonicalGroupInput,
  CanonicalMapState,
  CanonicalizationErrorResponse,
  CanonicalizationSuccessResponse,
  CanonicalValidationOk
} from "../../../types/canonicalization";
import type { Experiment } from "../../../types/experiment";

const MAX_VALUES = 300;

type CanonicalizationPanelProps = {
  experiments: Experiment[];
  columnOptions: string[];
  savedMap: Record<string, CanonicalMapState>;
  onMapChange: (columnName: string, map: CanonicalMapState) => void;
};

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

const deriveGroupsFromMap = (
  canonicalToAliases: Record<string, string[]>
): CanonicalGroupInput[] =>
  Object.entries(canonicalToAliases).map(([canonical, aliases]) => ({
    canonical,
    aliases
  }));

export const CanonicalizationPanel = ({
  experiments,
  columnOptions,
  savedMap,
  onMapChange
}: CanonicalizationPanelProps) => {
  const [selectedColumn, setSelectedColumn] = useState<string>(columnOptions[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [modelResult, setModelResult] = useState<CanonicalizationSuccessResponse | null>(null);
  const [groups, setGroups] = useState<CanonicalGroupInput[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationDetails, setValidationDetails] = useState<{
    missing: string[];
    duplicates: string[];
    extraneous: string[];
  }>({ missing: [], duplicates: [], extraneous: [] });

  const uniqueValues = useMemo(() => {
    return collectUniqueValues(experiments, selectedColumn).slice(0, MAX_VALUES);
  }, [experiments, selectedColumn]);

  const savedState = savedMap[selectedColumn];

  useEffect(() => {
    if (savedState) {
      setGroups(deriveGroupsFromMap(savedState.canonicalToAliases));
    }
  }, [savedState]);

  const resetFeedback = () => {
    setError(null);
    setErrorDetails(null);
    setModelResult(null);
    setRequestId(null);
    setValidationErrors([]);
    setValidationDetails({ missing: [], duplicates: [], extraneous: [] });
  };

  const handleColumnChange = (value: string) => {
    setSelectedColumn(value);
    resetFeedback();
    if (savedMap[value]) {
      setGroups(deriveGroupsFromMap(savedMap[value].canonicalToAliases));
      setRequestId(savedMap[value].requestId ?? null);
    } else {
      setGroups([]);
    }
  };

  const handleAddGroup = () => {
    setGroups((prev) => [...prev, { canonical: "", aliases: [] }]);
  };

  const handleGroupChange = (index: number, canonical: string, aliasesRaw: string) => {
    const aliasList = aliasesRaw
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    setGroups((prev) =>
      prev.map((group, idx) => (idx === index ? { canonical, aliases: aliasList } : group))
    );
  };

  const handleSuggest = async () => {
    resetFeedback();
    setLoading(true);
    try {
      const response = await fetch("/api/canonicalize-values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnName: selectedColumn, values: uniqueValues })
      });

      const isJson = response.headers.get("content-type")?.includes("application/json");
      const payload: CanonicalizationSuccessResponse | CanonicalizationErrorResponse | null =
        isJson ? await response.json() : null;

      const responseRequestId =
        payload && "requestId" in payload ? payload.requestId ?? null : null;
      setRequestId(responseRequestId);

      if (!response.ok || !payload || payload.ok === false) {
        setError(payload?.error ?? "Normalization failed");
        setErrorDetails(payload?.details ?? response.statusText);
        return;
      }

      setModelResult(payload);
      setGroups(deriveGroupsFromMap(payload.result.canonicalToAliases));
    } catch (err) {
      setError("Normalization failed");
      setErrorDetails(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    const validation = validateCanonicalAssignments(uniqueValues, groups);
    if (!validation.ok) {
      setValidationErrors(validation.errors);
      setValidationDetails({
        missing: validation.missing,
        duplicates: validation.duplicates,
        extraneous: validation.extraneous
      });
      return;
    }

    const okValidation = validation as CanonicalValidationOk;
    const nextMap: CanonicalMapState = {
      columnName: selectedColumn,
      canonicalToAliases: okValidation.canonicalToAliases,
      rawToCanonical: okValidation.rawToCanonical,
      notes: modelResult?.result.notes ?? "",
      uncertainties: modelResult?.result.uncertainties ?? [],
      requestId,
      values: uniqueValues
    };
    onMapChange(selectedColumn, nextMap);
    setValidationErrors([]);
    setValidationDetails({ missing: [], duplicates: [], extraneous: [] });
  };

  const renderSummary = () => {
    const previewValidation = validateCanonicalAssignments(uniqueValues, groups);
    const summarySource =
      savedState ??
      (previewValidation.ok
        ? {
            canonicalToAliases: previewValidation.canonicalToAliases,
            rawToCanonical: previewValidation.rawToCanonical,
            notes: modelResult?.result.notes ?? "",
            uncertainties: modelResult?.result.uncertainties ?? []
          }
        : null);

    if (!summarySource) {
      return null;
    }

    const mappedCount = Object.values(summarySource.canonicalToAliases).reduce(
      (sum, aliases) => sum + aliases.length,
      0
    );

    const rawToCanonical = summarySource.rawToCanonical ?? {};
    const unmapped = uniqueValues.filter((value) => !rawToCanonical[value]);

    return (
      <div className="inline-success">
        <p className="success-title">Normalization summary</p>
        <p className="meta">
          Canonical groups: {Object.keys(summarySource.canonicalToAliases).length} · Total mapped:{" "}
          {mappedCount}
          {unmapped.length === 0 ? " · Unmapped: 0" : ""}
        </p>
        {unmapped.length > 0 && (
          <p className="meta">Unmapped values: {unmapped.join(", ")}</p>
        )}
      </div>
    );
  };

  return (
    <div className="canonical-panel">
      <div className="canonical-header">
        <div>
          <h4>Normalize values</h4>
          <p className="meta">
            Collect raw metadata values, ask the LLM for canonical groups, then confirm
            deterministically.
          </p>
        </div>
        <div className="canonical-actions">
          <select
            value={selectedColumn}
            onChange={(event) => handleColumnChange(event.target.value)}
            disabled={loading || columnOptions.length === 0}
          >
            {columnOptions.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="primary"
            onClick={() => void handleSuggest()}
            disabled={loading || uniqueValues.length === 0}
          >
            {loading ? "Requesting..." : "Suggest normalization (LLM)"}
          </button>
        </div>
      </div>

      <div className="canonical-output">
        <div className="debug-box">
          <h6>Response JSON</h6>
          <pre>
            {modelResult
              ? formatJson(modelResult.result)
              : error
                ? error
                : "Awaiting response"}
          </pre>
        </div>
        <div className="debug-box">
          <h6>Request ID</h6>
          <pre>{requestId ?? "n/a"}</pre>
        </div>
        {error && (
          <div className="debug-box error-box">
            <h6>Error</h6>
            <pre>{error}</pre>
            {errorDetails && <pre>{errorDetails}</pre>}
          </div>
        )}
      </div>

      {modelResult && (
        <div className="canonical-review">
          <h5>Review canonical groups</h5>
          <p className="meta">
            Edit canonical labels and alias lists. Every raw value must appear exactly once.
          </p>
          <div className="group-list">
            {groups.map((group, index) => (
              <div key={`${group.canonical}-${index}`} className="group-row">
                <label>
                  <span>Canonical</span>
                  <input
                    type="text"
                    value={group.canonical}
                    onChange={(event) =>
                      handleGroupChange(index, event.target.value, group.aliases.join("\n"))
                    }
                  />
                </label>
                <label>
                  <span>Aliases</span>
                  <textarea
                    value={group.aliases.join("\n")}
                    onChange={(event) => handleGroupChange(index, group.canonical, event.target.value)}
                    rows={3}
                  />
                </label>
              </div>
            ))}
            <button type="button" onClick={handleAddGroup} className="ghost">
              + Add group
            </button>
          </div>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="inline-error">
          <p className="error-title">Validation failed</p>
          <ul className="meta-list">
            {validationErrors.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {validationDetails.missing.length > 0 && (
              <li>Missing: {validationDetails.missing.join(", ")}</li>
            )}
            {validationDetails.duplicates.length > 0 && (
              <li>Duplicates: {validationDetails.duplicates.join(", ")}</li>
            )}
            {validationDetails.extraneous.length > 0 && (
              <li>Extraneous: {validationDetails.extraneous.join(", ")}</li>
            )}
          </ul>
        </div>
      )}

      {renderSummary()}

      {uniqueValues.length > 0 && (
        <div className="debug-box">
          <h6>Unique raw values ({uniqueValues.length})</h6>
          <pre>{uniqueValues.join("\n")}</pre>
        </div>
      )}

      <div className="canonical-footer">
        <button
          type="button"
          className="primary"
          onClick={handleConfirm}
          disabled={groups.length === 0}
        >
          Confirm normalization
        </button>
      </div>
    </div>
  );
};
