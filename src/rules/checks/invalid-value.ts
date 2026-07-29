import {
  FindingDraft,
  isExplicitNonReading,
  numericValue,
  RawValue,
  remarksAllowZero,
  RULES_VERSION,
  RuleOutlet,
} from "../types";

function invalid(value: RawValue, outlet: RuleOutlet): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (isExplicitNonReading(value)) return false;
  const number = numericValue(value);
  return (
    number === null ||
    number < 0 ||
    (number === 0 && !remarksAllowZero(outlet.remarks))
  );
}

export function checkInvalidValue(outlets: RuleOutlet[]): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const outlet of outlets) {
    const values: Array<[string, RawValue]> = [
      ["design_cfm", outlet.designCfm],
      ["final_cfm", outlet.finalCfm],
    ];
    for (const [field, value] of values) {
      if (!invalid(value, outlet)) continue;
      findings.push({
        ruleId: "invalid_value",
        ruleVersion: RULES_VERSION,
        severity: "error",
        outletId: outlet.id,
        airSystemId: outlet.airSystemId,
        message: `${outlet.outletId || `Row ${outlet.rowNumber}`}: invalid reading '${String(value)}'`,
        inputs: { field, value },
      });
    }
  }
  return findings;
}
