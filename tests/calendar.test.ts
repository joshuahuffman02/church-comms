import { describe, it, expect } from "vitest";
import { calendarDateKey, monthGrid, monthGridRange } from "../src/lib/calendar";

describe("monthGrid", () => {
  it("June 2026 starts on Monday and has 5 weeks", () => {
    const grid = monthGrid(2026, 5); // month is 0-based: 5 = June
    expect(grid[0][0].toISOString().slice(0,10)).toBe("2026-06-01"); // Mon
    expect(grid.length).toBe(5);
    expect(grid.flat().some(d => d.toISOString().slice(0,10) === "2026-06-22")).toBe(true);
  });

  it("returns a bounded query range for every visible calendar day", () => {
    const range = monthGridRange(monthGrid(2026, 6));
    expect(calendarDateKey(range.start)).toBe("2026-06-29");
    expect(calendarDateKey(range.endExclusive)).toBe("2026-08-03");
  });

  it("formats date keys with local calendar fields", () => {
    expect(calendarDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
