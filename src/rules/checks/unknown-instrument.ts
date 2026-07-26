import {
  cleanText,
  FindingDraft,
  RULES_VERSION,
  RuleInstrument,
  RuleOutlet,
} from "../types";

export function checkUnknownInstrument(
  outlets: RuleOutlet[],
  instruments: RuleInstrument[],
): FindingDraft[] {
  const names = new Set(
    instruments.map((instrument) =>
      cleanText(instrument.name).toLocaleLowerCase(),
    ),
  );
  return outlets
    .filter((outlet) => {
      const name = cleanText(outlet.instrumentName).toLocaleLowerCase();
      return name !== "" && !names.has(name);
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
