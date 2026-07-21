// tests/assign.test.ts
import { describe, it, expect } from "vitest";
import { defaultPublishDate, canAssign, buildBoardModel, buildAssignmentOverview } from "@/lib/assign";
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

describe("buildAssignmentOverview", () => {
  const today = new Date(2026, 6, 21).getTime();
  const yesterday = new Date(2026, 6, 20).getTime();
  const tomorrow = new Date(2026, 6, 22).getTime();
  const channels = [
    { id: "c1", key: "loop", name: "Sunday Loop", color: "#000" },
    { id: "c2", key: "video", name: "Announcement Video", color: "#111" },
  ];
  const events = [
    { id: "past-only", title: "Past only", eventStartMs: tomorrow, tier: 1, noPromo: false },
    { id: "protected", title: "Protected", eventStartMs: tomorrow + 1, tier: 2, noPromo: false },
    { id: "hidden", title: "Room only", eventStartMs: tomorrow + 2, tier: 2, noPromo: true },
  ];

  it("treats a channel with only old appearances as needing action, not as current", () => {
    const overview = buildAssignmentOverview(events, [
      { id: "d1", requestId: "past-only", channelId: "c1", status: "to_design", publishDatesMs: [yesterday] },
    ], channels, [], today);

    const event = overview.events.find((row) => row.id === "past-only")!;
    expect(event.needsChannel).toBe(true);
    expect(event.needsAttention).toBe(true);
    expect(event.assignments[0].pastDatesMs).toEqual([yesterday]);
    expect(event.assignments[0].futureDatesMs).toEqual([]);
    expect(overview.summary.pastOnlyCount).toBe(1);
  });

  it("deduplicates the date list while still flagging exact duplicate appearances", () => {
    const overview = buildAssignmentOverview(events, [
      { id: "d1", requestId: "protected", channelId: "c2", status: "to_design", publishDatesMs: [tomorrow] },
      { id: "d2", requestId: "protected", channelId: "c2", status: "ready", publishDatesMs: [tomorrow] },
      { id: "d3", requestId: "protected", channelId: "c1", status: "skipped", publishDatesMs: [tomorrow] },
    ], channels, [
      { requestId: "protected", channelId: "c2", scheduledAtMs: tomorrow, kind: "locked" },
      { requestId: "protected", channelId: "c2", scheduledAtMs: tomorrow, kind: "featured" },
    ], today);

    const event = overview.events.find((row) => row.id === "protected")!;
    expect(event.futureChannelCount).toBe(1);
    expect(event.futureAppearanceCount).toBe(1);
    expect(event.assignments).toHaveLength(1);
    expect(event.assignments[0].duplicateDatesMs).toEqual([tomorrow]);
    expect(event.assignments[0].lockedDatesMs).toEqual([tomorrow]);
    expect(event.assignments[0].featuredDatesMs).toEqual([tomorrow]);
    expect(overview.summary.duplicateCount).toBe(1);
    expect(overview.summary.lockedCount).toBe(1);
    expect(overview.summary.featuredCount).toBe(1);
  });

  it("excludes no-promotion events from the overview and summary", () => {
    const overview = buildAssignmentOverview(events, [], channels, [], today);
    expect(overview.events.map((event) => event.id)).toEqual(["past-only", "protected"]);
    expect(overview.summary.upcomingCount).toBe(2);
  });

  it("keeps an orphaned lock visible and current until its scheduled work is rebuilt", () => {
    const overview = buildAssignmentOverview(events, [], channels, [
      { requestId: "protected", channelId: "c1", scheduledAtMs: tomorrow, kind: "locked" },
    ], today);
    const event = overview.events.find((row) => row.id === "protected")!;
    expect(event.needsChannel).toBe(false);
    expect(event.futureChannelCount).toBe(1);
    expect(event.assignments[0].deliverableIds).toEqual([]);
    expect(event.assignments[0].futureDatesMs).toEqual([tomorrow]);
    expect(event.assignments[0].lockedDatesMs).toEqual([tomorrow]);
  });
});
