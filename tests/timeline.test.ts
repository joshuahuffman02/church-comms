import { describe, it, expect } from "vitest";
import { computeDeliverable } from "../src/lib/engine/timeline";
import { atMidnight } from "../src/lib/engine/dates";
import type { ChannelConfig } from "../src/lib/engine/types";

const event = atMidnight(new Date("2026-06-22")); // Mon
const today = atMidnight(new Date("2026-06-03")); // Wed

const push: ChannelConfig = {
  key: "app_push", name: "App push", type: "one_shot",
  defaultPublishOffsetDays: 7, productionLeadDays: 1, tierEligibility: [1],
};
const loop: ChannelConfig = {
  key: "loop", name: "Loop", type: "windowed",
  defaultPublishOffsetDays: 14, productionLeadDays: 7,
  cadence: { weekdays: [0] }, tierEligibility: [1, 2],
};

describe("one_shot", () => {
  it("publishes offset days before event, production due a lead before that", () => {
    const d = computeDeliverable(push, { eventStart: event, tier: 1 }, today);
    expect(d.touches.map(t => t.scheduledAt.toISOString().slice(0,10))).toEqual(["2026-06-15"]);
    expect(d.productionDueAt.toISOString().slice(0,10)).toBe("2026-06-14");
    expect(d.status).toBe("to_design");
  });

  it("can publish offset days before a registration deadline", () => {
    const registrationClosesAt = atMidnight(new Date("2026-06-14"));
    const d = computeDeliverable(
      push,
      { eventStart: event, promotionEndsAt: registrationClosesAt, tier: 1 },
      today,
    );

    expect(d.touches.map(t => t.scheduledAt.toISOString().slice(0,10))).toEqual(["2026-06-07"]);
    expect(d.touches.map(t => t.purposeLabel)).toEqual(["awareness"]);
    expect(d.productionDueAt.toISOString().slice(0,10)).toBe("2026-06-06");
  });
});

describe("windowed (loop on Sundays)", () => {
  it("creates a touch for each cadence weekday in the window", () => {
    const d = computeDeliverable(loop, { eventStart: event, tier: 1 }, today);
    // window = event-14 (Jun 8) .. event (Jun 22); Sundays = Jun 14, Jun 21
    expect(d.touches.map(t => t.scheduledAt.toISOString().slice(0,10))).toEqual(["2026-06-14","2026-06-21"]);
    expect(d.windowStart!.toISOString().slice(0,10)).toBe("2026-06-08");
    expect(d.productionDueAt.toISOString().slice(0,10)).toBe("2026-06-07"); // firstTouch(Jun14) - 7
  });

  it("ends the window at the registration deadline when one is supplied", () => {
    const registrationClosesAt = atMidnight(new Date("2026-06-14"));
    const d = computeDeliverable(
      loop,
      { eventStart: event, promotionEndsAt: registrationClosesAt, tier: 1 },
      today,
    );

    expect(d.windowStart!.toISOString().slice(0,10)).toBe("2026-05-31");
    expect(d.windowEnd!.toISOString().slice(0,10)).toBe("2026-06-14");
    expect(d.touches.map(t => t.scheduledAt.toISOString().slice(0,10))).toEqual(["2026-05-31","2026-06-07","2026-06-14"]);
    expect(d.touches.map(t => t.purposeLabel)).toEqual(["awareness","awareness","register"]);
  });
});

describe("late detection", () => {
  it("marks skipped when production is already past 'today'", () => {
    const video = { ...push, key: "produced_video", productionLeadDays: 42, defaultPublishOffsetDays: 42 };
    const soon = atMidnight(new Date("2026-06-22"));
    const d = computeDeliverable(video as ChannelConfig, { eventStart: soon, tier: 1 }, today);
    expect(d.status).toBe("skipped");
    expect(d.skippedReason).toMatch(/lead time/i);
  });
});

import { computeDeliverable as cd2 } from "../src/lib/engine/timeline";

describe("dated_instance (announcement video)", () => {
  const video: ChannelConfig = {
    key: "announcement_video", name: "Announcement video", type: "dated_instance",
    defaultPublishOffsetDays: 14, productionLeadDays: 7, lockLeadDays: 7,
    cadence: { weekdays: [0] }, capacity: 3, tierEligibility: [1],
  };

  it("airs on the last in-window Sunday and locks 7 days before that Sunday", () => {
    const event = atMidnight(new Date("2026-06-22"));
    const today = atMidnight(new Date("2026-06-03"));
    const d = cd2(video, { eventStart: event, tier: 1 }, today);
    expect(d.instanceDate!.toISOString().slice(0,10)).toBe("2026-06-21"); // last Sunday ≤ event in window
    expect(d.productionDueAt.toISOString().slice(0,10)).toBe("2026-06-14"); // instance - lockLead(7)
  });

  it("uses a registration deadline as the latest eligible instance date", () => {
    const event = atMidnight(new Date("2026-06-22"));
    const registrationClosesAt = atMidnight(new Date("2026-06-14"));
    const today = atMidnight(new Date("2026-06-03"));
    const d = cd2(
      video,
      { eventStart: event, promotionEndsAt: registrationClosesAt, tier: 1 },
      today,
    );

    expect(d.instanceDate!.toISOString().slice(0,10)).toBe("2026-06-14");
    expect(d.productionDueAt.toISOString().slice(0,10)).toBe("2026-06-07");
    expect(d.touches.map(t => t.purposeLabel)).toEqual(["register"]);
  });
});

