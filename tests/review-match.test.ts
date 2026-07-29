import { describe, expect, it } from "vitest";
import { matchReviewCandidates } from "@/src/import/review-match";

describe("review restoration matching", () => {
  it("preserves a unique reviewed finding when metadata shifts its row", () => {
    expect(
      matchReviewCandidates(
        [{ primaryKey: "same finding", sourceLocation: "AHU-1:12" }],
        [{ primaryKey: "same finding", sourceLocation: "AHU-1:13" }],
      ),
    ).toEqual([{ previousIndex: 0, freshIndex: 0 }]);
  });

  it("uses source location to distinguish duplicate outlet identities", () => {
    expect(
      matchReviewCandidates(
        [
          { primaryKey: "duplicate", sourceLocation: "AHU-2:15" },
          { primaryKey: "duplicate", sourceLocation: "AHU-2:16" },
        ],
        [
          { primaryKey: "duplicate", sourceLocation: "AHU-2:16" },
          { primaryKey: "duplicate", sourceLocation: "AHU-2:15" },
        ],
      ),
    ).toEqual([
      { previousIndex: 1, freshIndex: 0 },
      { previousIndex: 0, freshIndex: 1 },
    ]);
  });

  it("does not guess when duplicate source locations no longer match", () => {
    expect(
      matchReviewCandidates(
        [
          { primaryKey: "duplicate", sourceLocation: "AHU-2:15" },
          { primaryKey: "duplicate", sourceLocation: "AHU-2:16" },
        ],
        [
          { primaryKey: "duplicate", sourceLocation: "AHU-2:17" },
          { primaryKey: "duplicate", sourceLocation: "AHU-2:18" },
        ],
      ),
    ).toEqual([]);
  });

  it("does not transfer a review when a former duplicate is removed", () => {
    const reviewed = [
      { primaryKey: "duplicate", sourceLocation: "AHU-2:15" },
    ];
    const fresh = [
      { primaryKey: "duplicate", sourceLocation: "AHU-2:18" },
    ];
    expect(
      matchReviewCandidates(
        reviewed,
        fresh,
        [
          reviewed[0],
          { primaryKey: "duplicate", sourceLocation: "AHU-2:16" },
        ],
        fresh,
      ),
    ).toEqual([]);
  });
});
