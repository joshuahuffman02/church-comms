import { describe, it, expect } from "vitest";
import {
  evaluateCapacity,
  evaluatePromoDensity,
  evaluateReachTier,
  type InstanceLoad,
  type ChannelWeekLoad,
  type ReachCheck,
} from "../src/lib/guardrails";

describe("evaluateCapacity", () => {
  it("flags a video instance with 4 requestIds over capacity 3 as a stage_cap block", () => {
    const loads: InstanceLoad[] = [
      {
        channelKey: "announcement_video",
        whenISO: "2026-06-14",
        capacity: 3,
        requestIds: ["a", "b", "c", "d"],
        titles: ["VBS", "Baptism", "Brunch", "Lunch"],
      },
    ];
    const out = evaluateCapacity(loads);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("stage_cap");
    expect(out[0].severity).toBe("block");
    expect(out[0].whenISO).toBe("2026-06-14");
    expect(out[0].channelKey).toBe("announcement_video");
    expect(out[0].requestIds).toEqual(["a", "b", "c", "d"]);
    // message names the date so it's actionable
    expect(out[0].message).toContain("2026-06-14");
  });

  it("does not flag a load at exactly capacity", () => {
    const loads: InstanceLoad[] = [
      {
        channelKey: "announcement_video",
        whenISO: "2026-06-14",
        capacity: 3,
        requestIds: ["a", "b", "c"],
        titles: ["VBS", "Baptism", "Brunch"],
      },
    ];
    expect(evaluateCapacity(loads)).toEqual([]);
  });

  it("uses kind loop_cap for the loop channel", () => {
    const loads: InstanceLoad[] = [
      {
        channelKey: "loop",
        whenISO: "2026-06-14",
        capacity: 10,
        requestIds: Array.from({ length: 11 }, (_, i) => `r${i}`),
        titles: Array.from({ length: 11 }, (_, i) => `t${i}`),
      },
    ];
    const out = evaluateCapacity(loads);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("loop_cap");
    expect(out[0].severity).toBe("block");
  });
});

describe("evaluatePromoDensity", () => {
  it("flags as info when touchCount exceeds the cap", () => {
    const loads: ChannelWeekLoad[] = [
      { channelKey: "social", weekISO: "2026-06-08", touchCount: 6, cap: 4 },
    ];
    const out = evaluatePromoDensity(loads);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("promo_density");
    expect(out[0].severity).toBe("info");
    expect(out[0].channelKey).toBe("social");
    expect(out[0].whenISO).toBe("2026-06-08");
  });

  it("does not warn at or below the cap", () => {
    const loads: ChannelWeekLoad[] = [
      { channelKey: "social", weekISO: "2026-06-08", touchCount: 4, cap: 4 },
      { channelKey: "loop", weekISO: "2026-06-08", touchCount: 2, cap: 5 },
    ];
    expect(evaluatePromoDensity(loads)).toEqual([]);
  });
});

describe("evaluateReachTier", () => {
  it("warns for a tier-1 request whose reach is below threshold", () => {
    const checks: ReachCheck[] = [
      { requestId: "r1", title: "Men's Retreat", tier: 1, reachPct: 30 },
    ];
    const out = evaluateReachTier(checks, 50);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("reach_tier");
    expect(out[0].severity).toBe("warn");
    expect(out[0].requestIds).toEqual(["r1"]);
    expect(out[0].message).toContain("Men's Retreat");
  });

  it("does not warn for a tier-1 request at/above threshold", () => {
    const checks: ReachCheck[] = [
      { requestId: "r1", title: "VBS", tier: 1, reachPct: 80 },
    ];
    expect(evaluateReachTier(checks, 50)).toEqual([]);
  });

  it("ignores non-tier-1 requests", () => {
    const checks: ReachCheck[] = [
      { requestId: "r1", title: "Youth Kickoff", tier: 2, reachPct: 10 },
    ];
    expect(evaluateReachTier(checks, 50)).toEqual([]);
  });

  it("ignores requests with a null reach", () => {
    const checks: ReachCheck[] = [
      { requestId: "r1", title: "Baptism", tier: 1, reachPct: null },
    ];
    expect(evaluateReachTier(checks, 50)).toEqual([]);
  });
});
