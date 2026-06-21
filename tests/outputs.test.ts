import { describe, expect, it } from "vitest";
import { atMidnight } from "../src/lib/engine/dates";
import {
  DEFAULT_OUTPUT_UPCOMING_WEEKS,
  groupOutputTouchesBySunday,
  outputUpcomingRange,
} from "../src/lib/outputs";

describe("outputUpcomingRange", () => {
  it("starts after the current church week and spans the default months-long window", () => {
    const today = atMidnight(new Date("2026-06-09")); // Tue, week is Jun 8-14
    const range = outputUpcomingRange(today);

    expect(DEFAULT_OUTPUT_UPCOMING_WEEKS).toBe(16);
    expect(range.start.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(range.end.toISOString().slice(0, 10)).toBe("2026-10-05");
  });

  it("groups touches under the Sunday that ends their week", () => {
    const groups = groupOutputTouchesBySunday([
      { id: "a", scheduledAt: atMidnight(new Date("2026-06-15")) }, // Mon
      { id: "b", scheduledAt: atMidnight(new Date("2026-06-21")) }, // Sun
      { id: "c", scheduledAt: atMidnight(new Date("2026-06-22")) }, // next Mon
    ]);

    expect(groups.map((group) => group.sunday.toISOString().slice(0, 10))).toEqual([
      "2026-06-21",
      "2026-06-28",
    ]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });
});
