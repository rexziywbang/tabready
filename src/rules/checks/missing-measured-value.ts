import { FindingDraft, RULES_VERSION, RuleOutlet } from "../types";

export function checkMissingMeasuredValue(
  outlets: RuleOutlet[],
): FindingDraft[] {
  return outlets
    .filter(
      (outlet) =>
        outlet.finalCfm === null ||
        outlet.finalCfm === undefined ||
        outlet.finalCfm === "",
    )
    .map((outlet) => ({
      ruleId: "missing_measured_value",
      ruleVersion: RULES_VERSION,
      severity: "error",
      outletId: outlet.id,
      airSystemId: outlet.airSystemId,
      message: `${outlet.outletId || `Row ${outlet.rowNumber}`}: no measured CFM`,
      inputs: { final_cfm: outlet.finalCfm },
    }));
}
