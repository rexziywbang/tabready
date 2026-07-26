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
  unit_id: ["unit id", "unit", "ahu", "system", "air system"],
  outlet_id: [
    "outlet id",
    "outlet",
    "outlet number",
    "diffuser",
    "diffuser number",
    "terminal",
    "terminal number",
  ],
  area_served: ["area served", "area", "room", "location", "space"],
  outlet_type: ["outlet type", "type", "terminal type", "device"],
  size: ["size", "neck size", "dimensions"],
  design_cfm: ["design cfm", "design", "dsn cfm", "dsn", "spec cfm", "specified cfm"],
  final_cfm: ["final cfm", "final", "actual", "actual cfm", "measured", "measured cfm"],
  instrument_name: ["instrument", "instrument name", "instr", "meter", "hood", "test instrument"],
  technician: ["technician", "tech", "tested by", "by"],
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

function scoreHeader(header: string, candidates: string[]): number {
  const normalized = normalizeHeader(header);
  let score = 0;
  for (const candidate of candidates) {
    const target = normalizeHeader(candidate);
    if (normalized === target) score = Math.max(score, 100);
    else if (normalized.includes(target) || target.includes(normalized)) {
      score = Math.max(score, 70 - Math.abs(normalized.length - target.length));
    } else {
      const headerWords = new Set(normalized.split(" "));
      const targetWords = target.split(" ");
      const overlap = targetWords.filter((word) => headerWords.has(word)).length;
      score = Math.max(score, overlap * 15);
    }
  }
  return score;
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const field of CANONICAL_FIELDS) {
    const ranked = headers
      .map((header) => ({
        header,
        score: scoreHeader(header, [field, ...synonyms[field]]),
      }))
      .filter(({ header }) => !used.has(header))
      .sort((left, right) => right.score - left.score);
    if (ranked[0] && ranked[0].score >= 15) {
      mapping[field] = ranked[0].header;
      used.add(ranked[0].header);
    }
  }
  return mapping;
}
