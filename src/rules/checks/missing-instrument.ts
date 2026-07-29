import {
  cleanText,
  FindingDraft,
  isFieldAvailable,
  RULES_VERSION,
  RuleOutlet,
} from "../types";

export function checkMissingInstrument(
  outlets: RuleOutlet[],
): FindingDraft[] {
  return outlets
    .filter(
      (outlet) =>
        isFieldAvailable(outlet, "instrument_name") &&
        cleanText(outlet.instrumentName) === "",
    )
    .map((outlet) => ({
      ruleId: "missing_instrument",
      ruleVersion: RULES_VERSION,
      severity: "error",
      outletId: outlet.id,
      airSystemId: outlet.airSystemId,
      message: `${outlet.outletId || `Row ${outlet.rowNumber}`}: no instrument recorded`,
      inputs: { instrument_name: outlet.instrumentName },
    }));
}
