import * as XLSX from "xlsx";
import {
  isExplicitNonReading,
  numericValue,
  remarksAllowZero,
} from "@/src/rules/types";
import {
  CanonicalField,
  CANONICAL_FIELDS,
  ColumnMapping,
  REQUIRED_FIELDS,
  suggestMapping,
  normalizeHeader,
} from "./suggest";

export type CellValue = string | number | boolean | null;

export interface InspectedSheet {
  name: string;
  rows: CellValue[][];
  suggestedHeaderRow: number;
  suggestedMapping: ColumnMapping;
  inferredUnitId: string | null;
  compatible: boolean;
  incompatibilityReasons: string[];
  dataRowCount: number;
}

export interface InspectedWorkbook {
  sheets: InspectedSheet[];
}

export interface MappedRow {
  __rowNumber: number;
  __sourceSheet: string;
  __mappedFields: CanonicalField[];
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

export interface MapRowsOptions {
  defaultUnitId?: string | null;
  sourceSheet?: string;
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

function textCell(value: CellValue | undefined): string {
  return String(value ?? "").trim();
}

function headerLabelsAt(
  rows: CellValue[][],
  headerRowIndex: number,
): string[] {
  const current = rows[headerRowIndex] ?? [];
  const parent = rows[headerRowIndex - 1] ?? [];
  const parentNonEmpty = parent.filter((cell) => textCell(cell) !== "").length;
  const currentNonEmpty = current.filter((cell) => textCell(cell) !== "").length;
  const parentNumeric = parent.filter(
    (cell) =>
      typeof cell === "number" ||
      (textCell(cell) !== "" && numericValue(textCell(cell)) !== null),
  ).length;
  const currentNumeric = current.filter(
    (cell) =>
      typeof cell === "number" ||
      (textCell(cell) !== "" && numericValue(textCell(cell)) !== null),
  ).length;
  const parentText = parent.map(textCell).join(" ").toLocaleLowerCase();
  const currentText = current.map(textCell).join(" ").toLocaleLowerCase();
  const currentHeaderTerms =
    currentText.match(
      /\b(number|no|id|type|size|dimensions?|design|dsn|preliminary|final|actual|area|factor|cfm|air\s*flow|location|room|instrument|technician|date|remarks?|comments?)\b/g,
    )?.length ?? 0;
  const useParentGroups =
    parentNonEmpty >= 2 &&
    currentNonEmpty >= 2 &&
    parentNumeric === 0 &&
    currentNumeric === 0 &&
    currentHeaderTerms >= 2 &&
    /\b(outlet|duct|cfm|air\s*flow|area|factor|design|final|actual|size|room|location|terminal)\b/.test(
      parentText,
    );
  const width = Math.max(current.length, useParentGroups ? parent.length : 0);
  const labels: string[] = [];
  let activeParent = "";

  for (let index = 0; index < width; index += 1) {
    const exactParent = useParentGroups ? textCell(parent[index]) : "";
    if (exactParent) activeParent = exactParent;
    const child = textCell(current[index]);
    let label = child;
    if (child && activeParent) {
      const childNormalized = normalizeHeader(child);
      const parentNormalized = normalizeHeader(activeParent);
      if (
        childNormalized !== parentNormalized &&
        !childNormalized.startsWith(`${parentNormalized} `)
      ) {
        label = `${activeParent} ${child}`;
      }
    } else if (!child && exactParent) {
      label = exactParent;
    }
    labels.push(label);
  }

  const occurrences = new Map<string, number>();
  return labels.map((label) => {
    if (!label) return "";
    const count = (occurrences.get(label) ?? 0) + 1;
    occurrences.set(label, count);
    return count === 1 ? label : `${label} (${count})`;
  });
}

export function headersAt(
  rows: CellValue[][],
  headerRowIndex: number,
): string[] {
  return headerLabelsAt(rows, headerRowIndex).filter(Boolean);
}

function headerContext(rows: CellValue[][], headerRowIndex: number): string {
  const nearby = rows.slice(Math.max(0, headerRowIndex - 2), headerRowIndex + 1);
  return [...nearby.flat().map(textCell), ...headersAt(rows, headerRowIndex)]
    .join(" ")
    .toLocaleLowerCase();
}

function hasAirsideOutletContext(
  rows: CellValue[][],
  headerRowIndex: number,
): boolean {
  const context = headerContext(rows, headerRowIndex);
  return /\b(cfm|air\s*(?:flow|outlet)|diffuser|register|grille)\b/.test(
    context,
  );
}

export function detectHeaderRow(rows: CellValue[][]): number {
  let bestRow = 0;
  let bestScore = -1;
  rows.forEach((_row, index) => {
    const headers = headersAt(rows, index);
    const mapping = suggestMapping(headers);
    const requiredCount = REQUIRED_FIELDS.filter(
      (field) => Boolean(mapping[field]),
    ).length;
    const suggestedCount = Object.keys(mapping).length;
    const nonEmptyCount = headers.length;
    const hasOutletCore =
      Boolean(mapping.outlet_id) &&
      Boolean(mapping.design_cfm) &&
      Boolean(mapping.final_cfm);
    const numericHeaderCells = headers.filter(
      (header) => numericValue(header) !== null,
    ).length;
    const score =
      (hasOutletCore ? 1_000 : 0) +
      requiredCount * 50 +
      suggestedCount * 7 +
      Math.min(nonEmptyCount, 12) +
      (hasAirsideOutletContext(rows, index) ? 20 : 0) -
      numericHeaderCells * 30;
    if (score > bestScore) {
      bestScore = score;
      bestRow = index;
    }
  });
  return bestRow;
}

const UNIT_ID_PATTERN =
  /\b(AHU|RTU|MAU|VAV|FCU|ERV|DOAS|EF|SF|RF)[\s:#/_-]*([0-9][A-Z0-9]*(?:[.-][A-Z0-9]+)*)\b/i;

function extractUnitId(value: string): string | null {
  const match = value.match(UNIT_ID_PATTERN);
  return match ? `${match[1].toLocaleUpperCase()}-${match[2]}` : null;
}

export function inferUnitId(
  sheetName: string,
  rows: CellValue[][],
  headerRowIndex: number,
): string | null {
  const candidates = [
    sheetName,
    ...rows
      .slice(0, headerRowIndex + 1)
      .reverse()
      .flat()
      .map(textCell),
  ];
  for (const candidate of candidates) {
    const unitId = extractUnitId(candidate);
    if (unitId) return unitId;
  }
  return null;
}

export function analyzeSheet(
  name: string,
  rows: CellValue[][],
): InspectedSheet {
  const suggestedHeaderRow = detectHeaderRow(rows);
  const suggestedMapping = suggestMapping(
    headersAt(rows, suggestedHeaderRow),
  );
  const inferredUnitId = inferUnitId(name, rows, suggestedHeaderRow);
  const missingRequired = REQUIRED_FIELDS.filter((field) => {
    if (field === "unit_id") {
      return !suggestedMapping.unit_id && !inferredUnitId;
    }
    return !suggestedMapping[field];
  });
  const airsideContext = hasAirsideOutletContext(rows, suggestedHeaderRow);
  const incompatibilityReasons: string[] = [];
  if (!airsideContext) {
    incompatibilityReasons.push("No airside outlet/CFM table detected");
  }
  if (missingRequired.length > 0) {
    incompatibilityReasons.push(
      `Missing ${missingRequired
        .map((field) => field.replaceAll("_", " "))
        .join(", ")}`,
    );
  }
  const compatible =
    airsideContext && missingRequired.length === 0;
  const dataRowCount = compatible
    ? mapRows(rows, suggestedHeaderRow, suggestedMapping, {
        defaultUnitId: inferredUnitId,
        sourceSheet: name,
      }).length
    : 0;
  return {
    name,
    rows,
    suggestedHeaderRow,
    suggestedMapping,
    inferredUnitId,
    compatible: compatible && dataRowCount > 0,
    incompatibilityReasons:
      compatible && dataRowCount === 0
        ? ["No outlet data rows found below the header"]
        : incompatibilityReasons,
    dataRowCount,
  };
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
      return analyzeSheet(name, rows);
    }),
  };
}

