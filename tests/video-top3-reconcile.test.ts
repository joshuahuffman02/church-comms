import { describe, it, expect } from "vitest";
import { splitByWeeklyCap, type RankableEvent } from "@/lib/social-curation";
import { evaluateCapacity, type InstanceLoad } from "@/lib/guardrails";
import { pickedRequestIds, type SundayTop3Pick } from "@/lib/video-top3-data";

const ev = (requestId: string): RankableEvent => ({ requestId, tier: 1, eventStartMs: 0, title: requestId });

describe("splitByWeeklyCap — preferred (Top-3) override", () => {
  const items = [{ rid: "a" }, { rid: "b" }, { rid: "c" }, { rid: "d" }];
  const getEvent = (it: { rid: string }) => ev(it.rid);

  it("features the preferred set first, then fills remaining slots from the rest", () => {
    // cap 3, picks [c,a] (2 events) → c,a featured, 1 slot fills with the ranked
    // top of {b,d} (b sorts before d), and d is held.
    const { live, held } = splitByWeeklyCap(items, getEvent, 3, ["c", "a"]);
    expect(live.map((i) => i.rid)).toEqual(["c", "a", "b"]);
    expect(held.map((i) => i.rid)).toEqual(["d"]);
  });

  it("holds everything not picked once the picks fill the cap", () => {
    const { live, held } = splitByWeeklyCap(items, getEvent, 2, ["c", "a"]);
    expect(live.map((i) => i.rid)).toEqual(["c", "a"]);
    expect(held.map((i) => i.rid)).toEqual(["b", "d"]);
  });

  it("falls back to the automatic ranking when no preferred picks are given", () => {
    const { live } = splitByWeeklyCap(items, getEvent, 2);
    expect(live.length).toBe(2);
  });
});

describe("evaluateCapacity — pickedCount downgrade", () => {
  const base: InstanceLoad = {
    channelKey: "announcement_video",
    whenISO: "2026-07-05",
    capacity: 3,
    requestIds: ["a", "b", "c", "d", "e"],
    titles: ["A", "B", "C", "D", "E"],
  };

  it("is an actionable block when fewer than capacity are picked", () => {
    const [g] = evaluateCapacity([{ ...base, pickedCount: 1 }]);
    expect(g.severity).toBe("block");
    expect(g.message).toContain("pick which 3");
  });

  it("downgrades to informational once capacity slots are picked", () => {
    const [g] = evaluateCapacity([{ ...base, pickedCount: 3 }]);
    expect(g.severity).toBe("info");
    expect(g.message).toContain("featured");
    expect(g.message).toContain("held");
  });

  it("treats a missing pickedCount as 0 (unchanged legacy behavior)", () => {
    const [g] = evaluateCapacity([base]);
    expect(g.severity).toBe("block");
  });
});

describe("pickedRequestIds", () => {
  it("returns picked event ids in order, dropping label-only awareness items", () => {
    const picks: SundayTop3Pick[] = [
      { sortOrder: 0, requestId: "r1", label: null, request: null },
      { sortOrder: 1, requestId: null, label: "Camp staff needs", request: null },
      { sortOrder: 2, requestId: "r2", label: null, request: null },
    ];
    expect(pickedRequestIds(picks)).toEqual(["r1", "r2"]);
  });
});
