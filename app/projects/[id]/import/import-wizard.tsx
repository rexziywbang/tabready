"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
} from "lucide-react";
import {
  headersAt,
  InspectedSheet,
  mapRows,
  validatePreviewCell,
} from "@/src/import/parse";
import {
  CanonicalField,
  CANONICAL_FIELDS,
  ColumnMapping,
  FIELD_LABELS,
  REQUIRED_FIELDS,
  suggestMapping,
} from "@/src/import/suggest";

interface WorkbookState {
  filename: string;
  sheets: InspectedSheet[];
}

const stepLabels = [
  "Upload",
  "Worksheet",
  "Header row",
  "Column mapping",
  "Preview",
  "Run checks",
];

export function ImportWizard({
  projectId,
  projectName,
  previousMapping,
}: {
  projectId: string;
  projectName: string;
  previousMapping: ColumnMapping | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [workbook, setWorkbook] = useState<WorkbookState | null>(null);
  const [selection, setSelection] = useState("__all__");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedSheets = useMemo(() => {
    if (!workbook) return [];
    return selection === "__all__"
      ? workbook.sheets
      : workbook.sheets.filter((sheet) => sheet.name === selection);
  }, [selection, workbook]);
  const referenceSheet = selectedSheets[0] ?? null;
  const headers = referenceSheet
    ? headersAt(referenceSheet.rows, headerRow)
    : [];
  const mappedRows = useMemo(
    () =>
      selectedSheets.flatMap((sheet) =>
        mapRows(sheet.rows, headerRow, mapping),
      ),
    [headerRow, mapping, selectedSheets],
  );

  async function inspectFile(file: File) {
    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/import/inspect", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as WorkbookState & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error);
      setWorkbook(payload);
      const detected = payload.sheets[0]?.suggestedHeaderRow ?? 0;
      setHeaderRow(detected);
      setStep(2);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The workbook could not be inspected.",
      );
    } finally {
      setLoading(false);
    }
  }

  function continueFromHeader() {
    const suggestions = suggestMapping(headers);
    const reusable = Object.fromEntries(
      Object.entries(previousMapping ?? {}).filter(([, header]) =>
        headers.includes(header ?? ""),
      ),
    ) as ColumnMapping;
    setMapping({ ...suggestions, ...reusable });
    setError("");
    setStep(4);
  }

  function continueFromMapping() {
    const missing = REQUIRED_FIELDS.filter((field) => !mapping[field]);
    if (missing.length > 0) {
      setError(
        `Map the required fields: ${missing.map((field) => FIELD_LABELS[field]).join(", ")}.`,
      );
      return;
    }
    setError("");
    setStep(5);
  }

  async function commit() {
    if (!workbook) return;
    setLoading(true);
    setError("");
    setStep(6);
    try {
      const response = await fetch(`/api/projects/${projectId}/import/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: workbook.filename,
          sheetName:
            selection === "__all__"
              ? selectedSheets.map((sheet) => sheet.name).join(", ")
              : selection,
          mapping,
          rows: mappedRows,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        outletCount?: number;
      };
      if (!response.ok) throw new Error(payload.error);
      router.push(
        `/projects/${projectId}?tab=exceptions&notice=${encodeURIComponent(
          `${payload.outletCount ?? mappedRows.length} rows imported and readiness checks completed.`,
        )}`,
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The import could not be committed.",
      );
      setStep(5);
      setLoading(false);
    }
  }

  return (
    <div className="wizard-shell">
      <ol className="wizard-progress" aria-label="Import progress">
        {stepLabels.map((label, index) => {
          const number = index + 1;
          const complete = number < step;
          return (
            <li
              className={
                number === step ? "active" : complete ? "complete" : ""
              }
              key={label}
            >
              <span>{complete ? <Check size={14} /> : number}</span>
              <small>{label}</small>
            </li>
          );
        })}
      </ol>

      <section className="wizard-card">
        {error && <div className="notice notice-error">{error}</div>}

        {step === 1 && (
          <div className="upload-step">
            <div className="wizard-icon">
              <UploadCloud size={28} />
            </div>
            <p className="eyebrow">Step 1 of 6</p>
            <h2>Choose an Excel workbook</h2>
            <p>
              TABReady reads the workbook locally, preserves every original cell,
              and never changes measured values.
            </p>
            <label className={`file-drop ${loading ? "loading" : ""}`}>
              {loading ? <Loader2 className="spin" /> : <FileSpreadsheet />}
              <span>
                <b>{loading ? "Inspecting workbook…" : "Select .xlsx file"}</b>
                <small>Up to 10 MB</small>
              </span>
              <input
                type="file"
                accept=".xlsx"
                disabled={loading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void inspectFile(file);
                }}
              />
            </label>
            <div className="fixture-tip">
              <b>Demo path</b>
              <span>
                Use <code>fixtures/riverside_medical.xlsx</code>. It contains
                clearly labeled fictional, synthetic readings.
              </span>
            </div>
          </div>
        )}

        {step === 2 && workbook && (
          <div>
            <p className="eyebrow">Step 2 of 6</p>
            <h2>Choose worksheet scope</h2>
            <p className="wizard-copy">
              Import all compatible outlet sheets together or review one worksheet
              at a time.
            </p>
            <div className="sheet-list">
              <label className={selection === "__all__" ? "selected" : ""}>
                <input
                  type="radio"
                  name="sheet"
                  value="__all__"
                  checked={selection === "__all__"}
                  onChange={() => setSelection("__all__")}
                />
                <span className="sheet-icon">
                  <FileSpreadsheet size={19} />
                </span>
                <span>
                  <b>All outlet sheets</b>
                  <small>
                    {workbook.sheets.length} worksheets · recommended for the
                    complete demo
                  </small>
                </span>
              </label>
              {workbook.sheets.map((sheet) => (
                <label
                  className={selection === sheet.name ? "selected" : ""}
                  key={sheet.name}
                >
                  <input
                    type="radio"
                    name="sheet"
                    value={sheet.name}
                    checked={selection === sheet.name}
                    onChange={() => {
                      setSelection(sheet.name);
                      setHeaderRow(sheet.suggestedHeaderRow);
                    }}
                  />
                  <span className="sheet-icon">
                    <FileSpreadsheet size={19} />
                  </span>
                  <span>
                    <b>{sheet.name}</b>
                    <small>{Math.max(0, sheet.rows.length - 2)} data rows</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="wizard-footer">
              <button className="button button-secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Back
              </button>
              <button
                className="button button-primary"
                onClick={() => {
                  setHeaderRow(selectedSheets[0]?.suggestedHeaderRow ?? 0);
                  setStep(3);
                }}
              >
                Continue <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && referenceSheet && (
          <div>
            <p className="eyebrow">Step 3 of 6</p>
            <h2>Confirm the header row</h2>
            <p className="wizard-copy">
              We detected row {referenceSheet.suggestedHeaderRow + 1}. Override it
              if the column labels appear elsewhere.
            </p>
            <label className="header-control">
              Header row
              <input
                type="number"
                min="1"
                max={Math.min(15, referenceSheet.rows.length)}
                value={headerRow + 1}
                onChange={(event) =>
                  setHeaderRow(Math.max(0, Number(event.target.value) - 1))
                }
              />
              <span
                className={
                  headerRow === referenceSheet.suggestedHeaderRow
                    ? "detected"
                    : ""
                }
              >
                {headerRow === referenceSheet.suggestedHeaderRow
                  ? "Auto-detected"
                  : "Manual override"}
              </span>
            </label>
            <div className="raw-preview table-scroll">
              <table>
                <tbody>
                  {referenceSheet.rows.slice(0, 6).map((row, rowIndex) => (
                    <tr
                      className={rowIndex === headerRow ? "header-selected" : ""}
                      key={rowIndex}
                    >
                      <th>Row {rowIndex + 1}</th>
                      {row.slice(0, 8).map((cell, cellIndex) => (
                        <td key={cellIndex}>{String(cell ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="wizard-footer">
              <button className="button button-secondary" onClick={() => setStep(2)}>
                <ArrowLeft size={15} /> Back
              </button>
              <button className="button button-primary" onClick={continueFromHeader}>
                Use row {headerRow + 1} <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <p className="eyebrow">Step 4 of 6</p>
            <h2>Map workbook columns</h2>
            <p className="wizard-copy">
              Suggested matches are pre-filled. Required fields must be mapped;
              optional fields may remain unused.
            </p>
            {previousMapping && (
              <div className="mapping-memory">
                Previous confirmed mapping applied where the headers match.
              </div>
            )}
            <div className="mapping-grid">
              {CANONICAL_FIELDS.map((field) => (
                <label key={field}>
                  <span>
                    {FIELD_LABELS[field]}
                    {REQUIRED_FIELDS.includes(field) ? (
                      <b>Required</b>
                    ) : (
                      <small>Optional</small>
                    )}
                  </span>
                  <select
                    value={mapping[field] ?? ""}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field]: event.target.value || undefined,
                      }))
                    }
                  >
                    <option value="">Not mapped</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="wizard-footer">
              <button className="button button-secondary" onClick={() => setStep(3)}>
                <ArrowLeft size={15} /> Back
              </button>
              <button className="button button-primary" onClick={continueFromMapping}>
                Preview mapped rows <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <p className="eyebrow">Step 5 of 6</p>
            <h2>Review mapped data</h2>
            <p className="wizard-copy">
              Showing the first 20 of {mappedRows.length} rows. Red cells need
              attention; amber cells will become readiness flags after import.
            </p>
            <div className="preview-legend">
              <span className="valid">Ready</span>
              <span className="warning">Will be flagged</span>
              <span className="error">Invalid or missing required value</span>
            </div>
            <div className="table-scroll preview-table-wrap">
              <table className="data-table dense preview-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    {CANONICAL_FIELDS.map((field) => (
                      <th key={field}>{FIELD_LABELS[field]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 20).map((row, index) => (
                    <tr key={`${row.__rowNumber}-${index}`}>
                      <td className="tabular">{row.__rowNumber}</td>
                      {CANONICAL_FIELDS.map((field) => (
                        <td
                          className={`cell-${validatePreviewCell(
                            field as CanonicalField,
                            row[field],
                          )}`}
                          key={field}
                        >
                          {row[field] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="wizard-footer">
              <button className="button button-secondary" onClick={() => setStep(4)}>
                <ArrowLeft size={15} /> Back
              </button>
              <button className="button button-primary" onClick={() => void commit()}>
                Commit {mappedRows.length} rows & run checks
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="running-step">
            <Loader2 className="spin" size={34} />
            <p className="eyebrow">Step 6 of 6</p>
            <h2>Running readiness checks</h2>
            <p>
              Preserving original cells, grouping air systems, and evaluating
              deterministic rules v0.1.0.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
