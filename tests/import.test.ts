import { describe, expect, it } from "vitest";
import {
  detectHeaderRow,
  headersAt,
  mapRows,
  validatePreviewCell,
} from "@/src/import/parse";
import {
  normalizeHeader,
  REQUIRED_FIELDS,
  suggestMapping,
} from "@/src/import/suggest";

describe("Excel header mapping", () => {
  const rows = [
    ["Synthetic workbook title"],
    [
      "AHU / Unit",
      "Diffuser #",
      "Area",
      "Dsn CFM",
      "Final",
      "Meter",
      "Tested By",
      "Date Tested",
    ],
    ["AHU-1", "A-01", "Exam 101", 100, 98, "Flow Hood FH-1", "Jordan Lee", "2026-06-10"],
  ];

  it("auto-detects a title row followed by headers", () => {
    expect(detectHeaderRow(rows)).toBe(1);
  });

  it("normalizes punctuation, spacing, and number symbols", () => {
    expect(normalizeHeader("  Diffuser # ")).toBe("diffuser number");
  });

  it("suggests all required mappings from imperfect headers", () => {
    const mapping = suggestMapping(headersAt(rows, 1));
    expect(REQUIRED_FIELDS.every((field) => Boolean(mapping[field]))).toBe(true);
    expect(mapping).toMatchObject({
      unit_id: "AHU / Unit",
      outlet_id: "Diffuser #",
      design_cfm: "Dsn CFM",
      final_cfm: "Final",
      instrument_name: "Meter",
      technician: "Tested By",
      test_date: "Date Tested",
    });
  });

  it("maps rows while retaining original cells and row number", () => {
    const mapping = suggestMapping(headersAt(rows, 1));
    const [mapped] = mapRows(rows, 1, mapping);
    expect(mapped).toMatchObject({
      __rowNumber: 3,
      unit_id: "AHU-1",
      outlet_id: "A-01",
      design_cfm: "100",
      final_cfm: "98",
    });
    expect(mapped.__raw["Diffuser #"]).toBe("A-01");
  });

  it("marks missing review evidence amber and invalid readings red", () => {
    expect(validatePreviewCell("instrument_name", "")).toBe("warning");
    expect(validatePreviewCell("final_cfm", "0")).toBe("error");
    expect(validatePreviewCell("design_cfm", "100")).toBe("valid");
  });
});
