import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const headers = [
  "AHU / Unit",
  "Diffuser #",
  "Area Served",
  "Terminal Type",
  "Neck Size",
  "Dsn CFM",
  "Final",
  "Meter",
  "Tested By",
  "Date Tested",
  "Remarks",
];

const areas = [
  "Exam 101",
  "Exam 102",
  "Exam 103",
  "Nurse Station",
  "OR Corridor",
  "Waiting",
  "Reception",
  "Clean Supply",
  "Soiled Utility",
  "Procedure 201",
  "Procedure 202",
  "Staff Lounge",
  "Pharmacy",
  "Lab",
  "Imaging",
];
const designs = [75, 100, 125, 150, 200, 250, 300, 350, 400, 500, 600, 800];

interface DemoRow {
  unit: string;
  outletId: string;
  area: string;
  type: string;
  size: string;
  design: number;
  final: number;
  meter: string;
  tech: string;
  date: string;
  remarks: string;
}

function baseRows(unit: string, count: number, offset: number): DemoRow[] {
  return Array.from({ length: count }, (_, index) => {
    const design = designs[(index + offset) % designs.length];
    return {
      unit,
      outletId: `${unit}-${String(index + 1).padStart(2, "0")}`,
      area: areas[(index + offset) % areas.length],
      type: index % 3 === 0 ? "Supply diffuser" : index % 3 === 1 ? "Return grille" : "Slot diffuser",
      size: index % 2 === 0 ? "12×12" : "10×10",
      design,
      final: design,
      meter: index % 5 === 0 ? "Anemometer AN-1" : "Flow Hood FH-1",
      tech: index % 2 === 0 ? "Jordan Lee" : "Casey Morgan",
      date: `2026-06-${String(10 + (index % 12)).padStart(2, "0")}`,
      remarks: "",
    };
  });
}

const ahu1 = baseRows("AHU-1", 32, 0);
const ahu2 = baseRows("AHU-2", 28, 4);
const rows = [...ahu1, ...ahu2];

ahu1.forEach((row, index) => {
  row.final = Math.round(row.design * (index % 2 === 0 ? 0.99 : 1.01));
});
ahu1[5].final = Math.round(ahu1[5].design * 1.15);
ahu1[19].final = Math.round(ahu1[19].design * 0.88);
const targetAhu1Total =
  ahu1.reduce((sum, row) => sum + row.design, 0) * 0.94;
const fixedAhu1Total = ahu1[5].final + ahu1[19].final;
const regularAhu1Design = ahu1.reduce(
  (sum, row, index) => (index === 5 || index === 19 ? sum : sum + row.design),
  0,
);
const regularAhu1Factor =
  (targetAhu1Total - fixedAhu1Total) / regularAhu1Design;
ahu1.forEach((row, index) => {
  if (index !== 5 && index !== 19) {
    row.final = Math.round(row.design * regularAhu1Factor);
  }
});

const targetAhu2Total =
  ahu2.reduce((sum, row) => sum + row.design, 0) * 0.92;
const specialOutlierIndex = 8;
const zeroIndex = 23;
const specialTotal = ahu2[specialOutlierIndex].design * 1.11;
const regularDesignTotal = ahu2.reduce(
  (sum, row, index) =>
    index === specialOutlierIndex || index === zeroIndex
      ? sum
      : sum + row.design,
  0,
);
const regularFactor = (targetAhu2Total - specialTotal) / regularDesignTotal;
ahu2.forEach((row, index) => {
  if (index === specialOutlierIndex) row.final = Math.round(row.design * 1.11);
  else if (index === zeroIndex) row.final = 0;
  else row.final = Math.round(row.design * regularFactor);
});

rows[2].meter = "";
rows[33].meter = "";
[7, 16, 36, 48].forEach((index) => {
  rows[index].meter = "Flow Hood FH-2";
});
rows[50].meter = "Flow Hood #3";
[9, 38, 52].forEach((index) => {
  rows[index].date = "";
});
[12, 44].forEach((index) => {
  rows[index].tech = "";
});
ahu2[14].outletId = ahu2[13].outletId;

function worksheet(source: DemoRow[]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([
    ["TABReady synthetic demonstration workbook — fictional data only"],
    headers,
    ...source.map((row) => [
      row.unit,
      row.outletId,
      row.area,
      row.type,
      row.size,
      row.design,
      row.final,
      row.meter,
      row.tech,
      row.date,
      row.remarks,
    ]),
  ]);
}

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet(ahu1), "AHU-1 Outlets");
XLSX.utils.book_append_sheet(workbook, worksheet(ahu2), "AHU-2 Outlets");
workbook.Props = {
  Title: "Riverside Medical Office Building — Fictional TABReady Demo",
  Subject: "Synthetic HVAC TAB outlet readings for product demonstration",
  Author: "TABReady",
};

const outputDirectory = path.join(process.cwd(), "fixtures");
fs.mkdirSync(outputDirectory, { recursive: true });
const outputPath = path.join(outputDirectory, "riverside_medical.xlsx");
XLSX.writeFile(workbook, outputPath);
console.log(`Generated ${outputPath} with 60 fictional outlet rows.`);
