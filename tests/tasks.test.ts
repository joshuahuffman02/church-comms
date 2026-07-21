import { describe, it, expect } from "vitest";
import {
  effectiveOwnerId,
  bucketForTask,
  focusMyTasks,
  hasCurrentPlacement,
  type MyTask,
  type MyTasksResult,
} from "../src/lib/tasks";
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

describe("focusMyTasks", () => {
  const today = atMidnight(new Date("2026-07-21"));
  let id = 0;
  const task = (due: Date | null): MyTask => ({
    id: `task-${id++}`,
    requestId: `event-${id}`,
    requestTitle: "Event",
    eventStart: addDays(today, 45),
    channelName: "Channel",
    channelColor: "#000000",
    status: "to_design",
    productionDueAt: due,
    explicitOwner: false,
  });

  it("separates older overdue work from the two-week focus window", () => {
    const tasks: MyTasksResult = {
      overdue: [task(addDays(today, -30)), task(addDays(today, -14)), task(addDays(today, -1))],
      thisWeek: [],
      awaitingProof: [],
      upcoming: [],
      total: 3,
    };
    const result = focusMyTasks(tasks, today);
    expect(result.oldBacklog).toHaveLength(1);
    expect(result.recentOverdue).toHaveLength(2);
    expect(result.actionTotal).toBe(2);
  });

  it("shows the next 30 days and keeps later or undated work out of focus", () => {
    const tasks: MyTasksResult = {
      overdue: [],
      thisWeek: [task(addDays(today, 2))],
      awaitingProof: [task(addDays(today, -20))],
      upcoming: [task(addDays(today, 30)), task(addDays(today, 31)), task(null)],
      total: 5,
    };
    const result = focusMyTasks(tasks, today);
    expect(result.nearTerm).toHaveLength(1);
    expect(result.later).toHaveLength(2);
    expect(result.actionTotal).toBe(2);
  });
});

describe("hasCurrentPlacement", () => {
  const today = atMidnight(new Date("2026-07-21"));

  it("drops a channel after its final advertising placement has passed", () => {
    expect(hasCurrentPlacement([
      { scheduledAt: addDays(today, -14) },
      { scheduledAt: addDays(today, -1) },
    ], today)).toBe(false);
  });

  it("keeps multi-week work while any placement is today or later", () => {
    expect(hasCurrentPlacement([
      { scheduledAt: addDays(today, -7) },
      { scheduledAt: today },
      { scheduledAt: addDays(today, 7) },
    ], today)).toBe(true);
  });

  it("keeps undated assignments visible", () => {
    expect(hasCurrentPlacement([], today)).toBe(true);
  });
});
