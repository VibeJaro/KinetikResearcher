import { useEffect, useMemo, useState } from "react";
import type { Experiment } from "../../types/experiment";
import type { ColumnScanPayload } from "../../types/columnScan";
import type {
  CanonicalGroupDraft,
  CanonicalMapState,
  CanonicalizationResult,
  CanonicalizationSummary
} from "../../types/canonicalization";
import { collectUniqueValues } from "../../lib/canonicalization/collectUniqueValues";

type NormalizePanelProps = {
  experiments: Experiment[];
  columnScanPayload: ColumnScanPayload | null;
};

const MAX_COLUMNS_FALLBACK = 10;

const fallbackColumns = [
  "Catalyst_used",
  "Solvent",
  "Temperature",
  "Pressure",
  "pH",
  "Stirring_rate",
  "Atmosphere",
  "Support",
  "Additive",
  "Batch_id"
];

const buildRawToCanonical = (
  canonicalToAliases: Record<string, string[]>
): Record<string, string> => {
  const map: Record<string, string> = {};
  Object.entries(canonicalToAliases).forEach(([canonical, aliases]) => {
    aliases.forEach((alias) => {
      const trimmed = alias.trim();
      if (trimmed) {
        map[trimmed] = canonical;
      }
    });
  });
  return map;
};

const normalizeGroupDrafts = (result: CanonicalizationResult): CanonicalGroupDraft[] =>
  Object.entries(result.canonicalToAliases).map(([canonical, aliases]) => ({
    canonical,
    aliases
  }));

const buildSummary = (
  columnName: string,
  canonicalToAliases: Record<string, string[]>,
  sourceValues: string[]
): CanonicalizationSummary => {
  const mappedAliases = new Set<string>();
  Object.values(canonicalToAliases).forEach((aliases) => {
    aliases.forEach((alias) => mappedAliases.add(alias.trim()));
  });
  const unmapped = sourceValues.filter((value) => !mappedAliases.has(value));
  return {
    columnName,
    canonicalGroupCount: Object.keys(canonicalToAliases).length,
    rawValueCount: sourceValues.length,
    unmapped: unmapped.length
  };
};

