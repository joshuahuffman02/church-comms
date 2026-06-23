// tests/assign.test.ts
import { describe, it, expect } from "vitest";
import { defaultPublishDate, canAssign, buildBoardModel } from "@/lib/assign";
import type { AssignDeliverable } from "@/lib/assign";

describe("defaultPublishDate", () => {
  it("is eventStart minus the channel's publish offset, at midnight", () => {
    const d = defaultPublishDate(new Date(2026, 6, 11, 9, 30), 7); // Jul 11 → Jul 4
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(0);
  });
});

describe("canAssign", () => {
  const dels: AssignDeliverable[] = [
    { id: "d1", requestId: "r1", channelId: "c1", status: "to_design", publishMs: 1 },
    { id: "d2", requestId: "r1", channelId: "c2", status: "skipped", publishMs: 2 },
  ];
  it("is false when a non-skipped deliverable already exists for the pair", () => {
    expect(canAssign(dels, "r1", "c1")).toBe(false);
  });
  it("is true when the only deliverable for the pair is skipped", () => {
    expect(canAssign(dels, "r1", "c2")).toBe(true);
  });
  it("is true when there is no deliverable for the pair", () => {
    expect(canAssign(dels, "r1", "c3")).toBe(true);
  });
});

describe("buildBoardModel", () => {
  const channels = [
    { id: "c1", key: "loop", name: "Sunday Loop", color: "#000" },
    { id: "c2", key: "fb", name: "Facebook", color: "#111" },
  ];
  const events = [
    { id: "r1", title: "VBS", eventStartMs: 100, tier: 1, noPromo: false },
    { id: "r2", title: "Room Only", eventStartMs: 200, tier: 2, noPromo: true },
  ];
  const dels: AssignDeliverable[] = [
    { id: "d1", requestId: "r1", channelId: "c1", status: "to_design", publishMs: 50 },
    { id: "d2", requestId: "r1", channelId: "c2", status: "skipped", publishMs: 60 },
    { id: "d3", requestId: "r2", channelId: "c1", status: "to_design", publishMs: 70 },
  ];
  it("lists non-noPromo events once and places non-skipped deliverables under their channel", () => {
    const model = buildBoardModel(events, dels, channels);
    expect(model.allEvents.map((e) => e.id)).toEqual(["r1"]); // r2 is noPromo
    expect(model.byChannel.c1.map((p) => p.requestId)).toEqual(["r1"]); // r2 excluded (noPromo)
    expect(model.byChannel.c2).toEqual([]); // d2 is skipped
  });
  it("labels the tier in plain words", () => {
    const model = buildBoardModel(events, dels, channels);
    expect(model.allEvents[0].tierLabel).toBe("Whole church");
  });
});
