import { eq } from "drizzle-orm";
import { db } from "@/src/db/client";
import {
  airSystems,
  importBatches,
  outlets,
} from "@/src/db/schema";
import { runChecks } from "@/src/rules/engine";
import { MappedRow } from "./parse";
import { ColumnMapping } from "./suggest";

export async function commitImport(input: {
  projectId: string;
  filename: string;
  sheetName: string;
  mapping: ColumnMapping;
  rows: MappedRow[];
}): Promise<{ batchId: string; outletCount: number }> {
  if (input.rows.length === 0) throw new Error("No data rows were found.");
  const batchId = crypto.randomUUID();
  const importedAt = new Date().toISOString();

  await db.insert(importBatches).values({
    id: batchId,
    projectId: input.projectId,
    filename: input.filename,
    sheetName: input.sheetName,
    mappingJson: JSON.stringify(input.mapping),
    importedAt,
  });

  const grouped = new Map<string, MappedRow[]>();
  for (const row of input.rows) {
    const key = row.unit_id.trim();
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  for (const [unitId, rows] of grouped) {
    if (!unitId) continue;
    const [existingSystem] = await db
      .select()
      .from(airSystems)
      .where(eq(airSystems.projectId, input.projectId))
      .then((systems) =>
        systems.filter(
          (system) =>
            system.unitId.trim().toLocaleLowerCase() ===
            unitId.toLocaleLowerCase(),
        ),
      );
    const systemId = existingSystem?.id ?? crypto.randomUUID();
    const designTotal = rows.reduce((sum, row) => {
      const value = Number(row.design_cfm);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);

    if (existingSystem) {
      await db
        .update(airSystems)
        .set({
          designTotalCfm:
            (existingSystem.designTotalCfm ?? 0) + designTotal || null,
        })
        .where(eq(airSystems.id, systemId));
    } else {
      await db.insert(airSystems).values({
        id: systemId,
        projectId: input.projectId,
        unitId,
        description: `${unitId} air outlet test`,
        designTotalCfm: designTotal || null,
      });
    }

    await db.insert(outlets).values(
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
        }),
      })),
    );
  }

  await runChecks(input.projectId);
  return { batchId, outletCount: input.rows.length };
}
