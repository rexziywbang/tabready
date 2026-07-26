import { and, eq } from "drizzle-orm";
import { db } from "@/src/db/client";
import {
  airSystems,
  findings,
  instruments,
  outlets,
  projects,
} from "@/src/db/schema";
import { checkDuplicateOutletId } from "./checks/duplicate-outlet-id";
import { checkExpiredCalibration } from "./checks/expired-calibration";
import { checkInvalidValue } from "./checks/invalid-value";
import { checkMissingDesignValue } from "./checks/missing-design-value";
import { checkMissingInstrument } from "./checks/missing-instrument";
import { checkMissingMeasuredValue } from "./checks/missing-measured-value";
import { checkMissingOutletId } from "./checks/missing-outlet-id";
import { checkMissingTechnician } from "./checks/missing-technician";
import { checkMissingTestDate } from "./checks/missing-test-date";
import { checkOutOfTolerance } from "./checks/out-of-tolerance";
import { checkSystemTotalMismatch } from "./checks/system-total-mismatch";
import { checkUnknownInstrument } from "./checks/unknown-instrument";
import {
  ExistingFindingIdentity,
  findingIdentity,
  FindingDraft,
  RuleInstrument,
  RuleOutlet,
  RuleSystem,
  stableJson,
} from "./types";

export function runReadinessChecks(input: {
  systems: RuleSystem[];
  instruments: RuleInstrument[];
  tolerancePct: number;
  today: Date;
}): FindingDraft[] {
  const allOutlets = input.systems.flatMap((system) => system.outlets);
  return [
    ...checkMissingOutletId(allOutlets),
    ...checkDuplicateOutletId(input.systems),
    ...checkMissingDesignValue(allOutlets),
    ...checkMissingMeasuredValue(allOutlets),
    ...checkInvalidValue(allOutlets),
    ...checkOutOfTolerance(allOutlets, input.tolerancePct),
    ...checkSystemTotalMismatch(input.systems),
    ...checkMissingInstrument(allOutlets),
    ...checkUnknownInstrument(allOutlets, input.instruments),
    ...checkExpiredCalibration(allOutlets, input.instruments, input.today),
    ...checkMissingTestDate(allOutlets),
    ...checkMissingTechnician(allOutlets),
  ];
}

export function filterNewFindings(
  drafts: FindingDraft[],
  existing: ExistingFindingIdentity[],
): FindingDraft[] {
  const reviewed = new Set(
    existing
      .filter((finding) => finding.status !== "open")
      .map((finding) => findingIdentity(finding)),
  );
  return drafts.filter(
    (draft) =>
      !reviewed.has(
        findingIdentity({
          ruleId: draft.ruleId,
          outletId: draft.outletId,
          airSystemId: draft.airSystemId,
          inputsJson: stableJson(draft.inputs),
        }),
      ),
  );
}

export async function runChecks(projectId: string): Promise<number> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Project not found.");

  const systemRows = await db
    .select()
    .from(airSystems)
    .where(eq(airSystems.projectId, projectId));
  const outletRows = await db
    .select({
      outlet: outlets,
      system: airSystems,
    })
    .from(outlets)
    .innerJoin(airSystems, eq(outlets.airSystemId, airSystems.id))
    .where(eq(airSystems.projectId, projectId));
  const registry = await db.select().from(instruments);
  const existing = await db
    .select({
      ruleId: findings.ruleId,
      outletId: findings.outletId,
      airSystemId: findings.airSystemId,
      inputsJson: findings.inputsJson,
      status: findings.status,
    })
    .from(findings)
    .where(eq(findings.projectId, projectId));

  const ruleSystems: RuleSystem[] = systemRows.map((system) => ({
    id: system.id,
    unitId: system.unitId,
    designTotalCfm: system.designTotalCfm,
    outlets: outletRows
      .filter(({ system: rowSystem }) => rowSystem.id === system.id)
      .map(({ outlet }, index): RuleOutlet => {
        const raw = JSON.parse(outlet.rawRowJson) as {
          __rowNumber?: number;
        };
        return {
          id: outlet.id,
          airSystemId: system.id,
          rowNumber: raw.__rowNumber ?? index + 2,
          unitId: system.unitId,
          outletId: outlet.outletId,
          designCfm: outlet.designCfm,
          finalCfm: outlet.finalCfm,
          instrumentName: outlet.instrumentName,
          technician: outlet.technician,
          testDate: outlet.testDate,
        };
      }),
  }));

  const drafts = runReadinessChecks({
    systems: ruleSystems,
    instruments: registry.map((instrument) => ({
      name: instrument.name,
      calibrationDate: instrument.calibrationDate,
      calibrationIntervalMonths: instrument.calibrationIntervalMonths,
    })),
    tolerancePct: project.tolerancePct,
    today: new Date(),
  });
  const fresh = filterNewFindings(drafts, existing);

  await db
    .delete(findings)
    .where(
      and(
        eq(findings.projectId, projectId),
        eq(findings.status, "open"),
      ),
    );

  if (fresh.length > 0) {
    const now = new Date().toISOString();
    await db.insert(findings).values(
      fresh.map((finding) => ({
        id: crypto.randomUUID(),
        projectId,
        ruleId: finding.ruleId,
        ruleVersion: finding.ruleVersion,
        severity: finding.severity,
        outletId: finding.outletId,
        airSystemId: finding.airSystemId,
        message: finding.message,
        inputsJson: stableJson(finding.inputs),
        status: "open" as const,
        createdAt: now,
      })),
    );
  }
  return fresh.length;
}
