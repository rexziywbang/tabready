import { eq } from "drizzle-orm";
import { db, sqlite } from "@/src/db/client";
import {
  airSystems,
  findings,
  importBatches,
  outlets,
  projects,
} from "@/src/db/schema";
import { runChecks } from "@/src/rules/engine";
import { numericValue } from "@/src/rules/types";
import { MappedRow } from "./parse";
import {
  matchReviewCandidates,
  ReviewMatchCandidate,
} from "./review-match";
import { ColumnMapping } from "./suggest";

interface ReviewedFinding extends ReviewMatchCandidate {
  status: "acknowledged" | "resolved";
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

function sourceLocation(rawRowJson: string | null): string {
  if (!rawRowJson) return "";
  try {
    const raw = JSON.parse(rawRowJson) as {
      __sourceSheet?: unknown;
      __rowNumber?: unknown;
    };
    const sheet = String(raw.__sourceSheet ?? "").trim();
    const row = String(raw.__rowNumber ?? "").trim();
    return sheet || row ? `${sheet}:${row}` : "";
  } catch {
    return "";
  }
}

function reviewPrimaryKey(input: {
  ruleId: string;
  ruleVersion: string;
  inputsJson: string;
  unitId: string | null;
  outletId: string | null;
  rawRowJson: string | null;
}): string {
  const normalizedOutletId =
    input.outletId?.trim().toLocaleLowerCase() ?? "";
  const outletIdentity = normalizedOutletId
    ? `outlet:${normalizedOutletId}`
    : `source:${sourceLocation(input.rawRowJson)}`;
  return [
    input.ruleId,
    input.ruleVersion,
    input.unitId?.trim().toLocaleLowerCase() ?? "",
    outletIdentity,
    input.inputsJson,
  ].join("|");
}

export async function commitImport(input: {
  projectId: string;
  filename: string;
  sheetName: string;
  mapping: ColumnMapping;
  rows: MappedRow[];
}): Promise<{ batchId: string; outletCount: number }> {
  if (input.rows.length === 0) throw new Error("No data rows were found.");
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found.");

  const previousFindingRows = await db
    .select({
      ruleId: findings.ruleId,
      ruleVersion: findings.ruleVersion,
      inputsJson: findings.inputsJson,
      status: findings.status,
      resolutionNote: findings.resolutionNote,
      resolvedBy: findings.resolvedBy,
      resolvedAt: findings.resolvedAt,
      unitId: airSystems.unitId,
      outletId: outlets.outletId,
      rawRowJson: outlets.rawRowJson,
    })
    .from(findings)
    .leftJoin(airSystems, eq(findings.airSystemId, airSystems.id))
    .leftJoin(outlets, eq(findings.outletId, outlets.id))
    .where(eq(findings.projectId, input.projectId));
  const reviewed: ReviewedFinding[] = previousFindingRows
    .filter(
      (row): row is typeof row & {
        status: "acknowledged" | "resolved";
      } => row.status !== "open",
    )
    .map((row) => ({
      primaryKey: reviewPrimaryKey(row),
      sourceLocation: sourceLocation(row.rawRowJson),
      status: row.status,
      resolutionNote: row.resolutionNote,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt,
    }));
  const previousFindingPopulation: ReviewMatchCandidate[] =
    previousFindingRows.map((row) => ({
      primaryKey: reviewPrimaryKey(row),
      sourceLocation: sourceLocation(row.rawRowJson),
    }));

  const missingUnitRows = input.rows
    .filter((row) => row.unit_id.trim() === "")
    .map((row) => `${row.__sourceSheet || "worksheet"} row ${row.__rowNumber}`);
  if (missingUnitRows.length > 0) {
    throw new Error(
      `Every outlet needs an air system/unit. Check ${missingUnitRows
        .slice(0, 3)
        .join(", ")}${missingUnitRows.length > 3 ? ", and additional rows" : ""}.`,
    );
  }

  const grouped = new Map<
    string,
    { unitId: string; rows: MappedRow[] }
  >();
  for (const row of input.rows) {
    const unitId = row.unit_id.trim();
    const key = unitId.toLocaleLowerCase();
    const group = grouped.get(key) ?? { unitId, rows: [] };
    group.rows.push(row);
    grouped.set(key, group);
  }

  const batchId = crypto.randomUUID();
  const importedAt = new Date().toISOString();
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    // A new workbook is the project's current working dataset. Immutable report
    // snapshots intentionally remain untouched.
    db.delete(findings)
      .where(eq(findings.projectId, input.projectId))
      .run();
    db.delete(airSystems)
      .where(eq(airSystems.projectId, input.projectId))
      .run();
    db.delete(importBatches)
      .where(eq(importBatches.projectId, input.projectId))
      .run();

    db.insert(importBatches)
      .values({
        id: batchId,
        projectId: input.projectId,
        filename: input.filename,
        sheetName: input.sheetName,
        mappingJson: JSON.stringify(input.mapping),
        importedAt,
      })
      .run();

    for (const { unitId, rows } of grouped.values()) {
      const systemId = crypto.randomUUID();
      const designTotal = rows.reduce((sum, row) => {
        const value = numericValue(row.design_cfm);
        return value !== null && value > 0 ? sum + value : sum;
      }, 0);
      db.insert(airSystems)
        .values({
          id: systemId,
          projectId: input.projectId,
          unitId,
          description: `${unitId} air outlet test`,
          designTotalCfm: designTotal || null,
        })
        .run();

      db.insert(outlets)
        .values(
          rows.map((row) => ({
            id: crypto.randomUUID(),
            airSystemId: systemId,
            importBatchId: batchId,
            outletId: row.outlet_id || null,
            areaServed: row.area_served || null,
            outletType: row.outlet_type || null,
            size: row.size || null,
            designCfm: row.design_cfm || null,
            finalCfm: row.final_cfm || null,
            instrumentName: row.instrument_name || null,
            technician: row.technician || null,
            testDate: row.test_date || null,
            remarks: row.remarks || null,
            rawRowJson: JSON.stringify({
              ...row.__raw,
              __rowNumber: row.__rowNumber,
              __sourceSheet: row.__sourceSheet,
              __mappedFields: row.__mappedFields,
            }),
          })),
        )
        .run();
    }

    await runChecks(input.projectId);
    if (reviewed.length > 0) {
      const freshFindingRows = await db
        .select({
          id: findings.id,
          ruleId: findings.ruleId,
          ruleVersion: findings.ruleVersion,
          inputsJson: findings.inputsJson,
          status: findings.status,
          unitId: airSystems.unitId,
          outletId: outlets.outletId,
          rawRowJson: outlets.rawRowJson,
        })
        .from(findings)
        .leftJoin(airSystems, eq(findings.airSystemId, airSystems.id))
        .leftJoin(outlets, eq(findings.outletId, outlets.id))
        .where(eq(findings.projectId, input.projectId));
      const freshFindingPopulation = freshFindingRows.map((fresh) => ({
        ...fresh,
        primaryKey: reviewPrimaryKey(fresh),
        sourceLocation: sourceLocation(fresh.rawRowJson),
      }));
      const freshOpen = freshFindingPopulation.filter(
        (fresh) => fresh.status === "open",
      );
      const reviewMatches = matchReviewCandidates(
        reviewed,
        freshOpen,
        previousFindingPopulation,
        freshFindingPopulation,
      );
      for (const match of reviewMatches) {
        const previous = reviewed[match.previousIndex];
        const fresh = freshOpen[match.freshIndex];
        await db
          .update(findings)
          .set({
            status: previous.status,
            resolutionNote: previous.resolutionNote,
            resolvedBy: previous.resolvedBy,
            resolvedAt: previous.resolvedAt,
          })
          .where(eq(findings.id, fresh.id));
      }
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  return { batchId, outletCount: input.rows.length };
}
