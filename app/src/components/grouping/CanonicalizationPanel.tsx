import { useEffect, useMemo, useState } from "react";
import { JsonOutputBox } from "../JsonOutputBox";
import { collectUniqueValues, type UniqueValuesResult } from "../../lib/canonicalization/collectUniqueValues";
import type {
  CanonicalizationResponse,
  CanonicalizationSuccessResponse
} from "../../types/canonicalization";
import type { Experiment } from "../../types/experiment";

type CanonicalizationPanelProps = {
  experiments: Experiment[];
};

type CanonicalGroup = {
  canonical: string;
  aliasesText: string;
};

type NormalizationSummary = {
  columnName: string;
  requestId: string | null;
  rawToCanonical: Record<string, string>;
  counts: {
    totalRawValues: number;
    canonicalGroups: number;
    unmapped: string[];
    duplicates: string[];
    unknown: string[];
  };
};

const normalizeGroup = (group: CanonicalGroup) => {
  const canonical = group.canonical.trim();
  const aliases = group.aliasesText
    .split(/\r?\n/)
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
  return { canonical, aliases };
};

export const CanonicalizationPanel = ({ experiments }: CanonicalizationPanelProps) => {
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [uniqueValuesResult, setUniqueValuesResult] = useState<UniqueValuesResult>({
    values: [],
    counts: {}
  });
  const [requestPayload, setRequestPayload] = useState<Record<string, unknown> | null>(null);
  const [responsePayload, setResponsePayload] = useState<CanonicalizationResponse | null>(null);
  const [groups, setGroups] = useState<CanonicalGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [normalizationSummary, setNormalizationSummary] = useState<NormalizationSummary | null>(
    null
  );

  const availableColumns = useMemo(() => {
    const names = new Set<string>();
    for (const experiment of experiments) {
      Object.keys(experiment.metaRaw ?? {}).forEach((key) => names.add(key));
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [experiments]);

  useEffect(() => {
    if (!selectedColumn) {
      setUniqueValuesResult({ values: [], counts: {} });
      setGroups([]);
      setResponsePayload(null);
      setNormalizationSummary(null);
      return;
    }
    const values = collectUniqueValues(experiments, selectedColumn);
    setUniqueValuesResult(values);
    setGroups([]);
    setResponsePayload(null);
    setNormalizationSummary(null);
  }, [experiments, selectedColumn]);

  const topValues = uniqueValuesResult.values.slice(0, 10);

  const handleSuggest = async () => {
    if (!selectedColumn || uniqueValuesResult.values.length === 0) {
      return;
    }
    setLoading(true);
    setStatusMessage(null);
    setNormalizationSummary(null);
    const payload = {
      columnName: selectedColumn,
      values: uniqueValuesResult.values
    };
    setRequestPayload(payload);

    try {
      const response = await fetch("/api/canonicalize-values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = (await response.json()) as CanonicalizationResponse;
      setResponsePayload(data);
      if (!data.ok) {
        setStatusMessage(data.error);
        return;
      }
      const result = (data as CanonicalizationSuccessResponse).result;
      const nextGroups: CanonicalGroup[] = Object.entries(result.canonicalToAliases).map(
        ([canonical, aliases]) => ({
          canonical,
          aliasesText: aliases.join("\n")
        })
      );
      setGroups(nextGroups);
      setStatusMessage(result.notes ?? "Normalization suggestions ready");
    } catch (error) {
      setResponsePayload({
        ok: false,
        error: error instanceof Error ? error.message : "Request failed",
        requestId: "n/a"
      });
      setStatusMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGroupChange = (index: number, field: "canonical" | "aliasesText", value: string) => {
    setGroups((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddGroup = () => {
    setGroups((prev) => [...prev, { canonical: "", aliasesText: "" }]);
  };

  const handleNormalizationConfirm = () => {
    if (!selectedColumn) {
      setStatusMessage("Select a column first.");
      return;
    }
    if (uniqueValuesResult.values.length === 0) {
      setStatusMessage("No values to normalize for the selected column.");
      return;
    }

    const normalizedGroups = groups
      .map((group) => normalizeGroup(group))
      .filter((group) => group.canonical.length > 0 || group.aliases.length > 0);

    if (normalizedGroups.length === 0) {
      setStatusMessage("Add at least one canonical group.");
      return;
    }

    const coverage = new Map<string, string>();
    const duplicates: string[] = [];
    const unknown: string[] = [];

    for (const group of normalizedGroups) {
      if (!group.canonical) {
        setStatusMessage("Canonical value cannot be empty.");
        return;
      }
      const aliases = [group.canonical, ...group.aliases];
      for (const alias of aliases) {
        if (!uniqueValuesResult.values.includes(alias)) {
          if (!unknown.includes(alias)) {
            unknown.push(alias);
          }
          continue;
        }
        if (coverage.has(alias)) {
          if (!duplicates.includes(alias)) {
            duplicates.push(alias);
          }
        } else {
          coverage.set(alias, group.canonical);
        }
      }
    }

    const unmapped = uniqueValuesResult.values.filter((value) => !coverage.has(value));
    const summary: NormalizationSummary = {
      columnName: selectedColumn,
      requestId: responsePayload?.requestId ?? null,
      rawToCanonical: Object.fromEntries(coverage.entries()),
      counts: {
        totalRawValues: uniqueValuesResult.values.length,
        canonicalGroups: normalizedGroups.length,
        unmapped,
        duplicates,
        unknown
      }
    };
    setNormalizationSummary(summary);
    if (unmapped.length === 0 && duplicates.length === 0) {
      setStatusMessage("Normalization mapping covers all values.");
    } else {
      setStatusMessage("Normalization has gaps or duplicates. Please resolve.");
    }
  };

  return (
    <div className="canonicalization-card">
      <div className="canonicalization-header">
        <div>
          <h4>Canonicalize column values</h4>
          <p className="meta">
            Normalize inconsistent column values into a canonical map. Raw values are preserved and
            every unique value must map exactly once.
          </p>
        </div>
        <div className="canonicalization-actions">
          <label className="field-label" htmlFor="canonical-column">
            Column
          </label>
          <select
            id="canonical-column"
            value={selectedColumn}
            onChange={(event) => setSelectedColumn(event.target.value)}
            disabled={loading || availableColumns.length === 0}
          >
            <option value="">Select column</option>
            {availableColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="primary"
            onClick={() => void handleSuggest()}
            disabled={
              !selectedColumn || uniqueValuesResult.values.length === 0 || loading
            }
          >
            {loading ? "Requesting..." : "Suggest normalization (LLM)"}
          </button>
        </div>
      </div>

      {selectedColumn && (
        <div className="canonicalization-meta">
          <p className="meta">
            Unique values: {uniqueValuesResult.values.length} • Showing top {topValues.length}
          </p>
          {topValues.length > 0 && (
            <div className="chip-row">
              {topValues.map((value) => (
                <span key={value} className="chip">
                  {value} ({uniqueValuesResult.counts[value] ?? 0})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {statusMessage && <p className="meta">{statusMessage}</p>}

      <div className="canonicalization-debug">
        <JsonOutputBox title="Request payload" value={requestPayload ?? "n/a"} />
        <JsonOutputBox
          title="Response payload / error payload"
          value={responsePayload ?? "n/a"}
        />
        {normalizationSummary && (
          <JsonOutputBox title="Normalization summary" value={normalizationSummary} />
        )}
      </div>

      {(groups.length > 0 || (selectedColumn && uniqueValuesResult.values.length > 0)) && (
        <div className="canonicalization-groups">
          <div className="canonicalization-groups-header">
            <div>
              <h5>Canonical groups</h5>
              <p className="meta">
                Edit canonical labels and aliases. Every raw value must appear exactly once across
                all groups.
              </p>
            </div>
            <button type="button" className="ghost" onClick={handleAddGroup}>
              Add group
            </button>
          </div>

          {groups.length === 0 && (
            <div className="canonicalization-empty">
              <p className="meta">No groups yet. Add one to start manual normalization.</p>
            </div>
          )}

          <div className="canonicalization-group-list">
            {groups.map((group, index) => (
              <div key={`canonical-group-${index}`} className="canonicalization-group">
                <label className="field">
                  <span className="field-label">Canonical</span>
                  <input
                    type="text"
                    value={group.canonical}
                    onChange={(event) =>
                      handleGroupChange(index, "canonical", event.target.value)
                    }
                    placeholder="Pd/C"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Aliases (one per line)</span>
                  <textarea
                    value={group.aliasesText}
                    onChange={(event) =>
                      handleGroupChange(index, "aliasesText", event.target.value)
                    }
                    rows={4}
                    placeholder={"Pd/C\nPd-C\nPd on C"}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="canonicalization-actions-footer">
            <button type="button" className="primary" onClick={handleNormalizationConfirm}>
              Confirm normalization
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
