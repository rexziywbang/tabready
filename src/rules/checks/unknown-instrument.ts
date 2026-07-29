import {
  cleanText,
  findRegisteredInstrument,
  FindingDraft,
  isFieldAvailable,
  RULES_VERSION,
  RuleInstrument,
  RuleOutlet,
} from "../types";

export function checkUnknownInstrument(
  outlets: RuleOutlet[],
  instruments: RuleInstrument[],
): FindingDraft[] {
  return outlets
    .filter((outlet) => {
      const name = cleanText(outlet.instrumentName);
      return (
        isFieldAvailable(outlet, "instrument_name") &&
        name !== "" &&
        !findRegisteredInstrument(name, instruments)
      );
    })
    .map((outlet) => ({
      ruleId: "unknown_instrument",
      ruleVersion: RULES_VERSION,
      severity: "error",
      outletId: outlet.id,
      airSystemId: outlet.airSystemId,
      message: `${outlet.outletId || `Row ${outlet.rowNumber}`}: instrument '${cleanText(outlet.instrumentName)}' not in registry`,
      inputs: { instrument_name: outlet.instrumentName },
    }));
}
