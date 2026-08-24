import { describe, expect, it } from "vitest";
import { atMidnight } from "@/lib/engine/dates";
import type { ChannelConfig, ComputedDeliverable } from "@/lib/engine/types";
import {
  MONTHLY_FIRST_SUNDAY_FULL_RUN,
  STANDARD_MULTI_WEEK,
  WEEK_OF_ONLY,
  applySchedulePresetPlacementsToPlan,
  effectiveSchedulePresetsForRequest,
  recommendedSchedulePresetForRequest,
  schedulePresetPlacements,
} from "@/lib/schedule-presets";

const ymd = (d: Date | undefined) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : null;

function channel(over: Partial<ChannelConfig> & Pick<ChannelConfig, "key" | "name">): ChannelConfig {
  return {
    type: "windowed",
    defaultPublishOffsetDays: 14,
    productionLeadDays: 7,
    cadence: { weekdays: [0] },
    tierEligibility: [1, 2],
    ...over,
  };
}

const channels: ChannelConfig[] = [
  channel({
    key: "announcement_video",
    name: "Announcement Video",
    type: "dated_instance",
    cadence: { weekdays: [0] },
  }),
  channel({ key: "loop", name: "Sunday Loop", cadence: { weekdays: [0] } }),
  channel({ key: "email", name: "Weekly Email", cadence: { weekdays: [4] } }),
  channel({ key: "web", name: "Website", cadence: { weekdays: [1] } }),
  channel({ key: "app", name: "App", type: "one_shot", defaultPublishOffsetDays: 21 }),
];

describe("schedule presets", () => {
  it("places monthly awareness items on first-Sunday video and weekly loop/email/web", () => {
    const placements = schedulePresetPlacements(
      { eventStart: atMidnight(new Date(2026, 6, 15)), tier: 1 },
      channels,
      [MONTHLY_FIRST_SUNDAY_FULL_RUN],
    );
    const byChannel = new Map<string, string[]>();
    for (const placement of placements) {
      const dates = byChannel.get(placement.channel.key) ?? [];
      dates.push(ymd(placement.scheduledAt)!);
      byChannel.set(placement.channel.key, dates);
    }

    expect(byChannel.get("announcement_video")).toEqual(["2026-07-05"]);
    expect(byChannel.get("loop")).toEqual([
      "2026-07-05",
      "2026-07-12",
      "2026-07-19",
      "2026-07-26",
    ]);
    expect(byChannel.get("email")).toEqual([
      "2026-07-02",
      "2026-07-09",
      "2026-07-16",
      "2026-07-23",
      "2026-07-30",
    ]);
    expect(byChannel.get("web")).toEqual([
      "2026-07-06",
      "2026-07-13",
      "2026-07-20",
      "2026-07-27",
    ]);
    expect(byChannel.get("app")).toEqual(["2026-07-01"]);
    expect([...byChannel.values()].flat().every((date) => date.startsWith("2026-07-"))).toBe(true);
  });

  it("replaces normal plans for preset channels while keeping unrelated channels", () => {
    const normalLoop: ComputedDeliverable = {
      channelKey: "loop",
      productionDueAt: atMidnight(new Date(2026, 5, 1)),
      windowStart: atMidnight(new Date(2026, 5, 1)),
      windowEnd: atMidnight(new Date(2026, 5, 21)),
      phase: "awareness",
      status: "to_design",
      touches: [{ scheduledAt: atMidnight(new Date(2026, 5, 7)), purposeLabel: "awareness" }],
    };
    const normalFacebook: ComputedDeliverable = {
      channelKey: "facebook",
      productionDueAt: atMidnight(new Date(2026, 5, 1)),
      windowStart: atMidnight(new Date(2026, 5, 1)),
      windowEnd: atMidnight(new Date(2026, 5, 21)),
      phase: "awareness",
      status: "to_design",
      touches: [{ scheduledAt: atMidnight(new Date(2026, 5, 7)), purposeLabel: "awareness" }],
    };
    const placements = schedulePresetPlacements(
      { eventStart: atMidnight(new Date(2026, 6, 15)), tier: 1 },
      channels,
      [MONTHLY_FIRST_SUNDAY_FULL_RUN],
    );

    const plan = applySchedulePresetPlacementsToPlan([normalLoop, normalFacebook], placements);
    const loop = plan.find((deliverable) => deliverable.channelKey === "loop");

    expect(plan.some((deliverable) => deliverable.channelKey === "facebook")).toBe(true);
    expect(loop?.touches.map((touch) => ymd(touch.scheduledAt))).toEqual([
      "2026-07-05",
      "2026-07-12",
      "2026-07-19",
      "2026-07-26",
    ]);
    expect(ymd(loop?.windowStart)).toBe("2026-07-05");
    expect(ymd(loop?.windowEnd)).toBe("2026-07-26");
  });

  it("keeps multiple preset video dates in one reusable weekly piece", () => {
    const placements = schedulePresetPlacements(
      { eventStart: atMidnight(new Date(2026, 6, 15)), tier: 1 },
      channels,
      [MONTHLY_FIRST_SUNDAY_FULL_RUN, WEEK_OF_ONLY],
    );
    const plan = applySchedulePresetPlacementsToPlan([], placements);
    const video = plan.filter((deliverable) => deliverable.channelKey === "announcement_video");

    expect(video).toHaveLength(1);
    expect(video[0].touches.map((touch) => ymd(touch.scheduledAt))).toEqual([
      "2026-07-05",
      "2026-07-12",
    ]);
  });

  it("keeps every week-of placement inside the final seven days", () => {
    const placements = schedulePresetPlacements(
      { eventStart: atMidnight(new Date(2026, 7, 19)), tier: 2 },
      channels,
      [WEEK_OF_ONLY],
    );

    expect(placements.length).toBe(channels.length);
    expect(placements.map((placement) => ymd(placement.scheduledAt))).toEqual(
      expect.arrayContaining([
        "2026-08-13", // weekly email and the one-shot app
        "2026-08-16", // Sunday video/loop
        "2026-08-17", // Monday website
      ]),
    );
    for (const placement of placements) {
      expect(placement.scheduledAt.getTime()).toBeGreaterThanOrEqual(new Date(2026, 7, 13).getTime());
      expect(placement.scheduledAt.getTime()).toBeLessThanOrEqual(new Date(2026, 7, 19).getTime());
    }
  });

  it("automatically recommends week-of timing only for routine youth nights", () => {
    const regular = {
      title: "Thrive Field Games",
      eventStart: atMidnight(new Date(2026, 6, 29)),
      needsRegistration: false,
      registrationClosesAt: null,
      registrationUrl: null,
    };
    expect(recommendedSchedulePresetForRequest(regular)).toBe(WEEK_OF_ONLY);
    expect(recommendedSchedulePresetForRequest({ ...regular, title: "Thrive Champions Night" })).toBeNull();
    expect(recommendedSchedulePresetForRequest({ ...regular, needsRegistration: true })).toBeNull();
    expect(recommendedSchedulePresetForRequest({ ...regular, eventStart: atMidnight(new Date(2026, 6, 30)) })).toBeNull();
  });

  it("lets an explicit standard schedule override the automatic youth recommendation", () => {
    const effective = effectiveSchedulePresetsForRequest({
      title: "Rise Sunday Night",
      eventStart: atMidnight(new Date(2026, 7, 9)),
      schedulePreset: STANDARD_MULTI_WEEK,
    });
    expect(effective).toEqual({ presets: [STANDARD_MULTI_WEEK], source: "event" });
  });
});
