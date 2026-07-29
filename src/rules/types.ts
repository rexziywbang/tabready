export const RULES_VERSION = "0.2.0";
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
  remarks: string | null;
  mappedFields?: readonly string[];
}

export interface RuleSystem {
  id: string;
  unitId: string;
  designTotalCfm: number | null;
  outlets: RuleOutlet[];
}

export interface RuleInstrument {
  name: string;
  serial?: string;
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
  ruleVersion: string;
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
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = value
    .trim()
    .replaceAll(",", "")
    .replace(/(\d)\s+(?=\d)/g, "$1")
    .replace(/\*+$/, "")
    .trim();
  if (
    !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*(?:cfm|fpm|gpm))?$/i.test(
      cleaned,
    )
  ) {
    return null;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isExplicitNonReading(value: RawValue): boolean {
  if (value === null || value === undefined || typeof value === "number") {
    return false;
  }
  const cleaned = value.trim().toLocaleUpperCase();
  if (/^[-–—]+$/.test(cleaned)) return true;
  const compact = cleaned.replace(/[^A-Z0-9]/g, "");
  return new Set([
    "NA",
    "NG",
    "NR",
    "NTS",
    "NOTE",
    "SEENOTE",
    "NOTREADABLE",
    "NOTTESTED",
    "NOTAPPLICABLE",
    "NOTINSTALLED",
    "INACCESSIBLE",
    "UNREADABLE",
    "OFF",
    "CLOSED",
  ]).has(compact);
}

export function remarksAllowZero(
  remarks: string | null | undefined,
): boolean {
  const normalized = cleanText(remarks).toLocaleLowerCase();
  return /\b(closed|off|not in use|not applicable|no flow|zero flow|intentionally zero|damper closed|fan off|unit off)\b/.test(
    normalized,
  );
}

export function isFieldAvailable(
  outlet: RuleOutlet,
  field: string,
): boolean {
  return outlet.mappedFields === undefined || outlet.mappedFields.includes(field);
}

export function isValidPositiveNumber(value: RawValue): boolean {
  const parsed = numericValue(value);
  return parsed !== null && parsed > 0;
}

function utcDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseDateOnly(value: string | null | undefined): Date | null {
  const cleaned = cleanText(value);
  let match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return utcDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (match) {
    const rawYear = Number(match[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return utcDate(year, Number(match[1]), Number(match[2]));
  }

  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  match = cleaned.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-,\s]+(\d{2}|\d{4})$/);
  if (match) {
    const month = months[match[2].slice(0, 3).toLocaleLowerCase()];
    const rawYear = Number(match[3]);
    if (month) {
      return utcDate(
        rawYear < 100 ? 2000 + rawYear : rawYear,
        month,
        Number(match[1]),
      );
    }
  }

  match = cleaned.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2}|\d{4})$/);
  if (match) {
    const month = months[match[1].slice(0, 3).toLocaleLowerCase()];
    const rawYear = Number(match[3]);
    if (month) {
      return utcDate(
        rawYear < 100 ? 2000 + rawYear : rawYear,
        month,
        Number(match[2]),
      );
    }
  }
  return null;
}

export function addMonths(date: Date, months: number): Date {
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonth,
      Math.min(date.getUTCDate(), lastDay),
    ),
  );
}

function normalizeInstrument(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function instrumentTokens(value: string): string[] {
  return value
    .split(/[\s,;/()[\]#]+/)
    .map(normalizeInstrument)
    .filter(Boolean);
}

export function findRegisteredInstrument(
  reportedName: string | null | undefined,
  instruments: RuleInstrument[],
): RuleInstrument | null {
  const reported = normalizeInstrument(cleanText(reportedName));
  if (!reported) return null;
  const reportedTokens = new Set(instrumentTokens(cleanText(reportedName)));
  for (const instrument of instruments) {
    const normalizedName = normalizeInstrument(instrument.name);
    const normalizedSerial = normalizeInstrument(instrument.serial ?? "");
    const identifierTokens = instrumentTokens(instrument.name).filter(
      (part) => /\d/.test(part) && part.length >= 3,
    );
    if (
      normalizedName === reported ||
      (normalizedSerial !== "" && normalizedSerial === reported) ||
      (normalizedSerial !== "" && reportedTokens.has(normalizedSerial)) ||
      identifierTokens.some((token) => reportedTokens.has(token))
    ) {
      return instrument;
    }
  }
  return null;
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
    "ruleId" | "ruleVersion" | "outletId" | "airSystemId" | "inputsJson"
  >,
): string {
  return [
    finding.ruleId,
    finding.ruleVersion,
    finding.outletId ?? "",
    finding.airSystemId ?? "",
    finding.inputsJson,
  ].join("|");
}
