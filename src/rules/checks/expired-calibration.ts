import {
  addMonths,
  cleanText,
  FindingDraft,
  parseDateOnly,
  RULES_VERSION,
  RuleInstrument,
  RuleOutlet,
} from "../types";

export function checkExpiredCalibration(
  outlets: RuleOutlet[],
  instruments: RuleInstrument[],
  today: Date,
): FindingDraft[] {
  const registry = new Map(
    instruments.map((instrument) => [
      cleanText(instrument.name).toLocaleLowerCase(),
      instrument,
    ]),
  );
  const findings: FindingDraft[] = [];
  for (const outlet of outlets) {
    const instrument = registry.get(
      cleanText(outlet.instrumentName).toLocaleLowerCase(),
    );
    if (!instrument) continue;
    const calibrated = parseDateOnly(instrument.calibrationDate);
    if (!calibrated) continue;
    const expires = addMonths(
      calibrated,
      instrument.calibrationIntervalMonths,
    );
    const comparisonDate = parseDateOnly(outlet.testDate) ?? today;
    if (expires.getTime() >= comparisonDate.getTime()) continue;
    const expirationDate = expires.toISOString().slice(0, 10);
    findings.push({
      ruleId: "expired_calibration",
      ruleVersion: RULES_VERSION,
      severity: "error",
      outletId: outlet.id,
      airSystemId: outlet.airSystemId,
      message: `${outlet.outletId || `Row ${outlet.rowNumber}`}: ${instrument.name} calibration expired ${expirationDate}`,
      inputs: {
        instrument_name: outlet.instrumentName,
        calibration_date: instrument.calibrationDate,
        calibration_interval_months: instrument.calibrationIntervalMonths,
        test_date: outlet.testDate,
        comparison_date: comparisonDate.toISOString().slice(0, 10),
      },
    });
  }
  return findings;
}
