export const RULES_VERSION = "0.1.0";
export const EPSILON = 1e-9;

export type Severity = "error" | "warning";
export type FindingStatus = "open" | "acknowledged" | "resolved";
export type RawValue = string | number | null | undefined;

export interface RuleOutlet {
  id: string;
  airSystemId: string;
  rowNumber: number;
  unitId: string;
  outletId: string | null;
  designCfm: RawValue;
  finalCfm: RawValue;
  instrumentName: string | null;
  technician: string | null;
  testDate: string | null;
}

export interface RuleSystem {
  id: string;
  unitId: string;
  designTotalCfm: number | null;
  outlets: RuleOutlet[];
}

export interface RuleInstrument {
  name: string;
  calibrationDate: string;
  calibrationIntervalMonths: number;
}

export interface FindingDraft {
  ruleId: string;
  ruleVersion: typeof RULES_VERSION;
  severity: Severity;
  outletId: string | null;
  airSystemId: string | null;
  message: string;
  inputs: Record<string, unknown>;
}

export interface ExistingFindingIdentity {
  ruleId: string;
  outletId: string | null;
  airSystemId: string | null;
  inputsJson: string;
  status: FindingStatus;
}

export function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function numericValue(value: RawValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidPositiveNumber(value: RawValue): boolean {
  const parsed = numericValue(value);
  return parsed !== null && parsed > 0;
}

export function parseDateOnly(value: string | null | undefined): Date | null {
  const cleaned = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null;
  const date = new Date(`${cleaned}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

export function findingIdentity(
  finding: Pick<
    ExistingFindingIdentity,
    "ruleId" | "outletId" | "airSystemId" | "inputsJson"
  >,
): string {
  return [
    finding.ruleId,
    finding.outletId ?? "",
    finding.airSystemId ?? "",
    finding.inputsJson,
  ].join("|");
}
