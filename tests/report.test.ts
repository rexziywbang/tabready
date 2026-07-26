import { describe, expect, it } from "vitest";
import { cloneSnapshot, ReportSnapshot } from "@/src/report/assemble";

describe("report snapshot integrity", () => {
  it("keeps a frozen report unchanged when live-like source data changes", () => {
    const source: ReportSnapshot = {
      schemaVersion: "1",
      frozenAt: "2026-07-26T00:00:00.000Z",
      project: {
        id: "project-1",
        name: "Fictional demo",
        clientName: "Synthetic client",
        tolerancePct: 10,
      },
      systems: [
        {
          id: "system-1",
          unitId: "AHU-1",
          description: "Supply",
          designTotalCfm: 100,
          outlets: [
            {
              id: "outlet-1",
              outletId: "A-01",
              areaServed: "Exam 101",
              outletType: "Supply diffuser",
              size: "12×12",
              designCfm: "100",
              finalCfm: "98",
              instrumentName: "Flow Hood FH-1",
              technician: "Jordan Lee",
              testDate: "2026-06-10",
              remarks: null,
              rawRowJson: "{}",
            },
          ],
        },
      ],
      instruments: [],
      findings: [],
    };
    const frozen = cloneSnapshot(source);
    source.systems[0].outlets[0].finalCfm = "120";
    source.project.name = "Changed live project";
    expect(frozen.systems[0].outlets[0].finalCfm).toBe("98");
    expect(frozen.project.name).toBe("Fictional demo");
  });
});