// ---------------------------------------------------------------------------
// Catch-up mode: an event imported MID-STREAM, where the normal promo window
// has already started in the past. `today` (Thu Jun 4) sits *inside* the
// would-be window of an event only 5 days out (Tue Jun 9). In default mode the
// schedule is already late → "skipped". In catch-up mode it's re-based to start
// FROM TODAY → "to_design", every date clamped to be on/after today and on/before
// the event. Default behavior MUST be unchanged.
// ---------------------------------------------------------------------------
describe("catch-up mode (mid-stream import)", () => {
  const today = atMidnight(new Date("2026-06-04")); // Thu
  const event = atMidnight(new Date("2026-06-09")); // Tue, 5 days out

  const loop5: ChannelConfig = {
    key: "loop", name: "Loop", type: "windowed",
    defaultPublishOffsetDays: 14, productionLeadDays: 7,
    cadence: { weekdays: [0] }, tierEligibility: [1, 2],
  };
  const push5: ChannelConfig = {
    key: "app_push", name: "App push", type: "one_shot",
    defaultPublishOffsetDays: 7, productionLeadDays: 1, tierEligibility: [1],
  };
  const annVideo5: ChannelConfig = {
    key: "announcement_video", name: "Announcement video", type: "dated_instance",
    defaultPublishOffsetDays: 14, productionLeadDays: 7, lockLeadDays: 7,
    cadence: { weekdays: [0] }, tierEligibility: [1],
  };

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todayIso = iso(today);
  const eventIso = iso(event);

  describe("windowed (loop on Sundays)", () => {
    it("default mode → skipped (window already started in the past)", () => {
      const d = computeDeliverable(loop5, { eventStart: event, tier: 1 }, today);
      expect(d.status).toBe("skipped");
      expect(d.skippedReason).toMatch(/lead time/i);
      // unchanged: window anchored to event - offset, even though that's in the past
      expect(iso(d.windowStart!)).toBe("2026-05-26");
    });

    it("catchUp mode → to_design, re-based to start from today", () => {
      const d = computeDeliverable(loop5, { eventStart: event, tier: 1 }, today, { catchUp: true });
      expect(d.status).toBe("to_design");
      expect(d.skippedReason).toBeUndefined();
      // window clamped to [today, event]
      expect(iso(d.windowStart!)).toBe(todayIso);
      expect(iso(d.windowEnd!)).toBe(eventIso);
      // only the in-window Sunday that's >= today survives (Jun 7)
      expect(d.touches.map(t => iso(t.scheduledAt))).toEqual(["2026-06-07"]);
      // every date is on/after today and on/before the event
      expect(iso(d.productionDueAt) >= todayIso).toBe(true);
      for (const t of d.touches) {
        expect(iso(t.scheduledAt) >= todayIso).toBe(true);
        expect(iso(t.scheduledAt) <= eventIso).toBe(true);
      }
    });
  });

  describe("one_shot (app push)", () => {
    it("default mode → skipped (publish date already past)", () => {
      const d = computeDeliverable(push5, { eventStart: event, tier: 1 }, today);
      expect(d.status).toBe("skipped");
    });

    it("catchUp mode → to_design, push clamped to today (and never past the event)", () => {
      const d = computeDeliverable(push5, { eventStart: event, tier: 1 }, today, { catchUp: true });
      expect(d.status).toBe("to_design");
      expect(d.skippedReason).toBeUndefined();
      expect(d.touches.map(t => iso(t.scheduledAt))).toEqual([todayIso]);
      expect(iso(d.productionDueAt) >= todayIso).toBe(true);
      for (const t of d.touches) {
        expect(iso(t.scheduledAt) >= todayIso).toBe(true);
        expect(iso(t.scheduledAt) <= eventIso).toBe(true);
      }
    });
  });

  describe("dated_instance (announcement video)", () => {
    it("default mode → skipped (lock date already past)", () => {
      const d = computeDeliverable(annVideo5, { eventStart: event, tier: 1 }, today);
      expect(d.status).toBe("skipped");
    });

    it("catchUp mode → to_design, next available service instance on/before the event", () => {
      const d = computeDeliverable(annVideo5, { eventStart: event, tier: 1 }, today, { catchUp: true });
      expect(d.status).toBe("to_design");
      expect(d.skippedReason).toBeUndefined();
      // next Sunday >= today and <= event is Jun 7
      expect(iso(d.instanceDate!)).toBe("2026-06-07");
      expect(d.touches.map(t => iso(t.scheduledAt))).toEqual(["2026-06-07"]);
      expect(iso(d.productionDueAt) >= todayIso).toBe(true);
      for (const t of d.touches) {
        expect(iso(t.scheduledAt) >= todayIso).toBe(true);
        expect(iso(t.scheduledAt) <= eventIso).toBe(true);
      }
    });
  });

  it("catchUp produces the SAME channels as default (only status/dates re-based)", () => {
    const def = computeDeliverable(loop5, { eventStart: event, tier: 1 }, today);
    const cu = computeDeliverable(loop5, { eventStart: event, tier: 1 }, today, { catchUp: true });
    expect(cu.channelKey).toBe(def.channelKey);
    expect(def.status).toBe("skipped");
    expect(cu.status).toBe("to_design");
  });
});
