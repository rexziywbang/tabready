import {
  EPSILON,
  FindingDraft,
  isValidPositiveNumber,
  numericValue,
  RULES_VERSION,
  RuleOutlet,
} from "../types";

export function checkOutOfTolerance(
  outlets: RuleOutlet[],
  tolerancePct: number,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const outlet of outlets) {
    if (
      !isValidPositiveNumber(outlet.designCfm) ||
      !isValidPositiveNumber(outlet.finalCfm)
    ) {
      continue;
    }
    const design = numericValue(outlet.designCfm)!;
    const final = numericValue(outlet.finalCfm)!;
    const deviation = Math.abs(final / design - 1) * 100;
    if (deviation <= tolerancePct + EPSILON) continue;
    const percentOfDesign = (final / design) * 100;
    findings.push({
      ruleId: "out_of_tolerance",
      ruleVersion: RULES_VERSION,
      severity: "warning",
      outletId: outlet.id,
      airSystemId: outlet.airSystemId,
      message: `${outlet.outletId || `Row ${outlet.rowNumber}`}: ${final} CFM is ${percentOfDesign.toFixed(1)}% of design ${design} (tolerance ±${tolerancePct}%)`,
      inputs: {
        design_cfm: outlet.designCfm,
        final_cfm: outlet.finalCfm,
        tolerance_pct: tolerancePct,
      },
    });
  }
  return findings;
}
