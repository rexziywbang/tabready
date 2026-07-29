import {
  addMonths,
  findRegisteredInstrument,
  FindingDraft,
  isFieldAvailable,
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
  const findings: FindingDraft[] = [];
  for (const outlet of outlets) {
    if (
      !isFieldAvailable(outlet, "instrument_name") ||
      !isFieldAvailable(outlet, "test_date")
    ) {
      continue;
    }
    const instrument = findRegisteredInstrument(
      outlet.instrumentName,
      instruments,
    );
    if (!instrument) continue;
    const calibrated = parseDateOnly(instrument.calibrationDate);
    if (!calibrated) continue;
    const expires = addMonths(
      calibrated,
      instrument.calibrationIntervalMonths,
    );
    const comparisonDate = parseDateOnly(outlet.testDate);
    if (!comparisonDate) continue;
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
