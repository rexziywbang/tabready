import { cleanText, FindingDraft, RULES_VERSION, RuleSystem } from "../types";

export function checkDuplicateOutletId(
  systems: RuleSystem[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const system of systems) {
    const groups = new Map<string, typeof system.outlets>();
    for (const outlet of system.outlets) {
      const key = cleanText(outlet.outletId).toLocaleLowerCase();
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), outlet]);
    }
    for (const duplicates of groups.values()) {
      if (duplicates.length < 2) continue;
      const displayId = cleanText(duplicates[0].outletId);
      for (const outlet of duplicates) {
        findings.push({
          ruleId: "duplicate_outlet_id",
          ruleVersion: RULES_VERSION,
          severity: "error",
          outletId: outlet.id,
          airSystemId: system.id,
          message: `${displayId} appears ${duplicates.length}× in ${system.unitId}`,
          inputs: {
            outlet_id: displayId,
            count: duplicates.length,
            unit_id: system.unitId,
          },
        });
      }
    }
  }
  return findings;
}
