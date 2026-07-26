import { cleanText, FindingDraft, RULES_VERSION, RuleOutlet } from "../types";

export function checkMissingTechnician(
  outlets: RuleOutlet[],
): FindingDraft[] {
  return outlets
    .filter((outlet) => cleanText(outlet.technician) === "")
    .map((outlet) => ({
      ruleId: "missing_technician",
      ruleVersion: RULES_VERSION,
      severity: "error",
      outletId: outlet.id,
      airSystemId: outlet.airSystemId,
      message: `${outlet.outletId || `Row ${outlet.rowNumber}`}: no technician recorded`,
      inputs: { technician: outlet.technician },
    }));
}