function isRepeatedHeader(
  values: Record<CanonicalField, string>,
  mapping: ColumnMapping,
): boolean {
  const matches = CANONICAL_FIELDS.filter((field) => {
    const value = normalizeHeader(values[field]);
    const header = normalizeHeader(mapping[field] ?? "");
    return (
      value !== "" &&
      header !== "" &&
      (value === header || header.endsWith(` ${value}`))
    );
  }).length;
  return matches >= 2;
}

function isSummaryRow(
  row: CellValue[],
  values: Record<CanonicalField, string>,
): boolean {
  const likelyLabels = [
    values.outlet_id,
    values.area_served,
    values.outlet_type,
    ...row.slice(0, 5).map(textCell),
  ].map(normalizeHeader);
  return likelyLabels.some((label) =>
    /^(?:(?:grand|system|design|actual|measured)\s+)?totals?(?:\s+(?:cfm|airflow|air flow|supply|return|exhaust|design|actual|measured))?$|^(?:cfm|airflow|air flow|supply|return|exhaust|design|actual|measured)\s+totals?$|^(?:subtotal|sub total|percent of design)$/.test(
      label,
    ),
  );
}

function mappingState(
  rows: CellValue[][],
  headerRowIndex: number,
  mapping: ColumnMapping,
): {
  mapping: ColumnMapping;
  headers: string[];
  indexes: Map<string, number>;
  mappedFields: CanonicalField[];
} {
  const headers = headerLabelsAt(rows, headerRowIndex);
  const indexes = new Map(
    headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => header !== "")
      .map(({ header, index }) => [header, index]),
  );
  return {
    mapping,
    headers,
    indexes,
    mappedFields: CANONICAL_FIELDS.filter((field) => {
      const header = mapping[field];
      return Boolean(header && indexes.has(header));
    }),
  };
}

