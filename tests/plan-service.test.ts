import { describe, expect, it } from "vitest";
import { planEvent } from "@/lib/engine/persist";
import { atMidnight } from "@/lib/engine/dates";
import { applyScheduleLocksToPlan } from "@/lib/plan-service";
import type { ChannelConfig } from "@/lib/engine/types";

const ymd = (d: Date | undefined) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : null;

describe("applyScheduleLocksToPlan", () => {
  const today = atMidnight(new Date("2026-06-01"));
  const eventStart = atMidnight(new Date("2026-07-12"));

  const announcementVideo: ChannelConfig = {
    key: "announcement_video",
    name: "Announcement Video",
    type: "dated_instance",
    defaultPublishOffsetDays: 14,
    productionLeadDays: 7,
    lockLeadDays: 7,
    cadence: { weekdays: [0] },
    capacity: 3,
    tierEligibility: [1],
  };

  it("replaces a dated-instance auto placement with the locked date", () => {
    const input = { eventStart, tier: 1 };
    const plan = planEvent(input, [announcementVideo], today);
    const locked = applyScheduleLocksToPlan(input, plan, [
      { channel: announcementVideo, scheduledAt: atMidnight(new Date("2026-07-05")) },
    ]);

    expect(locked).toHaveLength(1);
    expect(ymd(locked[0].instanceDate)).toBe("2026-07-05");
    expect(locked[0].touches.map((touch) => ymd(touch.scheduledAt))).toEqual(["2026-07-05"]);
    expect(locked[0].status).toBe("to_design");
  });

  it("adds a locked channel even when normal tier eligibility would exclude it", () => {
    const appPush: ChannelConfig = {
      key: "app_push",
      name: "App Push",
      type: "one_shot",
      defaultPublishOffsetDays: 7,
      productionLeadDays: 1,
      tierEligibility: [1],
    };
    const input = { eventStart, tier: 3 };
    const plan = planEvent(input, [appPush], today);
    const locked = applyScheduleLocksToPlan(input, plan, [
      { channel: appPush, scheduledAt: atMidnight(new Date("2026-07-05")) },
    ]);

    expect(plan).toEqual([]);
    expect(locked.map((d) => d.channelKey)).toEqual(["app_push"]);
    expect(locked[0].touches.map((touch) => ymd(touch.scheduledAt))).toEqual(["2026-07-05"]);
  });

  it("inserts locked dates into windowed channels without dropping generated touches", () => {
    const loop: ChannelConfig = {
      key: "loop",
      name: "Loop",
      type: "windowed",
      defaultPublishOffsetDays: 14,
      productionLeadDays: 7,
      cadence: { weekdays: [0] },
      tierEligibility: [1, 2],
    };
    const input = { eventStart: atMidnight(new Date("2026-06-22")), tier: 1 };
    const plan = planEvent(input, [loop], today);
    const locked = applyScheduleLocksToPlan(input, plan, [
      { channel: loop, scheduledAt: atMidnight(new Date("2026-06-07")) },
    ]);

    expect(locked).toHaveLength(1);
    expect(locked[0].touches.map((touch) => ymd(touch.scheduledAt))).toEqual([
      "2026-06-07",
      "2026-06-14",
      "2026-06-21",
    ]);
    expect(ymd(locked[0].windowStart)).toBe("2026-06-07");
    expect(ymd(locked[0].windowEnd)).toBe("2026-06-22");
  });
});
