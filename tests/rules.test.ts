import { describe, expect, it } from "vitest";
import { checkDuplicateOutletId } from "@/src/rules/checks/duplicate-outlet-id";
import { checkExpiredCalibration } from "@/src/rules/checks/expired-calibration";
import { checkInvalidValue } from "@/src/rules/checks/invalid-value";
import { checkMissingDesignValue } from "@/src/rules/checks/missing-design-value";
import { checkMissingInstrument } from "@/src/rules/checks/missing-instrument";
import { checkMissingMeasuredValue } from "@/src/rules/checks/missing-measured-value";
import { checkMissingOutletId } from "@/src/rules/checks/missing-outlet-id";
import { checkMissingTechnician } from "@/src/rules/checks/missing-technician";
import { checkMissingTestDate } from "@/src/rules/checks/missing-test-date";
import { checkOutOfTolerance } from "@/src/rules/checks/out-of-tolerance";
import { checkSystemTotalMismatch } from "@/src/rules/checks/system-total-mismatch";
import { checkUnknownInstrument } from "@/src/rules/checks/unknown-instrument";
import { filterNewFindings, runReadinessChecks } from "@/src/rules/engine";
import {
  FindingDraft,
  RULES_VERSION,
  RuleInstrument,
  RuleOutlet,
  RuleSystem,
  stableJson,
} from "@/src/rules/types";

function outlet(overrides: Partial<RuleOutlet> = {}): RuleOutlet {
  return {
    id: "outlet-1",
    airSystemId: "system-1",
    rowNumber: 2,
    unitId: "AHU-1",
    outletId: "AHU-1-01",
    designCfm: 100,
    finalCfm: 100,
    instrumentName: "Flow Hood FH-1",
    technician: "Jordan Lee",
    testDate: "2026-06-10",
    ...overrides,
  };
}

function system(
  overrides: Partial<RuleSystem> = {},
  systemOutlets = [outlet()],
): RuleSystem {
  return {
    id: "system-1",
    unitId: "AHU-1",
    designTotalCfm: 100,
    outlets: systemOutlets,
    ...overrides,
  };
}

const registry: RuleInstrument[] = [
  {
    name: "Flow Hood FH-1",
    calibrationDate: "2026-01-15",
    calibrationIntervalMonths: 12,
  },
];

describe("missing_outlet_id", () => {
  it("fires for an empty outlet ID", () => {
    expect(checkMissingOutletId([outlet({ outletId: " " })])).toHaveLength(1);
  });
  it("does not fire when an ID is present", () => {
    expect(checkMissingOutletId([outlet()])).toHaveLength(0);
  });
});

describe("duplicate_outlet_id", () => {
  it("fires for each duplicate within one air system", () => {
    const duplicate = outlet({ id: "outlet-2", rowNumber: 3 });
    expect(checkDuplicateOutletId([system({}, [outlet(), duplicate])])).toHaveLength(2);
  });
  it("does not compare IDs across air systems", () => {
    expect(
      checkDuplicateOutletId([
        system(),
        system(
          { id: "system-2", unitId: "AHU-2" },
          [
            outlet({
              id: "outlet-2",
              airSystemId: "system-2",
              unitId: "AHU-2",
            }),
          ],
        ),
      ]),
    ).toHaveLength(0);
  });
});

describe("missing_design_value", () => {
  it("fires for a blank design value", () => {
    expect(checkMissingDesignValue([outlet({ designCfm: "" })])).toHaveLength(1);
  });
  it("does not fire for zero because invalid_value owns that case", () => {
    expect(checkMissingDesignValue([outlet({ designCfm: 0 })])).toHaveLength(0);
  });
});

describe("missing_measured_value", () => {
  it("fires for a null measured value", () => {
    expect(checkMissingMeasuredValue([outlet({ finalCfm: null })])).toHaveLength(1);
  });
  it("does not fire for a recorded value", () => {
    expect(checkMissingMeasuredValue([outlet({ finalCfm: 98 })])).toHaveLength(0);
  });
});

describe("invalid_value", () => {
  it("fires for non-numeric, negative, and zero values", () => {
    expect(
      checkInvalidValue([
        outlet({ designCfm: "not a number" }),
        outlet({ id: "outlet-2", finalCfm: -1 }),
        outlet({ id: "outlet-3", finalCfm: 0 }),
      ]),
    ).toHaveLength(3);
  });
  it("does not fire for positive numbers or blanks", () => {
    expect(
      checkInvalidValue([
        outlet(),
        outlet({ id: "outlet-2", finalCfm: "" }),
      ]),
    ).toHaveLength(0);
  });
});

describe("out_of_tolerance", () => {
  it("fires beyond the configured boundary", () => {
    const [finding] = checkOutOfTolerance([outlet({ finalCfm: 115 })], 10);
    expect(finding.message).toContain("115.0% of design");
  });
  it("does not fire at exactly +10.0%", () => {
    expect(checkOutOfTolerance([outlet({ finalCfm: 110 })], 10)).toHaveLength(0);
  });
  it("does not fire at exactly -10.0% despite floating-point representation", () => {
    expect(checkOutOfTolerance([outlet({ finalCfm: 90 })], 10)).toHaveLength(0);
  });
});

