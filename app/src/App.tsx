import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { GroupingScreen } from "./components/grouping/GroupingScreen";
import { MappingPanel } from "./components/import/MappingPanel";
import { ValidationScreen } from "./components/validation/ValidationScreen";
import { buildColumnSummaries } from "./lib/columnScan/buildColumnSummaries";
import {
  applyMappingToDataset,
  normalizeMappingTable,
  type MappingError,
  type MappingSelection,
  type MappingStats
} from "./lib/import/mapping";
import { parseFile } from "./lib/import/parseFile";
import type { AuditEntry, Dataset, RawTable } from "./lib/import/types";
import type { ValidationReport } from "./lib/import/validation";
import { generateImportValidationReport } from "./lib/import/validation";
import type { ColumnScanPayload } from "./types/columnScan";

// UI reference draft: design/kinetik-researcher.design-draft.html

type StepKey = "import" | "validation" | "grouping" | "modeling" | "report";

const steps: { key: StepKey; label: string; description: string }[] = [
  { key: "import", label: "Import", description: "Rohdaten laden & zuweisen" },
  { key: "validation", label: "Validierung", description: "Schneller Daten-Check" },
  { key: "grouping", label: "Grouping", description: "Experimente bündeln" },
  { key: "modeling", label: "Modeling", description: "Fit & Charts" },
  { key: "report", label: "Report", description: "Zusammenfassung" }
];

const createAuditEntry = (type: string, payload: Record<string, unknown>): AuditEntry => ({
  id: `audit-${Math.random().toString(36).slice(2, 10)}`,
  ts: new Date().toISOString(),
  type,
  payload
});

const createDatasetShell = (
  fileName: string,
  createdAt = new Date()
): Dataset => ({
  id: `dataset-${Math.random().toString(36).slice(2, 10)}`,
  name: fileName,
  createdAt: createdAt.toISOString(),
  experiments: [],
  audit: []
});

const findDefaultTimeColumn = (headers: string[]): number | null => {
  const index = headers.findIndex((header) => /\b(time|t)\b/i.test(header.trim()));
  return index >= 0 ? index : null;
};

