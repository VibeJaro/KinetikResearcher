import { useEffect, useMemo, useState } from "react";
import { collectUniqueValues } from "../../lib/canonicalization/collectUniqueValues";
import type {
  CanonicalizationResponse,
  CanonicalizationSuccessResponse
} from "../../types/canonicalization";
import type { Experiment } from "../../types/experiment";
import { JsonOutputBox } from "../common/JsonOutputBox";

type CanonicalizationPanelProps = {
  experiments: Experiment[];
};

type CanonicalGroup = {
  id: string;
  canonical: string;
  aliasesText: string;
};

type NormalizationSummary = {
  counts: {
    totalUnique: number;
    mapped: number;
    unmapped: number;
    duplicates: number;
    unknown: number;
  };
  rawToCanonical: Record<string, string>;
};

const createGroup = (canonical = "", aliases: string[] = []): CanonicalGroup => ({
  id:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `group-${Math.random().toString(36).slice(2, 10)}`,
  canonical,
  aliasesText: aliases.join("\n")
});

const parseAliases = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const CanonicalizationPanel = ({ experiments }: CanonicalizationPanelProps) => {
  const availableColumns = useMemo(() => {
    const columnSet = new Set<string>();
    experiments.forEach((experiment) => {
      Object.keys(experiment.metaRaw ?? {}).forEach((key) => {
        if (key.trim()) {
          columnSet.add(key);
        }
      });
    });
    return Array.from(columnSet).sort((a, b) => a.localeCompare(b));
  }, [experiments]);

  const [selectedColumn, setSelectedColumn] = useState<string | null>(
    availableColumns[0] ?? null
  );
  const [canonicalGroups, setCanonicalGroups] = useState<CanonicalGroup[]>([]);
  const [requestPayload, setRequestPayload] = useState<Record<string, unknown> | null>(null);
  const [responsePayload, setResponsePayload] = useState<CanonicalizationResponse | string | null>(
    null
  );
  const [normalizationSummary, setNormalizationSummary] = useState<NormalizationSummary | null>(
    null
  );
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedColumn(availableColumns[0] ?? null);
  }, [availableColumns]);

  useEffect(() => {
    setCanonicalGroups([]);
    setRequestPayload(null);
    setResponsePayload(null);
    setNormalizationSummary(null);
    setSuggestionError(null);
    setValidationError(null);
  }, [selectedColumn]);

  const uniqueValueSummary = useMemo(() => {
    if (!selectedColumn) {
      return { values: [] as string[], counts: {} as Record<string, number> };
    }
    return collectUniqueValues(experiments, selectedColumn);
  }, [experiments, selectedColumn]);

  const applySuggestion = (result: CanonicalizationSuccessResponse["result"]) => {
    const groups = Object.entries(result.canonicalToAliases).map(([canonical, aliases]) =>
      createGroup(canonical, aliases)
    );
    const sorted = groups.sort((a, b) => a.canonical.localeCompare(b.canonical));
    setCanonicalGroups(sorted);
  };

  const handleSuggest = async () => {
    if (!selectedColumn || uniqueValueSummary.values.length === 0) {
      return;
    }
    setSuggestionError(null);
    setValidationError(null);
    setNormalizationSummary(null);
    const payload = {
      columnName: selectedColumn,
      values: uniqueValueSummary.values
    };
    setRequestPayload(payload);
    setLoading(true);
    try {
      const response = await fetch("/api/canonicalize-values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const contentType = response.headers.get("content-type");
      let data: CanonicalizationResponse | null = null;
      let textPayload: string | null = null;
      if (contentType && contentType.includes("application/json")) {
        data = (await response.json()) as CanonicalizationResponse;
      } else {
        textPayload = await response.text();
      }

      if (data) {
        setResponsePayload(data);
        if (!data.ok) {
          setSuggestionError(data.error);
          return;
        }
        if (!response.ok) {
          setSuggestionError("Canonicalization request failed");
          return;
        }
        applySuggestion(data.result);
      } else {
        setResponsePayload(textPayload);
        setSuggestionError("Unexpected response format");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch suggestion";
      setSuggestionError(message);
      setResponsePayload(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroup = () => {
    setCanonicalGroups((prev) => [...prev, createGroup()]);
  };

  const handleGroupChange = (id: string, field: "canonical" | "aliases", value: string) => {
    setCanonicalGroups((prev) =>
      prev.map((group) =>
        group.id === id
          ? {
              ...group,
              canonical: field === "canonical" ? value : group.canonical,
              aliasesText: field === "aliases" ? value : group.aliasesText
            }
          : group
      )
    );
  };

  const handleRemoveGroup = (id: string) => {
    setCanonicalGroups((prev) => prev.filter((group) => group.id !== id));
  };

  const handleConfirm = () => {
    setValidationError(null);
    if (!selectedColumn || uniqueValueSummary.values.length === 0) {
      setValidationError("No values to normalize.");
      return;
    }
    if (canonicalGroups.length === 0) {
      setValidationError("Add at least one canonical group before confirming.");
      return;
    }

    const requiredValues = new Set(uniqueValueSummary.values);
    const rawToCanonical: Record<string, string> = {};
    const missing = new Set(uniqueValueSummary.values);
    const duplicates: string[] = [];
    const unknown: string[] = [];
    let invalidGroup = false;

    canonicalGroups.forEach((group) => {
      const canonical = group.canonical.trim();
      const aliases = parseAliases(group.aliasesText);
      if (!canonical || aliases.length === 0) {
        invalidGroup = true;
        return;
      }

      aliases.forEach((alias) => {
        if (!requiredValues.has(alias)) {
          unknown.push(alias);
          return;
        }
        if (rawToCanonical[alias]) {
          duplicates.push(alias);
          return;
        }
        rawToCanonical[alias] = canonical;
        missing.delete(alias);
      });
    });

    if (invalidGroup) {
      setValidationError("Each group needs a canonical value and at least one alias.");
      setNormalizationSummary(null);
      return;
    }

    if (missing.size > 0 || duplicates.length > 0 || unknown.length > 0) {
      setValidationError(
        `Validation failed: unmapped=${missing.size}, duplicates=${duplicates.length}, unknown=${unknown.length}.`
      );
      setNormalizationSummary(null);
      return;
    }

    setNormalizationSummary({
      counts: {
        totalUnique: requiredValues.size,
        mapped: Object.keys(rawToCanonical).length,
        unmapped: missing.size,
        duplicates: duplicates.length,
        unknown: unknown.length
      },
      rawToCanonical
    });
  };

  const topValues = uniqueValueSummary.values.slice(0, 10);

  return (
    <div className="canonicalization-panel">
      <div className="canonicalization-header">
        <div>
          <h4>Canonicalize metadata values</h4>
          <p className="meta">
            Normalize noisy metadata values into canonical buckets. Works on values inside a single
            selected column.
          </p>
        </div>
        <div className="canonicalization-controls">
          <label className="field-label" htmlFor="canonical-column-select">
            Column
          </label>
          <select
            id="canonical-column-select"
            value={selectedColumn ?? ""}
            onChange={(event) => setSelectedColumn(event.target.value || null)}
            disabled={availableColumns.length === 0}
          >
            {availableColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </div>
      </div>

      {availableColumns.length === 0 ? (
        <p className="hint">Import data and map metadata to see available columns.</p>
      ) : (
        <>
          <div className="canonicalization-meta">
            <p className="meta">
              Unique values: {uniqueValueSummary.values.length} · Showing top 10 by frequency
            </p>
            <div className="chip-row">
              {topValues.map((value) => (
                <span key={value} className="chip">
                  {value}
                  {uniqueValueSummary.counts[value] !== undefined && (
                    <span className="chip-count">×{uniqueValueSummary.counts[value]}</span>
                  )}
                </span>
              ))}
              {uniqueValueSummary.values.length === 0 && (
                <span className="chip muted">No non-empty values yet</span>
              )}
            </div>
          </div>

          <div className="canonicalization-actions">
            <button
              type="button"
              className="primary"
              onClick={() => void handleSuggest()}
              disabled={loading || !selectedColumn || uniqueValueSummary.values.length === 0}
            >
              {loading ? "Requesting suggestion..." : "Suggest normalization (LLM)"}
            </button>
            {suggestionError && <p className="meta error-text">{suggestionError}</p>}
          </div>

          <div className="output-grid">
            <JsonOutputBox title="Request payload" value={requestPayload} />
            <JsonOutputBox title="Response payload / error payload" value={responsePayload} />
          </div>

          <div className="canonical-groups">
            <div className="canonical-groups-header">
              <h5>Groups</h5>
              <p className="meta">
                Adjust canonical labels and alias lines. Every raw value must appear exactly once.
              </p>
            </div>
            {canonicalGroups.length === 0 ? (
              <p className="hint">No groups yet. Request a suggestion or add one manually.</p>
            ) : (
              canonicalGroups.map((group) => (
                <div key={group.id} className="canonical-group">
                  <div className="canonical-row">
                    <label className="field-label" htmlFor={`canonical-${group.id}`}>
                      Canonical value
                    </label>
                    <input
                      id={`canonical-${group.id}`}
                      type="text"
                      value={group.canonical}
                      onChange={(event) => handleGroupChange(group.id, "canonical", event.target.value)}
                    />
                  </div>
                  <div className="canonical-row">
                    <label className="field-label" htmlFor={`aliases-${group.id}`}>
                      Aliases (one per line)
                    </label>
                    <textarea
                      id={`aliases-${group.id}`}
                      value={group.aliasesText}
                      onChange={(event) => handleGroupChange(group.id, "aliases", event.target.value)}
                      className="aliases-textarea"
                    />
                  </div>
                  <div className="canonical-row actions">
                    <button type="button" className="ghost" onClick={() => handleRemoveGroup(group.id)}>
                      Remove group
                    </button>
                  </div>
                </div>
              ))
            )}
            <button type="button" className="secondary" onClick={handleAddGroup}>
              Add group
            </button>
          </div>

          <div className="canonicalization-confirm">
            <button
              type="button"
              onClick={handleConfirm}
              className="primary"
              disabled={!selectedColumn || uniqueValueSummary.values.length === 0}
            >
              Confirm normalization
            </button>
            {validationError && <p className="meta error-text">{validationError}</p>}
          </div>

          <JsonOutputBox title="Normalization summary" value={normalizationSummary} />
        </>
      )}
    </div>
  );
};
