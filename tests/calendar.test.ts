import { describe, it, expect } from "vitest";
import { monthGrid } from "../src/lib/calendar";

describe("monthGrid", () => {
  it("June 2026 starts on Monday and has 5 weeks", () => {
    const grid = monthGrid(2026, 5); // month is 0-based: 5 = June
    expect(grid[0][0].toISOString().slice(0,10)).toBe("2026-06-01"); // Mon
    expect(grid.length).toBe(5);
    expect(grid.flat().some(d => d.toISOString().slice(0,10) === "2026-06-22")).toBe(true);
  });
});