function App() {
  const [activeStep, setActiveStep] = useState<StepKey>("import");
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [rawTables, setRawTables] = useState<RawTable[]>([]);
  const [activeRawTable, setActiveRawTable] = useState<RawTable | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importFileType, setImportFileType] = useState<string | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mappingSelection, setMappingSelection] = useState<MappingSelection>({
    firstRowIsHeader: true,
    timeColumnIndex: null,
    valueColumnIndices: [],
    experimentColumnIndex: null
  });
  const [mappingErrors, setMappingErrors] = useState<MappingError[]>([]);
  const [mappingStats, setMappingStats] = useState<MappingStats | null>(null);
  const [mappingSuccess, setMappingSuccess] = useState<MappingStats | null>(null);
  const [mappingSuccessShown, setMappingSuccessShown] = useState(false);
  const [lastAppliedSelection, setLastAppliedSelection] =
    useState<MappingSelection | null>(null);
  const [importReport, setImportReport] = useState<ValidationReport | null>(null);
  const mappingPanelRef = useRef<HTMLDivElement | null>(null);

  const normalizedActiveTable = useMemo(
    () =>
      activeRawTable
        ? normalizeMappingTable(activeRawTable, mappingSelection.firstRowIsHeader)
        : null,
    [activeRawTable, mappingSelection.firstRowIsHeader]
  );
  const importedExperiments = useMemo(
    () => dataset?.experiments ?? [],
    [dataset?.experiments]
  );

  useEffect(() => {
    setDataset((prev) => (prev ? { ...prev, audit: auditEntries } : prev));
  }, [auditEntries]);

  const columnScanPayload = useMemo<ColumnScanPayload | null>(() => {
    if (!normalizedActiveTable) {
      return null;
    }
    const columnProfiles = buildColumnSummaries(normalizedActiveTable);
    if (columnProfiles.length === 0) {
      return null;
    }
    const getHeader = (index: number | null): string | null =>
      index !== null && columnProfiles[index] ? columnProfiles[index].name : null;
    const valueHeaders = mappingSelection.valueColumnIndices
      .map((index) => columnProfiles[index]?.name)
      .filter((header): header is string => typeof header === "string");

    const structuralSummary = {
      time: getHeader(mappingSelection.timeColumnIndex),
      values: valueHeaders,
      experiment: getHeader(mappingSelection.experimentColumnIndex)
    };
    const knownStructuralColumns = Array.from(
      new Set(
        [
          structuralSummary.time,
          structuralSummary.experiment,
          ...structuralSummary.values
        ].filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0
        )
      )
    );

    return {
      columns: columnProfiles,
      experimentCount: mappingStats?.experimentCount ?? null,
      knownStructuralColumns,
      structuralSummary
    };
  }, [mappingSelection, mappingStats, normalizedActiveTable]);

  useEffect(() => {
    if (!activeRawTable) {
      return;
    }
    setMappingSelection({
      firstRowIsHeader: true,
      timeColumnIndex: findDefaultTimeColumn(activeRawTable.headers),
      valueColumnIndices: [],
      experimentColumnIndex: null
    });
    setMappingErrors([]);
    setMappingStats(null);
    setMappingSuccess(null);
    setMappingSuccessShown(false);
    setLastAppliedSelection(null);
    setImportReport(null);
  }, [activeRawTable]);

  useEffect(() => {
    if (!mappingSuccess || mappingSuccessShown) {
      return;
    }
    setAuditEntries((prev) => [
      createAuditEntry("MAPPING_SUCCESS_SHOWN", {
        experimentCount: mappingSuccess.experimentCount,
        seriesCount: mappingSuccess.seriesCount,
        pointCount: mappingSuccess.pointCount
      }),
      ...prev
    ]);
    setMappingSuccessShown(true);
  }, [mappingSuccess, mappingSuccessShown]);

  const isSameSelection = (
    current: MappingSelection,
    last: MappingSelection | null
  ): boolean => {
    if (!last) {
      return false;
    }
    return (
      current.firstRowIsHeader === last.firstRowIsHeader &&
      current.timeColumnIndex === last.timeColumnIndex &&
      current.experimentColumnIndex === last.experimentColumnIndex &&
      current.valueColumnIndices.length === last.valueColumnIndices.length &&
      current.valueColumnIndices.every((value, index) => value === last.valueColumnIndices[index])
    );
  };

  const handleMappingSelectionChange = (next: MappingSelection) => {
    setMappingSelection(next);
    setMappingErrors([]);
    setMappingStats(null);
    if (mappingSuccess && !isSameSelection(next, lastAppliedSelection)) {
      setMappingSuccess(null);
      setMappingSuccessShown(false);
      setLastAppliedSelection(null);
    }
  };

  const handleFileUpload = async (file: File) => {
    setImportError(null);
    setImportFileName(file.name);
    setImportFileType(null);
    setRawTables([]);
    setActiveRawTable(null);
    setAvailableSheets([]);
    setSelectedSheet(null);
    setMappingSuccess(null);
    setMappingSuccessShown(false);
    setLastAppliedSelection(null);
    const uploadEntry = createAuditEntry("FILE_UPLOADED", {
      fileName: file.name,
      fileType: file.name.split(".").pop()?.toLowerCase()
    });

    try {
      const result = await parseFile(file);
      setImportFileType(result.fileType);
      setRawTables(result.rawTables);
      setActiveRawTable(result.activeTable);
      setAvailableSheets(result.sheetNames);
      setSelectedSheet(result.activeTable.sheetName ?? result.sheetNames[0] ?? null);

      const parsedEntry = createAuditEntry("FILE_PARSED", {
        fileName: file.name,
        fileType: result.fileType,
        sheet: result.activeTable.sheetName ?? "Sheet1"
      });

      setAuditEntries((prev) => {
        const nextAuditEntries = [parsedEntry, uploadEntry, ...prev];
        setDataset((current) => {
          if (current) {
            return { ...current, experiments: [], name: file.name, audit: nextAuditEntries };
          }
          const shell = createDatasetShell(file.name);
          return { ...shell, audit: nextAuditEntries };
        });
        return nextAuditEntries;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown parse error.";
      setImportError(message);
      const failedEntry = createAuditEntry("FILE_PARSE_FAILED", {
        fileName: file.name,
        message
      });
      setAuditEntries((prev) => [failedEntry, uploadEntry, ...prev]);
    }
  };

  const handleResetImport = () => {
    setActiveStep("import");
    setImportError(null);
    setImportReport(null);
    setDataset(null);
    setRawTables([]);
    setActiveRawTable(null);
    setImportFileName(null);
    setImportFileType(null);
    setAvailableSheets([]);
    setSelectedSheet(null);
    setMappingSelection({
      firstRowIsHeader: true,
      timeColumnIndex: null,
      valueColumnIndices: [],
      experimentColumnIndex: null
    });
    setMappingErrors([]);
    setMappingStats(null);
    setMappingSuccess(null);
    setMappingSuccessShown(false);
    setLastAppliedSelection(null);
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    const table = rawTables.find((item) => item.sheetName === sheetName);
    if (!table || !importFileName) {
      return;
    }
    setActiveRawTable(table);
    setDataset((current) => {
      if (!current) {
        return createDatasetShell(importFileName);
      }
      return { ...current, experiments: [] };
    });
  };

  const handleApplyMapping = () => {
    if (!activeRawTable || !importFileName) {
      return;
    }
    const result = applyMappingToDataset({
      table: activeRawTable,
      selection: mappingSelection,
      fileName: importFileName,
      datasetId: dataset?.id,
      createdAt: dataset?.createdAt
    });

    setMappingErrors(result.errors);
    setMappingStats(result.dataset ? result.stats : null);
    setMappingSuccess(null);
    setMappingSuccessShown(false);

    if (!result.dataset || !result.resolvedColumns) {
      return;
    }

    const report = generateImportValidationReport(result.dataset);
    const mappingEntry = createAuditEntry("MAPPING_APPLIED", {
      timeColumn: result.resolvedColumns.time,
      valueColumns: result.resolvedColumns.values,
      experimentColumn: result.resolvedColumns.experiment,
      experimentCount: result.stats.experimentCount,
      seriesCount: result.stats.seriesCount,
      pointCount: result.stats.pointCount
    });
    const reportEntry = createAuditEntry("IMPORT_REPORT_GENERATED", {
      status: report.status,
      summary: `${report.status} · ${report.counts.experiments} experiments, ${report.counts.series} series, ${report.counts.points} points, ${report.counts.droppedPoints} dropped.`
    });

    const nextAuditEntries = [reportEntry, mappingEntry, ...auditEntries];
    setImportReport(report);
    setAuditEntries(nextAuditEntries);
    setDataset({ ...result.dataset, audit: nextAuditEntries });
    setMappingSuccess(result.stats);
    setLastAppliedSelection(mappingSelection);
  };

  const handleBackToMapping = () => {
    setActiveStep("import");
    window.setTimeout(() => {
      mappingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      mappingPanelRef.current?.focus();
    }, 0);
  };

  const handleContinueFromValidation = () => {
    if (!importReport || importReport.status === "broken") {
      return;
    }
    setActiveStep("grouping");
  };

  const handleContinueToValidation = () => {
    setActiveStep("validation");
  };

  const isStepEnabled = (stepKey: StepKey): boolean => {
    if (stepKey === "import") return true;
    if (stepKey === "validation") return Boolean(mappingSuccess);
    if (stepKey === "grouping") return Boolean(importedExperiments.length);
    return Boolean(importedExperiments.length);
  };

  const renderImportStep = () => (
    <div className="stack" aria-labelledby="import-heading">
      <div className="section-intro">
        <p className="eyebrow">Schritt 1 · Import & Mapping</p>
        <h2 id="import-heading">Rohdaten laden und Spalten zuweisen</h2>
        <p className="muted">
          Ziehe eine CSV- oder Excel-Datei hierher oder wähle sie aus. Danach ordnest du Zeit, Werte
          und Metadaten in einem Schritt zu.
        </p>
      </div>

      {!activeRawTable && (
        <div
          className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) {
              void handleFileUpload(file);
            }
          }}
        >
          <div className="upload-icon" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3>Datei ablegen oder auswählen</h3>
          <p className="muted">
            CSV oder Excel (.xlsx), max. 50MB. Verarbeitung erfolgt lokal auf deinem Gerät.
          </p>
          <div className="upload-actions">
            <label className="btn btn-primary file-picker">
              Datei wählen
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleFileUpload(file);
                  }
                  event.target.value = "";
                }}
              />
            </label>
            <span className="upload-warning">Achtung, keine vertraulichen Daten hochladen!</span>
          </div>
          {importError && (
            <div className="inline-error" role="alert">
              <p className="error-title">Datei konnte nicht gelesen werden.</p>
              <p className="muted">{importError}</p>
            </div>
          )}
        </div>
      )}

      {activeRawTable && (
        <div className="card mapping-shell">
          <div className="card-header">
            <div>
              <p className="eyebrow">Datei geladen</p>
              <h3>{importFileName}</h3>
              <p className="muted">Schnellcheck: Typ {importFileType ?? "unbekannt"}</p>
            </div>
            <div className="file-meta">
              <div className="pill">{activeRawTable.rows.length} Zeilen</div>
              <div className="pill">{activeRawTable.headers.length} Spalten</div>
              {availableSheets.length > 1 && (
                <label className="sheet-select">
                  Blatt wählen
                  <select
                    value={selectedSheet ?? ""}
                    onChange={(event) => handleSheetChange(event.target.value)}
                  >
                    {availableSheets.map((sheet) => (
                      <option key={sheet} value={sheet}>
                        {sheet}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="btn btn-ghost danger" onClick={handleResetImport}>
                Entfernen
              </button>
            </div>
          </div>

          <div className="card-body">
            <div className="headers-preview">
              <p className="muted">Gefundene Spalten</p>
              <div className="chip-row">
                {activeRawTable.headers.slice(0, 8).map((header, index) => (
                  <span key={`${header}-${index}`} className="chip">
                    {header}
                  </span>
                ))}
                {activeRawTable.headers.length > 8 && (
                  <span className="chip">+{activeRawTable.headers.length - 8}</span>
                )}
              </div>
            </div>

            <div ref={mappingPanelRef} tabIndex={-1} className="mapping-anchor">
              <MappingPanel
                table={activeRawTable}
                fileName={importFileName}
                selection={mappingSelection}
                onSelectionChange={handleMappingSelectionChange}
                onApply={handleApplyMapping}
                errors={mappingErrors}
                stats={mappingStats}
                successStats={mappingSuccess}
                onContinueToValidation={handleContinueToValidation}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderStepContent = () => {
    if (activeStep === "import") {
      return renderImportStep();
    }

    if (activeStep === "validation") {
      return (
        <ValidationScreen
          dataset={dataset}
          report={importReport}
          onBackToMapping={handleBackToMapping}
          onContinue={handleContinueFromValidation}
          disableContinue={Boolean(importReport?.status === "broken")}
        />
      );
    }

    if (activeStep === "grouping") {
      return (
        <GroupingScreen
          experiments={importedExperiments}
          columnScanPayload={columnScanPayload}
        />
      );
    }

    return (
      <div className="placeholder-card">
        <h3>Schritt in Arbeit</h3>
        <p className="muted">
          Dieser Schritt wird im nächsten Iterationspaket auf das neue Design gebracht. Nutze
          vorerst die validierten Daten als Basis.
        </p>
      </div>
    );
  };

  const activeStepIndex = steps.findIndex((step) => step.key === activeStep);
  const progress = (activeStepIndex / (steps.length - 1)) * 100;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2v7.31l-6.29 10.83a2 2 0 0 0 1.73 2.86h13.12a2 2 0 0 0 1.73-2.86L14 9.31V2" />
                <path d="M8.5 2h7" />
                <path d="M10 16h4" />
              </svg>
            </div>
            <div className="brand-text">
              <p className="eyebrow">Kinetik Researcher</p>
              <h1>Projekt „Researcher Draft“</h1>
            </div>
          </div>
          <div className="user-pill" aria-label="Nutzer:in">
            JD
          </div>
        </div>
      </header>

      <div className="stepper-shell">
        <div className="stepper-track">
          <div className="stepper-progress" style={{ width: `${progress}%` }} />
          <div className="stepper-grid">
            {steps.map((step, index) => {
              const isActive = activeStep === step.key;
              const isDone = activeStepIndex > index;
              const disabled = !isStepEnabled(step.key);
              return (
                <button
                  key={step.key}
                  className={`stepper-item ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    setActiveStep(step.key);
                  }}
                  disabled={disabled && !isActive}
                >
                  <span className="step-circle">{index + 1}</span>
                  <span className="step-label">{step.label}</span>
                  <span className="step-description">{step.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="main-container">
        <section className="workspace-panel">{renderStepContent()}</section>
      </main>
    </div>
  );
}

export default App;
