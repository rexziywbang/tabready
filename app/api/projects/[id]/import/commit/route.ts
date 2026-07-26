import { NextResponse } from "next/server";
import { z } from "zod";
import { commitImport } from "@/src/import/commit";
import { REQUIRED_FIELDS } from "@/src/import/suggest";

export const runtime = "nodejs";

const cellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const rowSchema = z.object({
  __rowNumber: z.number().int().positive(),
  __raw: z.record(z.string(), cellSchema),
  unit_id: z.string(),
  outlet_id: z.string(),
  area_served: z.string(),
  outlet_type: z.string(),
  size: z.string(),
  design_cfm: z.string(),
  final_cfm: z.string(),
  instrument_name: z.string(),
  technician: z.string(),
  test_date: z.string(),
  remarks: z.string(),
});

const payloadSchema = z.object({
  filename: z.string().trim().min(1),
  sheetName: z.string().trim().min(1),
  mapping: z.object({
    unit_id: z.string().optional(),
    outlet_id: z.string().optional(),
    area_served: z.string().optional(),
    outlet_type: z.string().optional(),
    size: z.string().optional(),
    design_cfm: z.string().optional(),
    final_cfm: z.string().optional(),
    instrument_name: z.string().optional(),
    technician: z.string().optional(),
    test_date: z.string().optional(),
    remarks: z.string().optional(),
  }),
  rows: z.array(rowSchema).min(1).max(10_000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = payloadSchema.parse(await request.json());
    const missing = REQUIRED_FIELDS.filter((field) => !payload.mapping[field]);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Map every required field before importing: ${missing.join(", ")}.`,
        },
        { status: 400 },
      );
    }
    const result = await commitImport({
      projectId: id,
      filename: payload.filename,
      sheetName: payload.sheetName,
      mapping: payload.mapping,
      rows: payload.rows,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error && error.message === "No data rows were found."
        ? error.message
        : "The import could not be committed. Review the mapping and try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