export const NormalizePanel = ({ experiments, columnScanPayload }: NormalizePanelProps) => {
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [uniqueValues, setUniqueValues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<CanonicalizationResult | null>(null);
  const [groups, setGroups] = useState<CanonicalGroupDraft[]>([]);
  const [canonicalMap, setCanonicalMap] = useState<CanonicalMapState | null>(null);
  const [summary, setSummary] = useState<CanonicalizationSummary | null>(null);

  const availableColumns = useMemo(() => {
    const metaColumns = new Set<string>();
    experiments.forEach((experiment) => {
      Object.keys(experiment.metaRaw).forEach((key) => {
        if (key.trim()) {
          metaColumns.add(key.trim());
        }
      });
    });
    if (metaColumns.size > 0) {
      return Array.from(metaColumns).sort();
    }
    if (columnScanPayload?.columns?.length) {
      return columnScanPayload.columns
        .map((column) => column.name)
        .filter((name) => name.trim().length > 0)
        .slice(0, MAX_COLUMNS_FALLBACK);
    }
    return fallbackColumns.slice(0, MAX_COLUMNS_FALLBACK);
  }, [columnScanPayload?.columns, experiments]);

  useEffect(() => {
    if (availableColumns.length > 0 && !selectedColumn) {
      setSelectedColumn(availableColumns[0]);
    }
  }, [availableColumns, selectedColumn]);

  useEffect(() => {
    if (!selectedColumn) {
      setUniqueValues([]);
      return;
    }
    const values = collectUniqueValues(experiments, selectedColumn);
    setUniqueValues(values);
  }, [experiments, selectedColumn]);

  const handleSuggest = async () => {
    if (!selectedColumn) {
      setError("Select a column to normalize");
      return;
    }
    const values = collectUniqueValues(experiments, selectedColumn);
    if (values.length === 0) {
      setError("No values to normalize for this column");
      return;
    }
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    setRequestId(null);
    setResult(null);
    setGroups([]);
    try {
      const response = await fetch("/api/canonicalize-values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnName: selectedColumn, values })
      });
      const isJson = response.headers.get("content-type")?.includes("application/json");
      const payload = isJson ? await response.json() : null;
      const responseRequestId = payload?.requestId ?? null;
      setRequestId(responseRequestId);
      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Normalization failed");
        setErrorDetails(payload?.details ?? response.statusText);
        return;
      }
      const nextResult = payload.result as CanonicalizationResult;
      setResult(nextResult);
      setGroups(normalizeGroupDrafts(nextResult));
    } catch (err) {
      setError("Normalization failed");
      setErrorDetails(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateGroup = (index: number, update: Partial<CanonicalGroupDraft>) => {
    setGroups((prev) =>
      prev.map((group, idx) => (idx === index ? { ...group, ...update } : group))
    );
  };

  const validateAndConfirm = () => {
    if (uniqueValues.length === 0) {
      setError("No values to confirm");
      return;
    }
    const normalizedGroups = groups.map((group) => ({
      canonical: group.canonical.trim(),
      aliases: group.aliases
        .map((alias) => alias.trim())
        .filter((alias) => alias.length > 0)
    }));

    const aliasToCanonical = new Map<string, string>();
    for (const group of normalizedGroups) {
      if (!group.canonical) {
        setError("Canonical name cannot be empty");
        return;
      }
      for (const alias of group.aliases) {
        if (aliasToCanonical.has(alias)) {
          setError("Each raw value must map to exactly one canonical entry");
          setErrorDetails(`Duplicate mapping for value "${alias}"`);
          return;
        }
        aliasToCanonical.set(alias, group.canonical);
      }
    }

    const missing = uniqueValues.filter((value) => !aliasToCanonical.has(value));
    if (missing.length > 0) {
      setError("All values must be mapped");
      setErrorDetails(`Unmapped values: ${missing.slice(0, 5).join(", ")}`);
      return;
    }

    const canonicalToAliases: Record<string, string[]> = {};
    normalizedGroups.forEach((group) => {
      canonicalToAliases[group.canonical] = group.aliases;
    });

    const rawToCanonical = buildRawToCanonical(canonicalToAliases);
    setCanonicalMap({
      columnName: selectedColumn,
      canonicalToAliases,
      rawToCanonical,
      notes: result?.notes ?? "",
      uncertainties: result?.uncertainties ?? [],
      requestId,
      sourceValues: uniqueValues
    });
    setSummary(buildSummary(selectedColumn, canonicalToAliases, uniqueValues));
    setError(null);
    setErrorDetails(null);
  };

  const outputPayload = useMemo(() => {
    if (result) {
      return result;
    }
    if (canonicalMap) {
      return canonicalMap;
    }
    return null;
  }, [canonicalMap, result]);

  return (
    <div className="normalize-card">
      <div className="normalize-header">
        <div>
          <h4>Normalize values</h4>
          <p className="meta">
            Collect unique raw values, call /api/canonicalize-values, and review the canonical map.
          </p>
        </div>
        <div className="normalize-actions">
          <label className="select-control">
            <span>Column</span>
            <select
              value={selectedColumn}
              onChange={(event) => setSelectedColumn(event.target.value)}
              disabled={loading || availableColumns.length === 0}
            >
              {availableColumns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary"
            onClick={() => void handleSuggest()}
            disabled={loading || availableColumns.length === 0}
          >
            {loading ? "Suggesting..." : "Suggest normalization (LLM)"}
          </button>
        </div>
      </div>

      {error && (
        <div className="inline-error">
          <p className="error-title">
            Normalization failed (requestId: {requestId ?? "n/a"})
          </p>
          <p className="meta">{error}</p>
          {errorDetails && <p className="meta">{errorDetails}</p>}
        </div>
      )}

      <div className="normalize-meta">
        <p className="meta">
          Unique values: {uniqueValues.length} · Column: {selectedColumn || "n/a"}
        </p>
      </div>

      {outputPayload && (
        <div className="debug-box output-box">
          <h6>LLM response payload</h6>
          <p className="meta">requestId: {requestId ?? canonicalMap?.requestId ?? "n/a"}</p>
          <pre>{JSON.stringify(outputPayload, null, 2)}</pre>
          {summary && (
            <div className="meta">
              Summary: {summary.canonicalGroupCount} canonical groups, {summary.rawValueCount} raw
              values, unmapped={summary.unmapped}
            </div>
          )}
        </div>
      )}

      {groups.length > 0 && (
        <div className="normalize-review">
          <div className="normalize-review-header">
            <div>
              <h5>Review canonical groups</h5>
              <p className="meta">Edit canonical labels and aliases before confirming.</p>
            </div>
            <button type="button" className="primary" onClick={validateAndConfirm} disabled={loading}>
              Confirm normalization
            </button>
          </div>
          <div className="normalize-group-grid">
            {groups.map((group, index) => (
              <div key={`${group.canonical}-${index}`} className="normalize-group-card">
                <label className="input-stack">
                  <span>Canonical</span>
                  <input
                    type="text"
                    value={group.canonical}
                    onChange={(event) => handleUpdateGroup(index, { canonical: event.target.value })}
                  />
                </label>
                <label className="input-stack">
                  <span>Aliases (one per line)</span>
                  <textarea
                    value={group.aliases.join("\n")}
                    onChange={(event) =>
                      handleUpdateGroup(index, { aliases: event.target.value.split("\n") })
                    }
                    rows={5}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {canonicalMap && (
        <div className="inline-success">
          <p className="success-title">Canonical map stored</p>
          <p className="meta">
            Column: {canonicalMap.columnName} · Groups:{" "}
            {Object.keys(canonicalMap.canonicalToAliases).length} · Raw values:{" "}
            {canonicalMap.sourceValues.length}
          </p>
        </div>
      )}
    </div>
  );
};