export function mapRows(
  rows: CellValue[][],
  headerRowIndex: number,
  mapping: ColumnMapping,
  options: MapRowsOptions = {},
): MappedRow[] {
  const mappedRows: MappedRow[] = [];
  let lastUnitId = options.defaultUnitId?.trim() ?? "";
  let active = true;
  let section = mappingState(rows, headerRowIndex, mapping);

  rows.slice(headerRowIndex + 1).forEach((row, offset) => {
    const absoluteRowIndex = headerRowIndex + offset + 1;
    const rowText = row.map(textCell).join(" ");
    const rowUnitId = extractUnitId(rowText);
    const rowNumericCount = row.filter(
      (cell) => textCell(cell) !== "" && numericValue(textCell(cell)) !== null,
    ).length;
    const rowNonEmptyCount = row.filter(
      (cell) => textCell(cell) !== "",
    ).length;
    const titleLikeUnitRow =
      rowUnitId !== null &&
      rowNumericCount === 0 &&
      rowNonEmptyCount <= 3 &&
      !/\b(water|hydronic|valve|pump|boiler|fan)\b/i.test(rowText) &&
      /\b(air\s*outlet|test\s*report|outlet\s*report)\b/i.test(rowText);
    if (titleLikeUnitRow) lastUnitId = rowUnitId;

    const candidateHeaders = headersAt(rows, absoluteRowIndex);
    const candidateMapping = suggestMapping(candidateHeaders);
    const candidateCoreCount = [
      "outlet_id",
      "design_cfm",
      "final_cfm",
    ].filter((field) =>
      Boolean(candidateMapping[field as CanonicalField]),
    ).length;
    const candidateText = candidateHeaders
      .join(" ")
      .toLocaleLowerCase();
    const looksLikeSectionHeader =
      candidateHeaders.length >= 2 &&
      rowNumericCount === 0 &&
      (/\b(gpm|psi|valve|pump|boiler|hydronic)\b/.test(candidateText) ||
        candidateCoreCount >= 2 ||
        (Object.keys(candidateMapping).length >= 2 &&
          /\b(outlet|design|final|actual|cfm|gpm|psi|valve|fan|pump)\b/.test(
            candidateText,
          )));
    if (looksLikeSectionHeader) {
      if (
        candidateCoreCount === 3 &&
        hasAirsideOutletContext(rows, absoluteRowIndex)
      ) {
        section = mappingState(rows, absoluteRowIndex, candidateMapping);
        active = true;
      } else {
        active = false;
      }
      return;
    }
    if (!active) return;

    const raw = Object.fromEntries(
      section.headers.flatMap((header, index) =>
        header ? [[header, row[index] ?? null] as const] : [],
      ),
    );
    const values = Object.fromEntries(
      CANONICAL_FIELDS.map((field) => {
        const header = section.mapping[field];
        const index = header ? section.indexes.get(header) : undefined;
        const value = index === undefined ? "" : row[index];
        return [field, textCell(value)];
      }),
    ) as Record<CanonicalField, string>;

    const explicitUnitId = values.unit_id;
    if (!values.unit_id) values.unit_id = lastUnitId;
    const hasOutletIdentity = values.outlet_id !== "";
    const hasReading =
      values.design_cfm !== "" || values.final_cfm !== "";
    if (titleLikeUnitRow) {
      return;
    }

    if (
      isRepeatedHeader(values, section.mapping) ||
      isSummaryRow(row, values)
    ) {
      return;
    }
    const explicitUnitToken = extractUnitId(explicitUnitId);
    if (
      explicitUnitToken &&
      !hasOutletIdentity &&
      !hasReading
    ) {
      lastUnitId = explicitUnitToken;
      return;
    }
    if (
      !hasReading &&
      /\b(report|test|schedule|summary|notes?|remarks?|certificate|drawing|hydronic|fan|pump|boiler|valve)\b/i.test(
        rowText,
      )
    ) {
      return;
    }
    if (!hasOutletIdentity && !hasReading) return;
    if (explicitUnitId) lastUnitId = explicitUnitId;

    mappedRows.push({
      __rowNumber: headerRowIndex + offset + 2,
      __sourceSheet: options.sourceSheet ?? "",
      __mappedFields: [...section.mappedFields],
      __raw: raw,
      ...values,
    });
  });
  return mappedRows;
}

export function validatePreviewCell(
  field: CanonicalField,
  value: string,
  mappedFields?: readonly CanonicalField[],
  remarks = "",
): "valid" | "warning" | "error" {
  if (
    ["instrument_name", "technician", "test_date"].includes(field) &&
    mappedFields &&
    !mappedFields.includes(field)
  ) {
    return "valid";
  }
  if (
    ["unit_id", "outlet_id", "design_cfm", "final_cfm"].includes(field) &&
    value === ""
  ) {
    return "error";
  }
  if (field === "design_cfm" || field === "final_cfm") {
    if (isExplicitNonReading(value)) return "valid";
    const parsed = numericValue(value);
    if (
      value !== "" &&
      (parsed === null || parsed < 0 || (parsed === 0 && !remarksAllowZero(remarks)))
    ) {
      return "error";
    }
  }
  if (
    ["instrument_name", "technician", "test_date"].includes(field) &&
    value === ""
  ) {
    return "warning";
  }
  return "valid";
}
