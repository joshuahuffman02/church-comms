import { describe, it, expect } from "vitest";
import {
  evaluateCapacity,
  evaluatePromoDensity,
  evaluateReachTier,
  buildGuardrailOverview,
  type InstanceLoad,
  type ChannelWeekLoad,
  type ReachCheck,
} from "../src/lib/guardrails";

describe("evaluateCapacity", () => {
  it("flags a video instance with 4 requestIds over capacity 3 as a stage_cap block", () => {
    const loads: InstanceLoad[] = [
      {
        channelKey: "announcement_video",
        channelName: "Announcement Video (Top 3)",
        whenISO: "2026-06-14",
        capacity: 3,
        requestIds: ["a", "b", "c", "d"],
        titles: ["VBS", "Baptism", "Brunch", "Lunch"],
        touchIds: ["touch-a", "touch-b", "touch-c", "touch-d"],
      },
    ];
    const out = evaluateCapacity(loads);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("stage_cap");
    expect(out[0].severity).toBe("block");
    expect(out[0].whenISO).toBe("2026-06-14");
    expect(out[0].channelKey).toBe("announcement_video");
    expect(out[0].channelName).toBe("Announcement Video (Top 3)");
    expect(out[0].requestIds).toEqual(["a", "b", "c", "d"]);
    expect(out[0].requests?.[0]).toEqual({ id: "a", title: "VBS", touchId: "touch-a" });
    expect(out[0].itemCount).toBe(4);
    expect(out[0].capacity).toBe(3);
    expect(out[0].pickedCount).toBe(0);
    // message names the date so it's actionable
    expect(out[0].message).toContain("2026-06-14");
  });

  it("passes featured event ids through for a decision-focused UI", () => {
    const out = evaluateCapacity([{
      channelKey: "announcement_video",
      whenISO: "2026-06-14",
      capacity: 3,
      requestIds: ["a", "b", "c", "d"],
      titles: ["A", "B", "C", "D"],
      pickedCount: 2,
      pickedRequestIds: ["a", "c"],
    }]);
    expect(out[0].pickedRequestIds).toEqual(["a", "c"]);
    expect(out[0].pickedCount).toBe(2);
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

describe("buildGuardrailOverview", () => {
  const today = new Date(2026, 6, 21);
  const checks = [
    { kind: "stage_cap" as const, severity: "block" as const, message: "soon", whenISO: "2026-08-02" },
    { kind: "reach_tier" as const, severity: "warn" as const, message: "no date" },
    { kind: "stage_cap" as const, severity: "block" as const, message: "later", whenISO: "2026-09-06" },
    { kind: "promo_density" as const, severity: "info" as const, message: "busy", whenISO: "2026-07-27" },
  ];

  it("keeps near-term and date-less decisions in focus while collapsing later work", () => {
    const overview = buildGuardrailOverview(checks, today, 30);
    expect(overview.dueSoon.map((check) => check.message)).toEqual(["soon", "no date"]);
    expect(overview.later.map((check) => check.message)).toEqual(["later"]);
    expect(overview.info.map((check) => check.message)).toEqual(["busy"]);
    expect(overview.summary).toEqual({
      actionableCount: 3,
      dueSoonCount: 2,
      laterCount: 1,
      infoCount: 1,
      nextDecisionISO: "2026-08-02",
    });
  });

  it("sorts dated blockers by the soonest date", () => {
    const overview = buildGuardrailOverview([
      { ...checks[0], whenISO: "2026-08-15" },
      { ...checks[0], whenISO: "2026-07-25" },
    ], today, 30);
    expect(overview.dueSoon.map((check) => check.whenISO)).toEqual(["2026-07-25", "2026-08-15"]);
  });
});
