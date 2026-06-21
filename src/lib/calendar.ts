import { atMidnight, addDays } from "./engine/dates";
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
