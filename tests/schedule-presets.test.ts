import { describe, expect, it } from "vitest";
import { atMidnight } from "@/lib/engine/dates";
import type { ChannelConfig, ComputedDeliverable } from "@/lib/engine/types";
import {
  MONTHLY_FIRST_SUNDAY_FULL_RUN,
  applySchedulePresetPlacementsToPlan,
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
];

describe("schedule presets", () => {
  it("places monthly awareness items on first-Sunday video and weekly loop/email/web", () => {
    const placements = schedulePresetPlacements(
      { eventStart: atMidnight(new Date(2026, 6, 15)) },
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
      { eventStart: atMidnight(new Date(2026, 6, 15)) },
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
});
