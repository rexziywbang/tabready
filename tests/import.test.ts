import { describe, expect, it } from "vitest";
import {
  analyzeSheet,
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
    expect(validatePreviewCell("final_cfm", "0", undefined, "Damper closed")).toBe(
      "valid",
    );
    expect(validatePreviewCell("final_cfm", "NOTE")).toBe("valid");
    expect(validatePreviewCell("final_cfm", "1,200 CFM")).toBe("valid");
    expect(validatePreviewCell("design_cfm", "100")).toBe("valid");
  });

  it("does not warn for evidence columns that were not mapped", () => {
    expect(
      validatePreviewCell(
        "instrument_name",
        "",
        ["unit_id", "outlet_id", "design_cfm", "final_cfm"],
      ),
    ).toBe("valid");
  });

  it("does not claim room numbers as outlet IDs or a generic By column as technician", () => {
    expect(
      suggestMapping([
        "Room Number",
        "System Number",
        "Design Airflow",
        "Actual Airflow",
        "Actual RPM",
        "Date",
        "By",
      ]),
    ).toMatchObject({
      unit_id: "System Number",
      area_served: "Room Number",
      design_cfm: "Design Airflow",
      final_cfm: "Actual Airflow",
      test_date: "Date",
    });
    expect(
      suggestMapping(["Room Number", "System Number", "By"]).outlet_id,
    ).toBeUndefined();
    expect(
      suggestMapping(["Room Number", "System Number", "By"]).technician,
    ).toBeUndefined();
    expect(suggestMapping(["Outlet Type", "Design GPM", "Final GPM"])).toEqual({
      outlet_type: "Outlet Type",
    });
  });

  it("keeps duplicate headings and blank spacer columns tied to physical columns", () => {
    const duplicateHeaders = [
      ["Unit", "Outlet ID", "Design", "", "Design", "Final"],
      ["AHU-7", "S-1", 75, "", 100, 98],
    ];
    expect(headersAt(duplicateHeaders, 0)).toEqual([
      "Unit",
      "Outlet ID",
      "Design",
      "Design (2)",
      "Final",
    ]);
    const [mapped] = mapRows(duplicateHeaders, 0, {
      unit_id: "Unit",
      outlet_id: "Outlet ID",
      design_cfm: "Design (2)",
      final_cfm: "Final",
    });
    expect(mapped.design_cfm).toBe("100");
    expect(mapped.__raw["Design (2)"]).toBe(100);
  });
});

