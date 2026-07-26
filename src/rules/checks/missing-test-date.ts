import {
  FindingDraft,
  parseDateOnly,
  RULES_VERSION,
  RuleOutlet,
} from "../types";

export function checkMissingTestDate(
  outlets: RuleOutlet[],
): FindingDraft[] {
  return outlets
    .filter((outlet) => parseDateOnly(outlet.testDate) === null)
    .map((outlet) => ({
      ruleId: "missing_test_date",
      ruleVersion: RULES_VERSION,
      severity: "error",
      outletId: outlet.id,
      airSystemId: outlet.airSystemId,
      message: `${outlet.outletId || `Row ${outlet.rowNumber}`}: no test date`,
      inputs: { test_date: outlet.testDate },
    }));
}
