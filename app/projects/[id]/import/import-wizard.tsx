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
  inferUnitId,
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
import { RULES_VERSION } from "@/src/rules/types";

interface WorkbookState {
  filename: string;
  sheets: InspectedSheet[];
}

interface SheetPlan {
  headerRow: number;
  mapping: ColumnMapping;
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
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [selection, setSelection] = useState("__all__");
  const [activeSheetName, setActiveSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [sheetPlans, setSheetPlans] = useState<Record<string, SheetPlan>>({});
  const [confirmedSheetNames, setConfirmedSheetNames] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const compatibleSheets = useMemo(
    () => workbook?.sheets.filter((sheet) => sheet.compatible) ?? [],
    [workbook],
  );
  const selectedSheets = useMemo(() => {
    if (!workbook) return [];
    return selection === "__all__"
      ? compatibleSheets
      : workbook.sheets.filter(
          (sheet) => sheet.name === selection && sheet.compatible,
        );
  }, [compatibleSheets, selection, workbook]);
  const referenceSheet =
    selectedSheets.find((sheet) => sheet.name === activeSheetName) ??
    selectedSheets[0] ??
    null;
  const activeSheetPosition = referenceSheet
    ? selectedSheets.findIndex((sheet) => sheet.name === referenceSheet.name) + 1
    : 0;
  const rawPreviewStart = referenceSheet
    ? Math.max(
        0,
        Math.min(
          Math.max(0, headerRow - 2),
          Math.max(0, referenceSheet.rows.length - 6),
        ),
      )
    : 0;
  const headers = referenceSheet
    ? headersAt(referenceSheet.rows, headerRow)
    : [];
  const activeInferredUnitId = referenceSheet
    ? inferUnitId(referenceSheet.name, referenceSheet.rows, headerRow)
    : null;
  const mappedRows = useMemo(
    () =>
      selectedSheets.flatMap((sheet) => {
        const plan =
          sheetPlans[sheet.name] ??
          (sheet.name === referenceSheet?.name
            ? { headerRow, mapping }
            : {
                headerRow: sheet.suggestedHeaderRow,
                mapping: sheet.suggestedMapping,
              });
        return mapRows(
          sheet.rows,
          plan.headerRow,
          plan.mapping,
          {
            defaultUnitId: inferUnitId(
              sheet.name,
              sheet.rows,
              plan.headerRow,
            ),
            sourceSheet: sheet.name,
          },
        );
      }),
    [
      headerRow,
      mapping,
      referenceSheet?.name,
      selectedSheets,
      sheetPlans,
    ],
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
      setSourceFile(file);
      const firstCompatible =
        payload.sheets.find((sheet) => sheet.compatible) ?? payload.sheets[0];
      const hasCompatibleSheets = payload.sheets.some(
        (sheet) => sheet.compatible,
      );
      setSelection("__all__");
      const detected = firstCompatible?.suggestedHeaderRow ?? 0;
      setActiveSheetName(firstCompatible?.name ?? "");
      setHeaderRow(detected);
      setSheetPlans({});
      setConfirmedSheetNames([]);
      if (!hasCompatibleSheets) {
        setError(
          "No compatible airside outlet/CFM worksheet was found in this workbook.",
        );
      }
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

  function startSheetReview() {
    const first = selectedSheets[0];
    if (!first) return;
    setActiveSheetName(first.name);
    setHeaderRow(first.suggestedHeaderRow);
    setMapping({});
    setSheetPlans({});
    setConfirmedSheetNames([]);
    setError("");
    setStep(3);
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
    const missing = REQUIRED_FIELDS.filter((field) => {
      if (field === "unit_id") {
        return !mapping.unit_id && !activeInferredUnitId;
      }
      return !mapping[field];
    });
    if (missing.length > 0) {
      setError(
        `Map the required fields: ${missing.map((field) => FIELD_LABELS[field]).join(", ")}.`,
      );
      return;
    }
    if (!referenceSheet) return;
    const mappedHeaders = Object.values(mapping).filter(
      (header): header is string => Boolean(header),
    );
    if (new Set(mappedHeaders).size !== mappedHeaders.length) {
      setError(
        "Map each workbook column to no more than one TABReady field.",
      );
      return;
    }
    const currentRows = mapRows(
      referenceSheet.rows,
      headerRow,
      mapping,
      {
        defaultUnitId: activeInferredUnitId,
        sourceSheet: referenceSheet.name,
      },
    );
    if (currentRows.length === 0) {
      setError(
        `No outlet data rows were found for '${referenceSheet.name}' with this header and mapping.`,
      );
      return;
    }
    const nextPlans = {
      ...sheetPlans,
      [referenceSheet.name]: { headerRow, mapping },
    };
    const nextConfirmed = [
      ...new Set([...confirmedSheetNames, referenceSheet.name]),
    ];
    setSheetPlans(nextPlans);
    setConfirmedSheetNames(nextConfirmed);
    const nextSheet = selectedSheets.find(
      (sheet) => !nextConfirmed.includes(sheet.name),
    );
    setError("");
    if (nextSheet) {
      setActiveSheetName(nextSheet.name);
      setHeaderRow(nextSheet.suggestedHeaderRow);
      setMapping({});
      setStep(3);
    } else {
      setStep(5);
    }
  }

  async function commit() {
    if (!workbook || !sourceFile) return;
    const missingPlan = selectedSheets.find(
      (sheet) => !sheetPlans[sheet.name],
    );
    if (missingPlan) {
      setError(
        `Confirm the header and mapping for '${missingPlan.name}' before committing.`,
      );
      return;
    }
    if (mappedRows.length === 0) {
      setError("No outlet data rows were found with this mapping.");
      return;
    }
    setLoading(true);
    setError("");
    setStep(6);
    try {
      const formData = new FormData();
      formData.append("file", sourceFile);
      formData.append(
        "config",
        JSON.stringify({
          sheets: selectedSheets.map((sheet) => ({
            name: sheet.name,
            ...sheetPlans[sheet.name],
          })),
        }),
      );
      const response = await fetch(`/api/projects/${projectId}/import/commit`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        outletCount?: number;
      };
      if (!response.ok) throw new Error(payload.error);
      router.push(
        `/projects/${projectId}?tab=exceptions&notice=${encodeURIComponent(
          `${payload.outletCount ?? mappedRows.length} outlet rows replaced the current working dataset; readiness checks completed.`,
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
              TABReady reads the source workbook, preserves every original cell,
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
              <b>Source format</b>
              <span>
                Upload the original <code>.xlsx</code>. Flattened PDF reports are
                intentionally rejected because their cells and merged headings
                cannot be validated reliably.
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
              <label
                className={selection === "__all__" ? "selected" : ""}
                aria-disabled={compatibleSheets.length === 0}
              >
                <input
                  type="radio"
                  name="sheet"
                  value="__all__"
                  checked={selection === "__all__"}
                  disabled={compatibleSheets.length === 0}
                  onChange={() => setSelection("__all__")}
                />
                <span className="sheet-icon">
                  <FileSpreadsheet size={19} />
                </span>
                <span>
                  <b>All compatible airside outlet sheets</b>
                  <small>
                    {compatibleSheets.length} included ·{" "}
                    {workbook.sheets.length - compatibleSheets.length} skipped ·{" "}
                    {compatibleSheets.reduce(
                      (count, sheet) => count + sheet.dataRowCount,
                      0,
                    )}{" "}
                    detected rows
                  </small>
                </span>
              </label>
              {workbook.sheets.map((sheet) => (
                <label
                  className={selection === sheet.name ? "selected" : ""}
                  aria-disabled={!sheet.compatible}
                  key={sheet.name}
                >
                  <input
                    type="radio"
                    name="sheet"
                    value={sheet.name}
                    checked={selection === sheet.name}
                    disabled={!sheet.compatible}
                    onChange={() => setSelection(sheet.name)}
                  />
                  <span className="sheet-icon">
                    <FileSpreadsheet size={19} />
                  </span>
                  <span>
                    <b>{sheet.name}</b>
                    <small>
                      {sheet.compatible
                        ? `${sheet.dataRowCount} outlet rows · included in compatible import`
                        : `${sheet.incompatibilityReasons.join("; ")} · skipped from compatible import`}
                    </small>
                  </span>
                  <span
                    className={`sheet-status ${
                      sheet.compatible ? "included" : "skipped"
                    }`}
                  >
                    {sheet.compatible ? "Airside" : "Skipped"}
                  </span>
                </label>
              ))}
            </div>
            {workbook.sheets.some((sheet) => !sheet.compatible) && (
              <div className="scope-note">
                TABReady excludes drawings, covers, hydronic tables, fan
                summaries, certificates, and other sheets that do not contain
                the required outlet/CFM columns. Skipped sheets cannot be
                committed to the airside outlet dataset.
              </div>
            )}
            <div className="wizard-footer">
              <button className="button button-secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Back
              </button>
              <button
                className="button button-primary"
                disabled={!referenceSheet}
                onClick={startSheetReview}
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
              Worksheet {activeSheetPosition} of {selectedSheets.length}:{" "}
              <b>{referenceSheet.name}</b>. We detected row{" "}
              {referenceSheet.suggestedHeaderRow + 1}. Override it if the
              column labels appear elsewhere. Every included worksheet is
              confirmed separately.
            </p>
            <label className="header-control">
              Header row
              <input
                type="number"
                min="1"
                max={referenceSheet.rows.length}
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
                  {referenceSheet.rows
                    .slice(rawPreviewStart, rawPreviewStart + 6)
                    .map((row, previewIndex) => {
                      const rowIndex = rawPreviewStart + previewIndex;
                      return (
                        <tr
                          className={
                            rowIndex === headerRow ? "header-selected" : ""
                          }
                          key={rowIndex}
                        >
                          <th>Row {rowIndex + 1}</th>
                          {row.slice(0, 8).map((cell, cellIndex) => (
                            <td key={cellIndex}>{String(cell ?? "")}</td>
                          ))}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="wizard-footer">
              <button
                className="button button-secondary"
                onClick={() => {
                  setSheetPlans({});
                  setConfirmedSheetNames([]);
                  setStep(2);
                }}
              >
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
              optional fields may remain unused. Evidence checks only run for
              evidence columns that are actually mapped.
            </p>
            <div className="mapping-memory">
              Reviewing <b>{referenceSheet?.name}</b> — worksheet{" "}
              {activeSheetPosition} of {selectedSheets.length}. TABReady will
              not preview or commit until every included worksheet is
              confirmed.
            </div>
            {activeInferredUnitId && !mapping.unit_id && (
              <div className="mapping-memory">
                Air system <b>{activeInferredUnitId}</b> was derived
                from the worksheet name/title, so a separate unit column is not
                required.
              </div>
            )}
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
                    {field === "unit_id" &&
                    activeInferredUnitId &&
                    !mapping.unit_id ? (
                      <b>Derived</b>
                    ) : REQUIRED_FIELDS.includes(field) ? (
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
                {selectedSheets.some(
                  (sheet) =>
                    sheet.name !== referenceSheet?.name &&
                    !confirmedSheetNames.includes(sheet.name),
                )
                  ? "Confirm & review next worksheet"
                  : "Preview mapped rows"}{" "}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <p className="eyebrow">Step 5 of 6</p>
            <h2>Review mapped data</h2>
            <p className="wizard-copy">
              Showing the first 20 of {mappedRows.length} outlet rows. Red cells
              need attention; amber cells are blank evidence in columns you
              chose to map.
            </p>
            <div className="preview-legend">
              <span className="valid">Ready</span>
              <span className="warning">Mapped evidence is blank</span>
              <span className="error">Invalid or missing required value</span>
            </div>
            <div className="scope-note preview-note">
              Standard report markers such as NOTE, NA, NG, NTS, and dashes are
              preserved as documented non-readings instead of being mislabeled
              as numeric errors. Importing replaces {projectName}&apos;s current
              working outlet dataset; matching reviewed findings and saved
              report versions remain unchanged.
            </div>
            <div className="table-scroll preview-table-wrap">
              <table className="data-table dense preview-table">
                <thead>
                  <tr>
                    <th>Worksheet</th>
                    <th>Row</th>
                    {CANONICAL_FIELDS.map((field) => (
                      <th key={field}>{FIELD_LABELS[field]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedRows.slice(0, 20).map((row, index) => (
                    <tr
                      key={`${row.__sourceSheet}-${row.__rowNumber}-${index}`}
                    >
                      <td className="strong">{row.__sourceSheet || "—"}</td>
                      <td className="tabular">{row.__rowNumber}</td>
                      {CANONICAL_FIELDS.map((field) => (
                        <td
                          className={`cell-${validatePreviewCell(
                            field as CanonicalField,
                            row[field],
                            row.__mappedFields,
                            row.remarks,
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
              <button
                className="button button-primary"
                disabled={mappedRows.length === 0}
                onClick={() => void commit()}
              >
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
              deterministic rules v{RULES_VERSION}.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
