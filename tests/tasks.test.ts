import { describe, it, expect } from "vitest";
import { effectiveOwnerId, bucketForTask } from "../src/lib/tasks";
import { atMidnight, addDays } from "../src/lib/engine/dates";

describe("effectiveOwnerId precedence", () => {
  it("uses the deliverable owner when set (overrides the request)", () => {
    expect(effectiveOwnerId({ ownerId: "d-owner" }, { ownerId: "r-owner" })).toBe("d-owner");
  });

  it("falls back to the request owner when the deliverable has none", () => {
    expect(effectiveOwnerId({ ownerId: null }, { ownerId: "r-owner" })).toBe("r-owner");
    expect(effectiveOwnerId({}, { ownerId: "r-owner" })).toBe("r-owner");
  });

  it("is null when neither has an owner", () => {
    expect(effectiveOwnerId({ ownerId: null }, { ownerId: null })).toBeNull();
    expect(effectiveOwnerId({}, {})).toBeNull();
  });
});

describe("bucketForTask", () => {
  const today = atMidnight(new Date("2026-06-03")); // Wed, week = Jun 1..7

  it("routes anything in 'proof' to awaitingProof regardless of date", () => {
    // Even an overdue proof item is 'awaitingProof', not 'overdue'.
    expect(
      bucketForTask({ productionDueAt: addDays(today, -10), status: "proof" }, today)
    ).toBe("awaitingProof");
  });

  it("buckets an overdue, unfinished deliverable as overdue", () => {
    expect(
      bucketForTask({ productionDueAt: addDays(today, -2), status: "to_design" }, today)
    ).toBe("overdue");
  });

  it("buckets a deliverable due this week as thisWeek", () => {
    expect(
      bucketForTask({ productionDueAt: atMidnight(new Date("2026-06-05")), status: "in_progress" }, today)
    ).toBe("thisWeek");
  });

  it("buckets a later deliverable as upcoming", () => {
    expect(
      bucketForTask({ productionDueAt: addDays(today, 30), status: "to_design" }, today)
    ).toBe("upcoming");
  });

  it("treats a deliverable with no make-by date as upcoming", () => {
    expect(bucketForTask({ productionDueAt: null, status: "to_design" }, today)).toBe("upcoming");
  });

  it("drops finished work (ready/published/scheduled/skipped) out of the list", () => {
    for (const status of ["ready", "scheduled", "published", "skipped"]) {
      expect(
        bucketForTask({ productionDueAt: addDays(today, -5), status }, today)
      ).toBeNull();
    }
  });
});
