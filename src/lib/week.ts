import { atMidnight, addDays } from "./engine/dates";

export function weekRange(d: Date) {
  const day = atMidnight(d);
  const offset = (day.getDay() + 6) % 7; // Mon=0
  const start = addDays(day, -offset);
  return { start, end: addDays(start, 6) };
}

type DLite = { productionDueAt: Date | null; status: string };
export const DONE_DELIVERABLE_STATUSES = ["ready", "scheduled", "published", "skipped"] as const;
const DONE_DELIVERABLE_STATUS_SET = new Set<string>(DONE_DELIVERABLE_STATUSES);

export function bucketForDeliverable(d: DLite, today: Date): "make" | "at_risk" | "other" {
  if (!d.productionDueAt) return "other";
  const due = atMidnight(d.productionDueAt);
  const done = DONE_DELIVERABLE_STATUS_SET.has(d.status);
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

type LoopTouch = { scheduledAt: Date; request: { id: string; title: string } };
export function loopChangesForSunday<T extends LoopTouch>(touches: T[], sunday: Date) {
  const s = atMidnight(sunday);
  const prev = addDays(s, -7);
  const current = touches.filter(t => atMidnight(t.scheduledAt).getTime() === s.getTime());
  const previous = touches.filter(t => atMidnight(t.scheduledAt).getTime() === prev.getTime());
  const currentRequestIds = new Set(current.map((touch) => touch.request.id));
  const previousRequestIds = new Set(previous.map((touch) => touch.request.id));

  // A continuing slide is neither an add nor a removal. Comparing request IDs
  // (instead of titles) also keeps two same-named events from cancelling out.
  const add = current.filter((touch) => !previousRequestIds.has(touch.request.id));
  const remove = previous.filter((touch) => !currentRequestIds.has(touch.request.id));
  return { add, remove };
}
