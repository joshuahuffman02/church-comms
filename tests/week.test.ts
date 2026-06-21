import { describe, it, expect } from "vitest";
import { weekRange, bucketForDeliverable, loopChangesForSunday, comingSunday } from "../src/lib/week";
import { atMidnight } from "../src/lib/engine/dates";

describe("week", () => {
  it("weekRange is Mon..Sun containing the date", () => {
    const { start, end } = weekRange(atMidnight(new Date("2026-06-03"))); // Wed
    expect(start.toISOString().slice(0,10)).toBe("2026-06-01");
    expect(end.toISOString().slice(0,10)).toBe("2026-06-07");
  });

  it("buckets a deliverable due this week as 'make'", () => {
    const today = atMidnight(new Date("2026-06-03"));
    const b = bucketForDeliverable({ productionDueAt: atMidnight(new Date("2026-06-05")), status: "to_design" }, today);
    expect(b).toBe("make");
  });

  it("buckets an overdue, unfinished deliverable as 'at_risk'", () => {
    const today = atMidnight(new Date("2026-06-03"));
    const b = bucketForDeliverable({ productionDueAt: atMidnight(new Date("2026-05-31")), status: "to_design" }, today);
    expect(b).toBe("at_risk");
  });

  it("does not bucket skipped deliverables as active work", () => {
    const today = atMidnight(new Date("2026-06-03"));
    const overdue = bucketForDeliverable({ productionDueAt: atMidnight(new Date("2026-05-31")), status: "skipped" }, today);
    const thisWeek = bucketForDeliverable({ productionDueAt: atMidnight(new Date("2026-06-05")), status: "skipped" }, today);

    expect(overdue).toBe("other");
    expect(thisWeek).toBe("other");
  });
});

describe("comingSunday", () => {
  it("returns the next Sunday from a weekday (inclusive of today)", () => {
    const wed = atMidnight(new Date("2026-06-03")); // Wed
    expect(comingSunday(wed).toISOString().slice(0,10)).toBe("2026-06-07");
  });

  it("returns the same day when today is already Sunday", () => {
    const sun = atMidnight(new Date("2026-06-07")); // Sun
    expect(comingSunday(sun).toISOString().slice(0,10)).toBe("2026-06-07");
  });
});

describe("loopChangesForSunday", () => {
  it("adds loop items entering their window and removes those whose window passed", () => {
    const sunday = atMidnight(new Date("2026-06-07"));
    const touches = [
      { scheduledAt: atMidnight(new Date("2026-06-07")), request: { title: "VBS" } },     // appears this Sunday → add
      { scheduledAt: atMidnight(new Date("2026-05-31")), request: { title: "Memorial" } }, // last week → remove
    ];
    const { add, remove } = loopChangesForSunday(touches, sunday);
    expect(add.map(t => t.request.title)).toEqual(["VBS"]);
    expect(remove.map(t => t.request.title)).toEqual(["Memorial"]);
  });
});
