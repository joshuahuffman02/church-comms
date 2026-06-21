import { atMidnight, addDays } from "./engine/dates";

export function weekRange(d: Date) {
  const day = atMidnight(d);
  const offset = (day.getDay() + 6) % 7; // Mon=0
  const start = addDays(day, -offset);
  return { start, end: addDays(start, 6) };
}

type DLite = { productionDueAt: Date | null; status: string };
const DONE_DELIVERABLE_STATUSES = new Set(["ready", "scheduled", "published", "skipped"]);

export function bucketForDeliverable(d: DLite, today: Date): "make" | "at_risk" | "other" {
  if (!d.productionDueAt) return "other";
  const due = atMidnight(d.productionDueAt);
  const done = DONE_DELIVERABLE_STATUSES.has(d.status);
  if (due < atMidnight(today) && !done) return "at_risk";
  const { start, end } = weekRange(today);
  if (due >= start && due <= end && !done) return "make";
  return "other";
}

/** Coming Sunday = next date with getDay()===0 from today, inclusive. */
export function comingSunday(today: Date): Date {
  const day = atMidnight(today);
  const offset = (7 - day.getDay()) % 7; // 0 when today is already Sunday
  return addDays(day, offset);
}

type LoopTouch = { scheduledAt: Date; request: { title: string } };
export function loopChangesForSunday<T extends LoopTouch>(touches: T[], sunday: Date) {
  const s = atMidnight(sunday);
  const prev = addDays(s, -7);
  const add = touches.filter(t => atMidnight(t.scheduledAt).getTime() === s.getTime());
  const remove = touches.filter(t => atMidnight(t.scheduledAt).getTime() === prev.getTime());
  return { add, remove };
}
