import { NextResponse } from "next/server";
import { z } from "zod";
import { commitImport } from "@/src/import/commit";
import {
  headersAt,
  inferUnitId,
  inspectWorkbook,
  mapRows,
} from "@/src/import/parse";
import {
  CanonicalField,
  REQUIRED_FIELDS,
} from "@/src/import/suggest";

export const runtime = "nodejs";

const mappingSchema = z.object({
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
});

const configSchema = z.object({
  sheets: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        headerRow: z.number().int().nonnegative(),
        mapping: mappingSchema,
      }),
    )
    .min(1),
});

const CORE_FIELDS: CanonicalField[] = [
  "outlet_id",
  "design_cfm",
  "final_cfm",
];

function importError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    const configValue = formData.get("config");
    if (!(file instanceof File)) {
      return importError("Choose the original .xlsx workbook again.");
    }
    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      return importError("TABReady commits original .xlsx workbooks only.");
    }
    if (file.size > 10 * 1024 * 1024) {
      return importError("The workbook must be smaller than 10 MB.");
    }
    if (typeof configValue !== "string") {
      return importError("The worksheet mapping configuration is missing.");
    }
    const config = configSchema.parse(JSON.parse(configValue));
    if (
      new Set(config.sheets.map((sheet) => sheet.name)).size !==
      config.sheets.length
    ) {
      return importError("Each worksheet can only be included once.");
    }

    const workbook = inspectWorkbook(await file.arrayBuffer());
    const rows = config.sheets.flatMap((plan) => {
      const sheet = workbook.sheets.find(
        (candidate) => candidate.name === plan.name,
      );
      if (!sheet) {
        throw new Error(`Worksheet '${plan.name}' was not found in the workbook.`);
      }
      if (!sheet.compatible) {
        throw new Error(
          `Worksheet '${plan.name}' is not a compatible airside outlet table.`,
        );
      }
      if (plan.headerRow >= sheet.rows.length) {
        throw new Error(`Header row for '${plan.name}' is outside the worksheet.`);
      }
      const headers = headersAt(sheet.rows, plan.headerRow);
      const mappedHeaders = Object.values(plan.mapping).filter(
        (header): header is string => Boolean(header),
      );
      if (mappedHeaders.some((header) => !headers.includes(header))) {
        throw new Error(
          `A mapped column for '${plan.name}' does not exist on the selected header row.`,
        );
      }
      if (new Set(mappedHeaders).size !== mappedHeaders.length) {
        throw new Error(
          `Map each '${plan.name}' column to no more than one TABReady field.`,
        );
      }
      const inferredUnitId = inferUnitId(
        sheet.name,
        sheet.rows,
        plan.headerRow,
      );
      const missing = REQUIRED_FIELDS.filter((field) => {
        if (field === "unit_id") {
          return !plan.mapping.unit_id && !inferredUnitId;
        }
        return !plan.mapping[field];
      });
      if (missing.length > 0) {
        throw new Error(
          `Worksheet '${plan.name}' is missing required mappings: ${missing.join(", ")}.`,
        );
      }
      const mappedSheetRows = mapRows(
        sheet.rows,
        plan.headerRow,
        plan.mapping,
        {
          defaultUnitId: inferredUnitId,
          sourceSheet: sheet.name,
        },
      );
      if (mappedSheetRows.length === 0) {
        throw new Error(
          `Worksheet '${plan.name}' has no outlet data rows with the confirmed header and mapping.`,
        );
      }
      return mappedSheetRows;
    });
    if (rows.length === 0) {
      return importError("No outlet data rows were found with these mappings.");
    }
    if (rows.length > 10_000) {
      return importError("The import exceeds the 10,000-row limit.");
    }
    const missingCoreMapping = rows.some((row) =>
      CORE_FIELDS.some((field) => !row.__mappedFields.includes(field)),
    );
    if (missingCoreMapping) {
      return importError(
        "Every included airside section must map outlet ID, design CFM, and final CFM columns.",
      );
    }

    const result = await commitImport({
      projectId: id,
      filename: file.name,
      sheetName: config.sheets.map((sheet) => sheet.name).join(", "),
      mapping: config.sheets[0].mapping,
      rows,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return importError("The worksheet mapping configuration is malformed.");
    }
    const message = error instanceof Error ? error.message : "";
    const safe =
      message === "No data rows were found." ||
      message === "Project not found." ||
      message.startsWith("Every outlet needs an air system/unit.") ||
      message.startsWith("Worksheet '") ||
      message.startsWith("Header row for '") ||
      message.startsWith("A mapped column for '") ||
      message.startsWith("Map each '");
    return importError(
      safe
        ? message
        : "The import could not be committed. Review the mapping and try again.",
    );
  }
}