describe("system_total_mismatch", () => {
  it("fires when the measured total is more than 5% off", () => {
    expect(
      checkSystemTotalMismatch([
        system({ designTotalCfm: 100 }, [outlet({ finalCfm: 94 })]),
      ]),
    ).toHaveLength(1);
  });
  it("does not fire at exactly the 5% boundary or with no design total", () => {
    expect(
      checkSystemTotalMismatch([
        system({ designTotalCfm: 100 }, [outlet({ finalCfm: 95 })]),
        system({ id: "system-2", designTotalCfm: null }),
      ]),
    ).toHaveLength(0);
  });
});

describe("missing_instrument", () => {
  it("fires when no instrument is recorded", () => {
    expect(checkMissingInstrument([outlet({ instrumentName: null })])).toHaveLength(1);
  });
  it("does not fire when an instrument is present", () => {
    expect(checkMissingInstrument([outlet()])).toHaveLength(0);
  });
});

describe("unknown_instrument", () => {
  it("fires for an instrument not in the registry", () => {
    expect(
      checkUnknownInstrument(
        [outlet({ instrumentName: "Flow Hood #3" })],
        registry,
      ),
    ).toHaveLength(1);
  });
  it("matches registry names case-insensitively after trimming", () => {
    expect(
      checkUnknownInstrument(
        [outlet({ instrumentName: "  flow hood fh-1 " })],
        registry,
      ),
    ).toHaveLength(0);
  });
});

describe("expired_calibration", () => {
  const expiredRegistry: RuleInstrument[] = [
    {
      name: "Flow Hood FH-2",
      calibrationDate: "2025-05-01",
      calibrationIntervalMonths: 12,
    },
  ];
  it("fires when calibration expiration precedes the test date", () => {
    expect(
      checkExpiredCalibration(
        [outlet({ instrumentName: "Flow Hood FH-2" })],
        expiredRegistry,
        new Date("2026-07-26T00:00:00Z"),
      ),
    ).toHaveLength(1);
  });
  it("does not fire on the exact expiration date", () => {
    expect(
      checkExpiredCalibration(
        [
          outlet({
            instrumentName: "Flow Hood FH-2",
            testDate: "2026-05-01",
          }),
        ],
        expiredRegistry,
        new Date("2026-07-26T00:00:00Z"),
      ),
    ).toHaveLength(0);
  });
  it("uses today when the test date is missing", () => {
    expect(
      checkExpiredCalibration(
        [outlet({ instrumentName: "Flow Hood FH-2", testDate: "" })],
        expiredRegistry,
        new Date("2026-07-26T00:00:00Z"),
      ),
    ).toHaveLength(1);
  });
});

describe("missing_test_date", () => {
  it("fires for blank and unparseable dates", () => {
    expect(
      checkMissingTestDate([
        outlet({ testDate: "" }),
        outlet({ id: "outlet-2", testDate: "June-ish" }),
      ]),
    ).toHaveLength(2);
  });
  it("does not fire for an ISO date", () => {
    expect(checkMissingTestDate([outlet()])).toHaveLength(0);
  });
});

describe("missing_technician", () => {
  it("fires for a blank technician", () => {
    expect(checkMissingTechnician([outlet({ technician: " " })])).toHaveLength(1);
  });
  it("does not fire when a technician is recorded", () => {
    expect(checkMissingTechnician([outlet()])).toHaveLength(0);
  });
});

describe("rules orchestration and reviewer-state preservation", () => {
  it("runs all checks with rule version 0.1.0", () => {
    const results = runReadinessChecks({
      systems: [system({}, [outlet({ instrumentName: null })])],
      instruments: registry,
      tolerancePct: 10,
      today: new Date("2026-07-26T00:00:00Z"),
    });
    expect(results.some((finding) => finding.ruleId === "missing_instrument")).toBe(true);
    expect(results.every((finding) => finding.ruleVersion === RULES_VERSION)).toBe(true);
  });

  it("preserves acknowledged and resolved identical findings on a re-run", () => {
    const draft: FindingDraft = {
      ruleId: "out_of_tolerance",
      ruleVersion: RULES_VERSION,
      severity: "warning",
      outletId: "outlet-1",
      airSystemId: "system-1",
      message: "message",
      inputs: { final_cfm: 115, design_cfm: 100, tolerance_pct: 10 },
    };
    const existing = [
      {
        ruleId: draft.ruleId,
        outletId: draft.outletId,
        airSystemId: draft.airSystemId,
        inputsJson: stableJson(draft.inputs),
        status: "acknowledged" as const,
      },
      {
        ruleId: "missing_test_date",
        outletId: "outlet-2",
        airSystemId: "system-1",
        inputsJson: stableJson({ test_date: null }),
        status: "resolved" as const,
      },
    ];
    expect(filterNewFindings([draft], existing)).toHaveLength(0);
  });

  it("regenerates a finding when the exact inputs change", () => {
    const draft: FindingDraft = {
      ruleId: "out_of_tolerance",
      ruleVersion: RULES_VERSION,
      severity: "warning",
      outletId: "outlet-1",
      airSystemId: "system-1",
      message: "message",
      inputs: { final_cfm: 116, design_cfm: 100, tolerance_pct: 10 },
    };
    expect(
      filterNewFindings([draft], [
        {
          ruleId: draft.ruleId,
          outletId: draft.outletId,
          airSystemId: draft.airSystemId,
          inputsJson: stableJson({ ...draft.inputs, final_cfm: 115 }),
          status: "acknowledged",
        },
      ]),
    ).toHaveLength(1);
  });
});
