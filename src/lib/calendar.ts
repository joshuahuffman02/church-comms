import { atMidnight, addDays } from "./engine/dates";

/** Stable church-local date key. Avoid UTC conversion for date-only UI. */
export function calendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Mon=0
  const start = addDays(atMidnight(first), -offset);
  const weeks: Date[][] = [];
  let cur = start;
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cur, i));
    weeks.push(week);
    cur = addDays(cur, 7);
    if (cur.getMonth() !== month && week.some(d => d.getMonth() === month) && cur > new Date(year, month + 1, 0)) break;
  }
  return weeks.filter(week => week.some(d => d.getMonth() === month));
}

/** Inclusive grid start and exclusive grid end for bounded calendar queries. */
export function monthGridRange(grid: Date[][]): { start: Date; endExclusive: Date } {
  const first = grid[0]?.[0];
  const lastWeek = grid[grid.length - 1];
  const last = lastWeek?.[lastWeek.length - 1];
  if (!first || !last) throw new Error("Calendar grid cannot be empty");
  return { start: atMidnight(first), endExclusive: addDays(last, 1) };
}
