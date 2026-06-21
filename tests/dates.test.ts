import { describe, it, expect } from "vitest";
import { atMidnight, subDays, addDays, weekdaysBetween, phaseFor, parseDateInput } from "../src/lib/engine/dates";

describe("date helpers", () => {
  it("subDays/addDays are inverse and date-only", () => {
    const d = atMidnight(new Date("2026-06-22T15:30:00"));
    expect(subDays(d, 7).toISOString()).toBe(atMidnight(new Date("2026-06-15")).toISOString());
    expect(addDays(subDays(d, 7), 7).toISOString()).toBe(d.toISOString());
  });

  it("weekdaysBetween returns all Sundays in range inclusive", () => {
    const start = atMidnight(new Date("2026-06-01")); // Mon
    const end = atMidnight(new Date("2026-06-22"));   // Mon
    const sundays = weekdaysBetween(start, end, [0]);
    expect(sundays.map(d => d.toISOString().slice(0, 10))).toEqual(["2026-06-07", "2026-06-14", "2026-06-21"]);
  });

  it("phaseFor labels by days-until-event", () => {
    const event = atMidnight(new Date("2026-06-22"));
    expect(phaseFor(subDays(event, 28), event)).toBe("awareness");
    expect(phaseFor(subDays(event, 10), event)).toBe("register");
    expect(phaseFor(subDays(event, 3), event)).toBe("reminder");
    expect(phaseFor(event, event)).toBe("day_of");
    expect(phaseFor(addDays(event, 2), event)).toBe("follow_up");
  });

  it("parseDateInput reads YYYY-MM-DD as local-midnight (no UTC off-by-one)", () => {
    const d = parseDateInput("2026-08-15")!;
    // assert via local components so it holds regardless of host TZ
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 15]);
    expect(parseDateInput("")).toBe(null);
    expect(parseDateInput("not-a-date")).toBe(null);
  });
});
