import { describe, it, expect } from "vitest";
import { previewSchedule } from "@/lib/channel-preview";

const event = new Date(2026, 6, 26); // Sun Jul 26 2026
const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null);

describe("previewSchedule", () => {
  it("one_shot counts straight back from the event", () => {
    const r = previewSchedule({ type: "one_shot", offset: 21, lead: 7, weekdays: [] }, event);
    expect(ymd(r.goesOut)).toBe("2026-7-5");
    expect(ymd(r.assetDue)).toBe("2026-6-28");
  });

  it("windowed uses the FIRST posting day in the window", () => {
    const r = previewSchedule({ type: "windowed", offset: 21, lead: 7, weekdays: [0] }, event);
    expect(ymd(r.goesOut)).toBe("2026-7-5");
    expect(ymd(r.assetDue)).toBe("2026-6-28");
  });

  it("dated_instance uses the LAST posting day and prefers lockLeadDays", () => {
    const r = previewSchedule({ type: "dated_instance", offset: 21, lead: 7, lockLeadDays: 14, weekdays: [0] }, event);
    expect(ymd(r.goesOut)).toBe("2026-7-26");
    expect(ymd(r.assetDue)).toBe("2026-7-12");
  });

  it("dated_instance falls back to lead when no lockLeadDays", () => {
    const r = previewSchedule({ type: "dated_instance", offset: 21, lead: 7, lockLeadDays: null, weekdays: [0] }, event);
    expect(ymd(r.assetDue)).toBe("2026-7-19");
  });

  it("returns nulls when no posting day lands in the window", () => {
    const r = previewSchedule({ type: "windowed", offset: 2, lead: 7, weekdays: [3] }, event);
    expect(r.goesOut).toBeNull();
    expect(r.assetDue).toBeNull();
  });
});
