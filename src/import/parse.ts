import * as XLSX from "xlsx";
import {
  CanonicalField,
  CANONICAL_FIELDS,
  ColumnMapping,
  suggestMapping,
} from "./suggest";

export type CellValue = string | number | boolean | null;

export interface InspectedSheet {
  name: string;
  rows: CellValue[][];
  suggestedHeaderRow: number;
}

export interface InspectedWorkbook {
  sheets: InspectedSheet[];
}

export interface MappedRow {
  __rowNumber: number;
  __raw: Record<string, CellValue>;
  unit_id: string;
  outlet_id: string;
  area_served: string;
  outlet_type: string;
  size: string;
  design_cfm: string;
  final_cfm: string;
  instrument_name: string;
  technician: string;
  test_date: string;
  remarks: string;
}

function cellValue(value: unknown): CellValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return value === null || value === undefined ? null : String(value);
}

export function detectHeaderRow(rows: CellValue[][]): number {
  let bestRow = 0;
  let bestScore = -1;
  rows.slice(0, 15).forEach((row, index) => {
    const headers = row.map((cell) => String(cell ?? ""));
    const suggestedCount = Object.keys(suggestMapping(headers)).length;
    const nonEmptyCount = headers.filter((header) => header.trim() !== "").length;
    const score = suggestedCount * 10 + nonEmptyCount;
    if (score > bestScore) {
      bestScore = score;
      bestRow = index;
    }
  });
  return bestRow;
}

export function inspectWorkbook(buffer: ArrayBuffer): InspectedWorkbook {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: false,
    raw: false,
  });
  return {
    sheets: workbook.SheetNames.map((name) => {
      const worksheet = workbook.Sheets[name];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      });
      const rows = rawRows.map((row) => row.map(cellValue));
      return {
        name,
        rows,
        suggestedHeaderRow: detectHeaderRow(rows),
      };
    }),
  };
}

export function headersAt(
  rows: CellValue[][],
  headerRowIndex: number,
): string[] {
  return (rows[headerRowIndex] ?? [])
    .map((cell) => String(cell ?? "").trim())
    .filter((header) => header !== "");
}

export function mapRows(
  rows: CellValue[][],
  headerRowIndex: number,
  mapping: ColumnMapping,
): MappedRow[] {
  const headerCells = rows[headerRowIndex] ?? [];
  const headers = headerCells.map((cell) => String(cell ?? "").trim());
  const indexes = new Map(headers.map((header, index) => [header, index]));
  return rows
    .slice(headerRowIndex + 1)
    .map((row, offset) => {
      const raw = Object.fromEntries(
        headers
          .filter((header) => header !== "")
          .map((header, index) => [header, row[index] ?? null]),
      );
      const values = Object.fromEntries(
        CANONICAL_FIELDS.map((field) => {
          const header = mapping[field];
          const index = header ? indexes.get(header) : undefined;
          const value = index === undefined ? "" : row[index];
          return [field, String(value ?? "").trim()];
        }),
      ) as Record<CanonicalField, string>;
      return {
        __rowNumber: headerRowIndex + offset + 2,
        __raw: raw,
        ...values,
      };
    })
    .filter((row) =>
      CANONICAL_FIELDS.some((field) => row[field].trim() !== ""),
    );
}

export function validatePreviewCell(
  field: CanonicalField,
  value: string,
): "valid" | "warning" | "error" {
  if (
    ["unit_id", "outlet_id", "design_cfm", "final_cfm"].includes(field) &&
    value === ""
  ) {
    return "error";
  }
  if (field === "design_cfm" || field === "final_cfm") {
    const parsed = Number(value);
    if (value !== "" && (!Number.isFinite(parsed) || parsed <= 0)) return "error";
  }
  if (
    ["instrument_name", "technician", "test_date"].includes(field) &&
    value === ""
  ) {
    return "warning";
  }
  return "valid";
}
