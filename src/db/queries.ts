import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import {
  airSystems,
  findings,
  importBatches,
  instruments,
  outlets,
  projects,
  reportVersions,
} from "./schema";

export async function getProjectsWithCounts() {
  const [projectRows, systemRows, outletRows, findingRows] = await Promise.all([
    db.select().from(projects).orderBy(desc(projects.createdAt)),
    db.select().from(airSystems),
    db
      .select({ outlet: outlets, projectId: airSystems.projectId })
      .from(outlets)
      .innerJoin(airSystems, eq(outlets.airSystemId, airSystems.id)),
    db.select().from(findings),
  ]);
  return projectRows.map((project) => ({
    ...project,
    systemCount: systemRows.filter((system) => system.projectId === project.id)
      .length,
    outletCount: outletRows.filter((row) => row.projectId === project.id).length,
    openErrors: findingRows.filter(
      (finding) =>
        finding.projectId === project.id &&
        finding.status === "open" &&
        finding.severity === "error",
    ).length,
    openWarnings: findingRows.filter(
      (finding) =>
        finding.projectId === project.id &&
        finding.status === "open" &&
        finding.severity === "warning",
    ).length,
  }));
}

export async function getProjectWorkspace(projectId: string) {
  const [
    projectRows,
    systemRows,
    outletRows,
    findingRows,
    reportRows,
  ] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
    db.select().from(airSystems).where(eq(airSystems.projectId, projectId)),
    db
      .select({ outlet: outlets, system: airSystems })
      .from(outlets)
      .innerJoin(airSystems, eq(outlets.airSystemId, airSystems.id))
      .where(eq(airSystems.projectId, projectId)),
    db.select().from(findings).where(eq(findings.projectId, projectId)),
    db
      .select()
      .from(reportVersions)
      .where(eq(reportVersions.projectId, projectId))
      .orderBy(desc(reportVersions.versionNumber)),
  ]);
  return {
    project: projectRows[0],
    systems: systemRows,
    outlets: outletRows,
    findings: findingRows,
    reports: reportRows,
  };
}

export async function getLatestMapping(projectId: string) {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.projectId, projectId))
    .orderBy(desc(importBatches.importedAt))
    .limit(1);
  return batch?.mappingJson ?? null;
}

export async function getInstruments() {
  return db.select().from(instruments).orderBy(instruments.name);
}
