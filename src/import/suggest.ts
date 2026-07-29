export const CANONICAL_FIELDS = [
  "unit_id",
  "outlet_id",
  "area_served",
  "outlet_type",
  "size",
  "design_cfm",
  "final_cfm",
  "instrument_name",
  "technician",
  "test_date",
  "remarks",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
export type ColumnMapping = Partial<Record<CanonicalField, string>>;

export const FIELD_LABELS: Record<CanonicalField, string> = {
  unit_id: "Air system / unit",
  outlet_id: "Outlet ID",
  area_served: "Area served",
  outlet_type: "Outlet type",
  size: "Size",
  design_cfm: "Design CFM",
  final_cfm: "Final CFM",
  instrument_name: "Instrument",
  technician: "Technician",
  test_date: "Test date",
  remarks: "Remarks",
};

export const REQUIRED_FIELDS: CanonicalField[] = [
  "unit_id",
  "outlet_id",
  "design_cfm",
  "final_cfm",
];

const synonyms: Record<CanonicalField, string[]> = {
  unit_id: [
    "unit id",
    "unit",
    "ahu",
    "system",
    "system id",
    "air system",
    "air system id",
    "equipment",
    "equipment id",
  ],
  outlet_id: [
    "outlet id",
    "outlet",
    "outlet number",
    "outlet no",
    "diffuser",
    "diffuser number",
    "diffuser no",
    "register",
    "register number",
    "grille",
    "grille number",
    "terminal",
    "terminal number",
  ],
  area_served: ["area served", "area", "room", "location", "space"],
  outlet_type: ["outlet type", "type", "terminal type", "device"],
  size: ["size", "neck size", "dimensions"],
  design_cfm: [
    "design cfm",
    "cfm design",
    "design",
    "dsn cfm",
    "spec cfm",
    "specified cfm",
    "design airflow",
    "design air flow",
  ],
  final_cfm: [
    "final cfm",
    "cfm final",
    "final",
    "actual cfm",
    "actual airflow",
    "actual air flow",
    "measured cfm",
    "final airflow",
    "final air flow",
  ],
  instrument_name: [
    "instrument",
    "instrument name",
    "instr",
    "meter",
    "hood",
    "test instrument",
  ],
  technician: ["technician", "tech", "tested by", "balanced by"],
  test_date: ["test date", "date tested", "tested date", "date"],
  remarks: ["remarks", "remark", "notes", "comments"],
};

export function normalizeHeader(header: string): string {
  return header
    .toLocaleLowerCase()
    .replace(/#/g, " number ")
    .replace(/[_/()-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MINIMUM_MAPPING_SCORE = 60;

function isEligibleHeader(field: CanonicalField, header: string): boolean {
  const normalized = normalizeHeader(header);
  if (
    field === "outlet_id" &&
    /\b(type|size|area|cfm|design|final|actual|factor)\b/.test(normalized) &&
    !/\b(id|number|no)\b/.test(normalized)
  ) {
    return false;
  }
  if (
    field === "unit_id" &&
    /\b(type|size|description|model)\b/.test(normalized) &&
    !/\b(id|number|no)\b/.test(normalized)
  ) {
    return false;
  }
  if (
    (field === "design_cfm" || field === "final_cfm") &&
    /\b(gpm|psi|rpm|fpm|pressure|temperature|velocity)\b/.test(normalized) &&
    !/\b(cfm|airflow|air flow)\b/.test(normalized)
  ) {
    return false;
  }
  return true;
}

function scoreHeader(header: string, candidates: string[]): number {
  const normalized = normalizeHeader(header);
  if (!normalized) return 0;
  let score = 0;
  for (const candidate of candidates) {
    const target = normalizeHeader(candidate);
    if (normalized === target) score = Math.max(score, 100);
    else if (
      target.includes(" ") &&
      (normalized.startsWith(`${target} `) ||
        normalized.endsWith(` ${target}`))
    ) {
      score = Math.max(score, 82);
    } else if (
      normalized.includes(" ") &&
      (target.startsWith(`${normalized} `) ||
        target.endsWith(` ${normalized}`))
    ) {
      score = Math.max(score, 72);
    } else {
      const headerWords = new Set(normalized.split(" "));
      const targetWords = target.split(" ");
      const overlap = targetWords.filter((word) => headerWords.has(word)).length;
      if (targetWords.length > 1 && overlap === targetWords.length) {
        score = Math.max(score, 70);
      } else if (
        targetWords.length === 1 &&
        target.length >= 4 &&
        headerWords.has(target)
      ) {
        score = Math.max(score, 68);
      }
    }
  }
  return score;
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of CANONICAL_FIELDS) {
    const ranked = headers
      .filter((header) => isEligibleHeader(field, header))
      .map((header) => ({
        header,
        score: scoreHeader(header, [field, ...synonyms[field]]),
      }))
      .filter(({ header }) => !used.has(header))
      .sort((left, right) => right.score - left.score);
    if (ranked[0] && ranked[0].score >= MINIMUM_MAPPING_SCORE) {
      mapping[field] = ranked[0].header;
      used.add(ranked[0].header);
    }
  }
  return mapping;
}
