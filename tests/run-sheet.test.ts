import { describe, it, expect } from "vitest";
import {
  groupTouchesByChannel,
  type LoadedTouch,
  type RunSheetChannelMeta,
} from "../src/lib/run-sheet";
import { atMidnight, addDays } from "../src/lib/engine/dates";

const sunday = atMidnight(new Date("2026-06-07"));

const channels: RunSheetChannelMeta[] = [
  { id: "ch_loop", key: "loop", name: "Sunday scrolling loop", color: "#34d399", type: "windowed" },
  { id: "ch_video", key: "announcement_video", name: "Announcement Video", color: "#a78bfa", type: "dated_instance", capacity: 3 },
  { id: "ch_social", key: "social", name: "Social (FB/IG)", color: "#ec4899", type: "windowed" },
];

// Helper to build a sample touch with minimal noise.
function touch(
  id: string,
  channelId: string,
  scheduledAt: Date,
  opts: Partial<{ title: string; nextStepText: string | null; content: string | null; status: string; touchStatus: string; ministries: { name: string; color: string }[]; requestId: string; tier: number; eventStart: Date }> = {}
): LoadedTouch {
  return {
    id,
    channelId,
    scheduledAt,
    content: opts.content ?? null,
    status: opts.touchStatus ?? "scheduled",
    deliverable: {
      status: opts.status ?? "to_design",
      request: {
        id: opts.requestId ?? `req_${id}`,
        tier: opts.tier ?? 1,
        eventStart: opts.eventStart ?? scheduledAt,
        title: opts.title ?? "An Event",
        nextStepText: opts.nextStepText ?? null,
        ministries: opts.ministries ?? [],
      },
    },
  };
}

describe("groupTouchesByChannel", () => {
  it("puts each touch under its own channel, in channel order", () => {
    const weekTouches = [
      touch("t1", "ch_social", addDays(sunday, -3), { title: "VBS" }), // Thursday
      touch("t2", "ch_loop", sunday, { title: "Baptism" }),
    ];
    const out = groupTouchesByChannel(channels, weekTouches, sunday);
    expect(out.map((c) => c.key)).toEqual(["loop", "announcement_video", "social"]);
    expect(out[0].items.map((i) => i.eventTitle)).toEqual(["Baptism"]);
    expect(out[2].items.map((i) => i.eventTitle)).toEqual(["VBS"]);
  });

  it("narrows on-Sunday channels (loop) to touches landing ON the Sunday, but keeps the whole week for windowed channels (social)", () => {
    const weekTouches = [
      // Loop: one on Sunday (kept), one mid-week (dropped — loop is on-Sunday-only)
      touch("loop-sun", "ch_loop", sunday, { title: "On-Screen Sunday" }),
      touch("loop-wed", "ch_loop", addDays(sunday, -4), { title: "Mid-Week Loop" }),
      // Social: both kept (windowed = whole Mon..Sun week)
      touch("soc-mon", "ch_social", addDays(sunday, -6), { title: "Social Mon" }),
      touch("soc-thu", "ch_social", addDays(sunday, -3), { title: "Social Thu" }),
    ];
    const out = groupTouchesByChannel(channels, weekTouches, sunday);
    const loop = out.find((c) => c.key === "loop")!;
    const social = out.find((c) => c.key === "social")!;

    expect(loop.onSundayOnly).toBe(true);
    expect(loop.items.map((i) => i.eventTitle)).toEqual(["On-Screen Sunday"]);

    expect(social.onSundayOnly).toBe(false);
    expect(social.items.map((i) => i.eventTitle)).toEqual(["Social Mon", "Social Thu"]);
  });

  it("derives the row detail: per-touch content wins, else next-step, else the title", () => {
    const weekTouches = [
      touch("c1", "ch_social", sunday, { title: "Event A", nextStepText: "Register now", content: "Custom copy!" }),
      touch("c2", "ch_social", sunday, { title: "Event B", nextStepText: "RSVP here", content: "  " }),
      touch("c3", "ch_social", sunday, { title: "Event C" }),
    ];
    const social = groupTouchesByChannel(channels, weekTouches, sunday).find((c) => c.key === "social")!;
    expect(social.items.map((i) => i.detail)).toEqual(["Custom copy!", "RSVP here", "Event C"]);
  });

  it("carries ministry name + color and the deliverable status through to the row", () => {
    const weekTouches = [
      touch("m1", "ch_social", sunday, {
        title: "Youth Night",
        status: "ready",
        ministries: [{ name: "Youth", color: "#abcdef" }],
      }),
    ];
    const item = groupTouchesByChannel(channels, weekTouches, sunday).find((c) => c.key === "social")!.items[0];
    expect(item.ministry).toBe("Youth");
    expect(item.ministryColor).toBe("#abcdef");
    expect(item.status).toBe("ready");
  });

  it("carries the FULL ministry set (multi-ministry), with the first as the primary", () => {
    const weekTouches = [
      touch("m2", "ch_social", sunday, {
        title: "Step Up Day",
        ministries: [
          { name: "Kids", color: "#34d399" },
          { name: "Rise", color: "#f59e0b" },
          { name: "Thrive", color: "#ef4444" },
        ],
      }),
    ];
    const item = groupTouchesByChannel(channels, weekTouches, sunday).find((c) => c.key === "social")!.items[0];
    expect(item.ministries.map((m) => m.name)).toEqual(["Kids", "Rise", "Thrive"]);
    // The compact line still shows a sensible single = the first of the set.
    expect(item.ministry).toBe("Kids");
    expect(item.ministryColor).toBe("#34d399");
  });

  it("marks a row done when the touch is published", () => {
    const weekTouches = [
      touch("d1", "ch_social", sunday, { title: "Done one", touchStatus: "published" }),
      touch("d2", "ch_social", sunday, { title: "Not done" }),
    ];
    const social = groupTouchesByChannel(channels, weekTouches, sunday).find((c) => c.key === "social")!;
    expect(social.items.map((i) => i.done)).toEqual([true, false]);
  });

  it("returns an empty item list for a channel with no touches that week", () => {
    const out = groupTouchesByChannel(channels, [], sunday);
    expect(out.every((c) => c.items.length === 0)).toBe(true);
    expect(out).toHaveLength(3);
  });

  it("caps announcement video to the top 3 by tier, then soonest event date", () => {
    const weekTouches = [
      touch("t2-soon", "ch_video", sunday, {
        title: "Soon Tier 2",
        requestId: "tier2-soon",
        tier: 2,
        eventStart: atMidnight(new Date("2026-06-15")),
      }),
      touch("t1-far", "ch_video", sunday, {
        title: "Far Tier 1",
        requestId: "tier1-far",
        tier: 1,
        eventStart: atMidnight(new Date("2026-08-01")),
      }),
      touch("t1-near", "ch_video", sunday, {
        title: "Near Tier 1",
        requestId: "tier1-near",
        tier: 1,
        eventStart: atMidnight(new Date("2026-06-20")),
      }),
      touch("t2-late", "ch_video", sunday, {
        title: "Late Tier 2",
        requestId: "tier2-late",
        tier: 2,
        eventStart: atMidnight(new Date("2026-09-01")),
      }),
    ];

    const video = groupTouchesByChannel(channels, weekTouches, sunday).find((c) => c.key === "announcement_video")!;

    expect(video.items.map((i) => i.eventTitle).sort()).toEqual([
      "Far Tier 1",
      "Near Tier 1",
      "Soon Tier 2",
    ]);
    expect(video.items.map((i) => i.eventTitle)).not.toContain("Late Tier 2");
  });
});
