import { describe, it, expect } from "vitest";
import { planEvent } from "../src/lib/engine/persist";
import { atMidnight } from "../src/lib/engine/dates";
import type { ChannelConfig } from "../src/lib/engine/types";

const channels: ChannelConfig[] = [
  { key: "loop", name: "Loop", type: "windowed", defaultPublishOffsetDays: 14, productionLeadDays: 7, cadence: { weekdays: [0] }, tierEligibility: [1, 2] },
  { key: "app_push", name: "Push", type: "one_shot", defaultPublishOffsetDays: 7, productionLeadDays: 1, tierEligibility: [1] },
  { key: "email", name: "PV Update Email", type: "windowed", defaultPublishOffsetDays: 21, productionLeadDays: 3, cadence: { weekdays: [3] }, tierEligibility: [1, 2, 3] },
];

describe("planEvent", () => {
  it("includes only tier-eligible channels", () => {
    const event = atMidnight(new Date("2026-06-22"));
    const today = atMidnight(new Date("2026-06-03"));
    const plan = planEvent({ eventStart: event, tier: 1 }, channels, today);
    expect(plan.map(p => p.channelKey).sort()).toEqual(["app_push", "email", "loop"]);
  });

  it("includes PV Update Email for ministry and small-group events", () => {
    const event = atMidnight(new Date("2026-07-22"));
    const today = atMidnight(new Date("2026-07-01"));

    for (const tier of [2, 3]) {
      const plan = planEvent({ eventStart: event, tier }, channels, today);
      expect(plan.map(p => p.channelKey)).toContain("email");
    }
  });
});
