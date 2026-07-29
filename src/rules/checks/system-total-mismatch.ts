import {
  EPSILON,
  FindingDraft,
  numericValue,
  RULES_VERSION,
  RuleSystem,
} from "../types";

export function checkSystemTotalMismatch(
  systems: RuleSystem[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const system of systems) {
    if (system.designTotalCfm === null || system.designTotalCfm <= 0) continue;
    const complete = system.outlets.length > 0 && system.outlets.every((outlet) => {
      const design = numericValue(outlet.designCfm);
      const final = numericValue(outlet.finalCfm);
      return design !== null && design > 0 && final !== null && final > 0;
    });
    if (!complete) continue;
    const measuredTotal = system.outlets.reduce((sum, outlet) => {
      const value = numericValue(outlet.finalCfm);
      return value !== null ? sum + value : sum;
    }, 0);
    const deviation =
      (Math.abs(measuredTotal - system.designTotalCfm) /
        system.designTotalCfm) *
      100;
    if (deviation <= 5 + EPSILON) continue;
    findings.push({
      ruleId: "system_total_mismatch",
      ruleVersion: RULES_VERSION,
      severity: "warning",
      outletId: null,
      airSystemId: system.id,
      message: `${system.unitId}: measured total ${Math.round(measuredTotal)} vs design total ${Math.round(system.designTotalCfm)} (${deviation.toFixed(1)}% off)`,
      inputs: {
        unit_id: system.unitId,
        measured_total_cfm: measuredTotal,
        design_total_cfm: system.designTotalCfm,
        tolerance_pct: 5,
      },
    });
  }
  return findings;
}
