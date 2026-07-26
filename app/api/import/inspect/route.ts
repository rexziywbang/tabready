import { NextResponse } from "next/server";
import { inspectWorkbook } from "@/src/import/parse";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Choose an Excel workbook to continue." },
        { status: 400 },
      );
    }
    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "TABReady accepts .xlsx workbooks for this demo." },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "The workbook must be smaller than 10 MB." },
        { status: 400 },
      );
    }
    const workbook = inspectWorkbook(await file.arrayBuffer());
    if (workbook.sheets.length === 0) {
      return NextResponse.json(
        { error: "No worksheets were found in this workbook." },
        { status: 400 },
      );
    }
    return NextResponse.json({ filename: file.name, ...workbook });
  } catch {
    return NextResponse.json(
      { error: "The workbook could not be read. Confirm that it is a valid .xlsx file." },
      { status: 400 },
    );
  }
}
