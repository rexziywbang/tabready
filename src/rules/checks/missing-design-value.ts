import { FindingDraft, RULES_VERSION, RuleOutlet } from "../types";

export function checkMissingDesignValue(
  outlets: RuleOutlet[],
): FindingDraft[] {
  return outlets
    .filter(
      (outlet) =>
        outlet.designCfm === null ||
        outlet.designCfm === undefined ||
        outlet.designCfm === "",
    )
    .map((outlet) => ({
      ruleId: "missing_design_value",
      ruleVersion: RULES_VERSION,
      severity: "error",
      outletId: outlet.id,
      airSystemId: outlet.airSystemId,
      message: `${outlet.outletId || `Row ${outlet.rowNumber}`}: no design CFM`,
      inputs: { design_cfm: outlet.designCfm },
    }));
}
