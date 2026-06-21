import { describe, it, expect } from "vitest";
import {
  effectiveEventCap,
  liveEventIds,
  splitByWeeklyCap,
  type RankableEvent,
} from "../src/lib/social-curation";

// Compact event builder. Date passed as a YYYY-MM-DD string → epoch ms.
function ev(
  requestId: string,
  tier: number,
  date: string,
  title = requestId,
): RankableEvent {
  return { requestId, tier, eventStartMs: new Date(date).getTime(), title };
}

describe("effectiveEventCap", () => {
  it("uses frequencyCap first for weekly capped channels", () => {
    expect(effectiveEventCap({ type: "windowed", capacity: 10, frequencyCap: 6 })).toBe(6);
  });

  it("uses capacity for dated-instance channels such as announcement video", () => {
    expect(effectiveEventCap({ type: "dated_instance", capacity: 3, frequencyCap: null })).toBe(3);
  });

  it("leaves uncapped windowed channels alone even when they have a capacity guardrail", () => {
    expect(effectiveEventCap({ type: "windowed", capacity: 10, frequencyCap: null })).toBeNull();
  });
});

describe("liveEventIds", () => {
  it("passes everything through when cap is null/0/undefined (uncapped channel)", () => {
    const events = [ev("a", 1, "2026-07-01"), ev("b", 2, "2026-07-02")];
    for (const cap of [null, undefined, 0, -3]) {
      expect(liveEventIds(events, cap).size).toBe(2);
    }
  });

  it("keeps all when distinct events are at or under the cap", () => {
    const events = [ev("a", 1, "2026-07-01"), ev("b", 2, "2026-07-02")];
    expect([...liveEventIds(events, 6)].sort()).toEqual(["a", "b"]);
  });

  it("ranks by tier first, then soonest event date", () => {
    const events = [
      ev("late_t1", 1, "2026-08-01"),
      ev("soon_t2", 2, "2026-07-01"),
      ev("soon_t1", 1, "2026-07-05"),
    ];
    // Cap 2 → both tier-1s make it (tier beats date); the tier-2 is held even
    // though it's the soonest.
    const live = liveEventIds(events, 2);
    expect(live.has("soon_t1")).toBe(true);
    expect(live.has("late_t1")).toBe(true);
    expect(live.has("soon_t2")).toBe(false);
  });

  it("within a tier, the sooner event wins", () => {
    const events = [
      ev("far", 1, "2026-09-01"),
      ev("near", 1, "2026-07-01"),
      ev("mid", 1, "2026-08-01"),
    ];
    expect([...liveEventIds(events, 2)].sort()).toEqual(["mid", "near"]);
  });

  it("counts EVENTS, not posts — repeated touches of one event don't fill the cap", () => {
    // Event "a" appears 3× (Sun/Wed/Sun); still one event toward the cap.
    const events = [
      ev("a", 1, "2026-07-05"),
      ev("a", 1, "2026-07-05"),
      ev("a", 1, "2026-07-05"),
      ev("b", 1, "2026-07-06"),
      ev("c", 1, "2026-07-07"),
    ];
    const live = liveEventIds(events, 2);
    expect(live.size).toBe(2);
    expect(live.has("a")).toBe(true); // soonest, survives
  });

  it("breaks date ties by title for determinism", () => {
    const events = [
      ev("z", 1, "2026-07-01", "Zebra"),
      ev("a", 1, "2026-07-01", "Apple"),
    ];
    expect([...liveEventIds(events, 1)]).toEqual(["a"]);
  });
});

describe("splitByWeeklyCap", () => {
  type Row = { id: string; e: RankableEvent };
  const get = (r: Row) => r.e;

  it("partitions touches into live (top-cap events) and held, preserving order", () => {
    const rows: Row[] = [
      { id: "t1", e: ev("a", 1, "2026-07-01") },
      { id: "t2", e: ev("b", 2, "2026-07-02") },
      { id: "t3", e: ev("a", 1, "2026-07-08") }, // 2nd post of event a
      { id: "t4", e: ev("c", 3, "2026-07-03") },
    ];
    const { live, held } = splitByWeeklyCap(rows, get, 1);
    // Only event "a" (tier 1, soonest) is live → both of its touches are live.
    expect(live.map((r) => r.id)).toEqual(["t1", "t3"]);
    expect(held.map((r) => r.id)).toEqual(["t2", "t4"]);
  });

  it("holds nothing when cap is null", () => {
    const rows: Row[] = [
      { id: "t1", e: ev("a", 1, "2026-07-01") },
      { id: "t2", e: ev("b", 2, "2026-07-02") },
    ];
    const { live, held } = splitByWeeklyCap(rows, get, null);
    expect(live).toHaveLength(2);
    expect(held).toHaveLength(0);
  });
});
