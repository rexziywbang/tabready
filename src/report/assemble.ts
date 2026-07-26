import { eq } from "drizzle-orm";
import { db } from "@/src/db/client";
import {
  airSystems,
  findings,
  instruments,
  outlets,
  projects,
} from "@/src/db/schema";

export interface ReportSnapshot {
  schemaVersion: "1";
  frozenAt: string;
  project: {
    id: string;
    name: string;
    clientName: string;
    tolerancePct: number;
  };
  systems: Array<{
    id: string;
    unitId: string;
    description: string;
    designTotalCfm: number | null;
    outlets: Array<{
      id: string;
      outletId: string | null;
      areaServed: string | null;
      outletType: string | null;
      size: string | null;
      designCfm: string | null;
      finalCfm: string | null;
      instrumentName: string | null;
      technician: string | null;
      testDate: string | null;
      remarks: string | null;
      rawRowJson: string;
    }>;
  }>;
  instruments: Array<{
    id: string;
    name: string;
    type: string;
    serial: string;
    calibrationDate: string;
    calibrationIntervalMonths: number;
  }>;
  findings: Array<{
    id: string;
    ruleId: string;
    ruleVersion: string;
    severity: "error" | "warning";
    outletId: string | null;
    airSystemId: string | null;
    message: string;
    inputsJson: string;
    status: "open" | "acknowledged" | "resolved";
    resolutionNote: string | null;
    resolvedBy: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;
}

export async function assembleReportSnapshot(
  projectId: string,
  frozenAt = new Date().toISOString(),
): Promise<ReportSnapshot> {
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
    .select({ outlet: outlets, systemId: airSystems.id })
    .from(outlets)
    .innerJoin(airSystems, eq(outlets.airSystemId, airSystems.id))
    .where(eq(airSystems.projectId, projectId));
  const registry = await db.select().from(instruments);
  const findingRows = await db
    .select()
    .from(findings)
    .where(eq(findings.projectId, projectId));

  return {
    schemaVersion: "1",
    frozenAt,
    project: {
      id: project.id,
      name: project.name,
      clientName: project.clientName,
      tolerancePct: project.tolerancePct,
    },
    systems: systemRows.map((system) => ({
      id: system.id,
      unitId: system.unitId,
      description: system.description,
      designTotalCfm: system.designTotalCfm,
      outlets: outletRows
        .filter((row) => row.systemId === system.id)
        .map(({ outlet }) => ({
          id: outlet.id,
          outletId: outlet.outletId,
          areaServed: outlet.areaServed,
          outletType: outlet.outletType,
          size: outlet.size,
          designCfm: outlet.designCfm,
          finalCfm: outlet.finalCfm,
          instrumentName: outlet.instrumentName,
          technician: outlet.technician,
          testDate: outlet.testDate,
          remarks: outlet.remarks,
          rawRowJson: outlet.rawRowJson,
        })),
    })),
    instruments: registry.map((instrument) => ({ ...instrument })),
    findings: findingRows.map((finding) => ({ ...finding })),
  };
}

export function cloneSnapshot(snapshot: ReportSnapshot): ReportSnapshot {
  return structuredClone(snapshot);
}
