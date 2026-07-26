import { cleanText, FindingDraft, RULES_VERSION, RuleOutlet } from "../types";

export function checkMissingOutletId(outlets: RuleOutlet[]): FindingDraft[] {
  return outlets
    .filter((outlet) => cleanText(outlet.outletId) === "")
    .map((outlet) => ({
      ruleId: "missing_outlet_id",
      ruleVersion: RULES_VERSION,
      severity: "error",
      outletId: outlet.id,
      airSystemId: outlet.airSystemId,
      message: `Row ${outlet.rowNumber}: no outlet ID recorded`,
      inputs: { outlet_id: outlet.outletId, row: outlet.rowNumber },
    }));
}