describe("real TAB workbook structure", () => {
  const outletRows = [
    ["VAV-1.02 Air Outlet Test Report"],
    ["Outlet", "", "Duct", "", "Area", "Factor", "CFM", "", ""],
    [
      "Number",
      "Type",
      "Dimensions",
      "",
      "",
      "",
      "Design",
      "Preliminary",
      "Final",
    ],
    ["1", "Supply grille", "12×12", "", "Lobby", "1.0", 400, "NOTE", "NOTE"],
    [
      "Outlet Number",
      "Outlet Type",
      "Duct Dimensions",
      "",
      "Area",
      "Factor",
      "CFM Design",
      "CFM Preliminary",
      "CFM Final",
    ],
    ["2", "Supply grille", "12×12", "", "Office", "1.0", 500, 490, 495],
    ["Totals", "", "", "", "", "", 900, 490, 495],
  ];

  it("combines two-level headings and derives the unit from the title", () => {
    const analysis = analyzeSheet("VAV outlets", outletRows);
    expect(analysis.suggestedHeaderRow).toBe(2);
    expect(analysis.inferredUnitId).toBe("VAV-1.02");
    expect(analysis.compatible).toBe(true);
    expect(analysis.suggestedMapping).toMatchObject({
      outlet_id: "Outlet Number",
      design_cfm: "CFM Design",
      final_cfm: "CFM Final",
    });
  });

  it("keeps documented NOTE readings but skips repeated headers and totals", () => {
    const analysis = analyzeSheet("VAV outlets", outletRows);
    const mapped = mapRows(
      outletRows,
      analysis.suggestedHeaderRow,
      analysis.suggestedMapping,
      {
        defaultUnitId: analysis.inferredUnitId,
        sourceSheet: "VAV outlets",
      },
    );
    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({
      unit_id: "VAV-1.02",
      outlet_id: "1",
      design_cfm: "400",
      final_cfm: "NOTE",
      __sourceSheet: "VAV outlets",
    });
    expect(mapped[1].outlet_id).toBe("2");
  });

  it("keeps an all-text outlet row with documented non-reading markers", () => {
    const rows = [
      ["AHU-1 Air Outlet Report"],
      ["Outlet ID", "Type", "Design CFM", "Final CFM"],
      ["S-1", "Supply", "NOTE", "N/A"],
      ["S-2", "Supply", 120, 118],
    ];
    const analysis = analyzeSheet("AHU-1 outlets", rows);
    const mapped = mapRows(
      rows,
      analysis.suggestedHeaderRow,
      analysis.suggestedMapping,
      { defaultUnitId: analysis.inferredUnitId },
    );
    expect(mapped.map((row) => row.outlet_id)).toEqual(["S-1", "S-2"]);
  });

  it("excludes hydronic schedules from all-compatible outlet imports", () => {
    const hydronic = analyzeSheet("Autoflow Valves", [
      ["Hydronic Autoflow Valve Report"],
      ["Valve", "Design GPM", "Final GPM", "Pressure PSI"],
      ["AV-1", 3.5, 3.4, 4.2],
    ]);
    expect(hydronic.compatible).toBe(false);
    expect(hydronic.incompatibilityReasons.join(" ")).toContain(
      "No airside outlet/CFM table detected",
    );
  });

  it("carries a merged system label into continuation outlet rows", () => {
    const continuationRows = [
      ["Unit", "Outlet ID", "Design CFM", "Final CFM"],
      ["AHU-5", "", "", ""],
      ["", "S-1", 100, 98],
      ["", "S-2", 120, 121],
    ];
    const mapping = suggestMapping(headersAt(continuationRows, 0));
    const mapped = mapRows(continuationRows, 0, mapping);
    expect(mapped.map((row) => row.unit_id)).toEqual(["AHU-5", "AHU-5"]);
  });

  it("finds an outlet header after a long project-information block", () => {
    const lateHeader = [
      ...Array.from({ length: 45 }, (_, index) => [
        `Project information ${index + 1}`,
        "Reviewed",
        "Issued",
      ]),
      ["Unit", "Outlet ID", "Design CFM", "Final CFM"],
      ["AHU-1", "S-1", 100, 99],
    ];
    expect(detectHeaderRow(lateHeader)).toBe(45);
  });

  it("derives a unit from a title near a late header", () => {
    const lateTitle = [
      ...Array.from({ length: 44 }, (_, index) => [
        `Project information ${index + 1}`,
      ]),
      ["AHU-9 Air Outlet Test Report"],
      ["Outlet ID", "Design CFM", "Final CFM"],
      ["S-1", 100, 99],
    ];
    const analysis = analyzeSheet("Outlet Summary", lateTitle);
    expect(analysis.suggestedHeaderRow).toBe(45);
    expect(analysis.inferredUnitId).toBe("AHU-9");
    expect(analysis.compatible).toBe(true);
  });

  it("switches between airside sections and skips an intervening hydronic table", () => {
    const mixed = [
      ["AHU-1 Air Outlet Report"],
      ["Outlet ID", "Type", "Design CFM", "Final CFM"],
      ["S-1", "Supply", 100, 98],
      ["Hydronic valve schedule"],
      ["Valve", "Type", "Design GPM", "Final GPM"],
      ["AV-1", "Autoflow", 3.5, 3.4],
      ["VAV-2.03 Air Outlet Test Report"],
      ["Outlet No", "Type", "Design CFM", "Actual CFM"],
      ["D-1", "Diffuser", 200, 195],
    ];
    const analysis = analyzeSheet("Mixed TAB forms", mixed);
    const mapped = mapRows(
      mixed,
      analysis.suggestedHeaderRow,
      analysis.suggestedMapping,
      {
        defaultUnitId: analysis.inferredUnitId,
        sourceSheet: "Mixed TAB forms",
      },
    );
    expect(mapped.map((row) => row.outlet_id)).toEqual(["S-1", "D-1"]);
    expect(mapped.map((row) => row.unit_id)).toEqual(["AHU-1", "VAV-2.03"]);
  });

  it("does not mistake numeric outlet rows for section headers or unit titles", () => {
    const trickyRows = [
      ["Unit", "Outlet ID", "Area", "Type", "Design CFM", "Final CFM"],
      ["AHU-1", "VAV-2.03", "Design Office", "Diffuser", 100, 98],
      ["", "S-2", "Lobby", "Diffuser", 120, 119],
    ];
    const mapping = suggestMapping(headersAt(trickyRows, 0));
    const mapped = mapRows(trickyRows, 0, mapping);
    expect(mapped.map((row) => row.outlet_id)).toEqual(["VAV-2.03", "S-2"]);
    expect(mapped.map((row) => row.unit_id)).toEqual(["AHU-1", "AHU-1"]);
  });

  it("does not treat an all-text VAV outlet row as a new unit title", () => {
    const rows = [
      ["Unit", "Outlet ID", "Design CFM", "Final CFM"],
      ["AHU-1", "S-1", 100, 98],
      ["", "VAV-2.03", "NOTE", "NOTE"],
      ["", "S-3", 120, 119],
    ];
    const mapping = suggestMapping(headersAt(rows, 0));
    const mapped = mapRows(rows, 0, mapping);
    expect(mapped.map((row) => row.outlet_id)).toEqual([
      "S-1",
      "VAV-2.03",
      "S-3",
    ]);
    expect(mapped.map((row) => row.unit_id)).toEqual([
      "AHU-1",
      "AHU-1",
      "AHU-1",
    ]);
  });

  it("does not let totals overwrite a carried unit ID", () => {
    const rows = [
      ["Unit", "Outlet ID", "Design CFM", "Final CFM"],
      ["AHU-1", "S-1", 100, 98],
      ["Totals", "", 100, 98],
      ["", "S-2", 120, 119],
      ["", "Total CFM", 220, 217],
      ["", "Total Supply", 220, 217],
    ];
    const mapping = suggestMapping(headersAt(rows, 0));
    const mapped = mapRows(rows, 0, mapping);
    expect(mapped.map((row) => row.outlet_id)).toEqual(["S-1", "S-2"]);
    expect(mapped.map((row) => row.unit_id)).toEqual(["AHU-1", "AHU-1"]);
  });

  it("prioritizes the actual outlet header over label/value metadata", () => {
    const rows = [
      ["Air Outlet Test Report"],
      ["Unit", "AHU-1", "Design CFM", "100", "Final CFM", "98"],
      ["Outlet ID", "Design CFM", "Final CFM"],
      ["S-1", 100, 98],
    ];
    expect(detectHeaderRow(rows)).toBe(2);
    expect(analyzeSheet("AHU-1 report", rows).compatible).toBe(true);
  });

  it("requires explicit airflow evidence for generic design/final tables", () => {
    expect(
      analyzeSheet("VAV-1 Heating Water Valve", [
        ["Terminal", "Design", "Final"],
        ["TV-1", 3.5, 3.4],
      ]).compatible,
    ).toBe(false);
    expect(
      analyzeSheet("AHU-1 Electrical Outlet Schedule", [
        ["Outlet ID", "Design", "Final"],
        ["EO-1", 20, 18],
      ]).compatible,
    ).toBe(false);
  });
});
