// Pure recurrence math for RecurringSeries. Every Date here is CHURCH-LOCAL
// MIDNIGHT (see src/lib/engine/dates.ts) — we build dates with the local-time
// `new Date(y, m, d)` constructor and never call `.toISOString()` for logic, so
// occurrences land on the intended calendar day on any host timezone.
import { atMidnight, addDays } from "@/lib/engine/dates";

/**
 * The cadence-relevant subset of a RecurringSeries. Accepting a shape (not the
 * Prisma type) keeps this module pure/unit-testable and decoupled from the DB
 * row (which carries title/tier/etc. that don't affect the date math).
 */
export interface SeriesLike {
  frequency: string; // "daily" | "weekly" | "monthly"
  interval: number; // every N days/weeks/months (>= 1)
  weekday: number | null; // 0=Sun..6=Sat, weekly only
  dayOfMonth: number | null; // 1-31, monthly only
  startDate: Date;
  untilDate: Date | null;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Last calendar day of the given year/month (month 0-based). */
function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this month.
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Compute the occurrence dates for a series, in ascending order, from its
 * startDate up to (and including) `min(untilDate, horizonEnd)`.
 *
 * Weekly: anchored on the first `weekday` on/after startDate (or startDate's own
 * weekday when `weekday` is null), then every `interval` weeks.
 * Monthly: on `dayOfMonth` (or startDate's day when null), clamped to each
 * month's length, then every `interval` months. Months whose anchor day falls
 * before startDate are skipped.
 *
 * Returns `[]` if the series never lands within the window.
 */
export function occurrenceDates(series: SeriesLike, horizonEnd: Date): Date[] {
  const interval = Math.max(1, Math.trunc(series.interval || 1));
  const start = atMidnight(series.startDate);
  const horizon = atMidnight(horizonEnd);
  const until = series.untilDate ? atMidnight(series.untilDate) : null;
  // The effective last day we'll emit: the earlier of horizon and untilDate.
  const end = until && until < horizon ? until : horizon;
  if (end < start) return [];

  const out: Date[] = [];

  if (series.frequency === "daily") {
    let cur = start;
    for (let guard = 0; guard < 20000 && cur <= end; guard++) {
      out.push(cur);
      cur = addDays(cur, interval);
    }
    return out;
  }

  if (series.frequency === "monthly") {
    const anchorDay = series.dayOfMonth ?? start.getDate();
    // Walk months from the start month forward in `interval` steps.
    let year = start.getFullYear();
    let month = start.getMonth(); // 0-based
    // Safety bound: never loop more than ~50 years of steps.
    for (let guard = 0; guard < 1200; guard++) {
      const day = Math.min(anchorDay, lastDayOfMonth(year, month));
      const d = new Date(year, month, day);
      if (d > end) break;
      if (d >= start) out.push(d);
      // Advance by `interval` months.
      month += interval;
      year += Math.floor(month / 12);
      month = ((month % 12) + 12) % 12;
    }
    return out;
  }

  // Default: weekly.
  const targetWeekday = series.weekday ?? start.getDay();
  // First occurrence: the first `targetWeekday` on/after startDate.
  const offset = ((targetWeekday - start.getDay()) % 7 + 7) % 7;
  let cur = addDays(start, offset);
  const stepDays = 7 * interval;
  for (let guard = 0; guard < 5000 && cur <= end; guard++) {
    out.push(cur);
    cur = addDays(cur, stepDays);
  }
  return out;
}

/** Human-readable cadence, e.g. "Every 2 weeks on Tuesday" / "Every month on day 15". */
export function cadenceSummary(series: SeriesLike): string {
  const n = Math.max(1, Math.trunc(series.interval || 1));
  if (series.frequency === "daily") {
    return n === 1 ? "Every day" : `Every ${n} days`;
  }
  if (series.frequency === "monthly") {
    const unit = n === 1 ? "Every month" : `Every ${n} months`;
    const day = series.dayOfMonth ?? atMidnight(series.startDate).getDate();
    return `${unit} on day ${day}`;
  }
  const unit = n === 1 ? "Every week" : `Every ${n} weeks`;
  const wd = series.weekday ?? atMidnight(series.startDate).getDay();
  return `${unit} on ${WEEKDAY_NAMES[wd] ?? "?"}`;
}

export type InferredRecurrence = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  weekday: number | null;
  dayOfMonth: number | null;
};

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

function monthNumber(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

function sameLocalDates(left: Date[], right: Date[]): boolean {
  return left.length === right.length && left.every((date, index) =>
    calendarDayNumber(date) === calendarDayNumber(right[index]),
  );
}

/**
 * Infer a simple, lossless cadence from existing event dates. The inferred
 * series must reproduce every supplied date without inventing missing dates in
 * between, so irregular calendar imports are never silently converted into the
 * wrong recurrence.
 */
export function inferRecurrencePattern(inputDates: Date[]): InferredRecurrence | null {
  const dates = [...new Map(
    inputDates
      .map(atMidnight)
      .map((date) => [calendarDayNumber(date), date] as const),
  ).values()].sort((a, b) => a.getTime() - b.getTime());
  if (dates.length < 2) return null;

  const first = dates[0];
  const last = dates[dates.length - 1];
  const dayGaps = dates.slice(1).map((date, index) =>
    calendarDayNumber(date) - calendarDayNumber(dates[index]),
  );
  const exactDayGap = dayGaps.every((gap) => gap === dayGaps[0]) ? dayGaps[0] : null;

  const candidates: InferredRecurrence[] = [];

  // Prefer a weekly description for exact whole-week patterns (including
  // every four weeks), then daily for true day-based patterns.
  if (exactDayGap && exactDayGap > 0 && exactDayGap % 7 === 0) {
    candidates.push({
      frequency: "weekly",
      interval: exactDayGap / 7,
      weekday: first.getDay(),
      dayOfMonth: null,
    });
  }
  if (exactDayGap && exactDayGap > 0) {
    candidates.push({
      frequency: "daily",
      interval: exactDayGap,
      weekday: null,
      dayOfMonth: null,
    });
  }

  const anchorDay = Math.max(...dates.map((date) => date.getDate()));
  const monthGaps = dates.slice(1).map((date, index) =>
    monthNumber(date) - monthNumber(dates[index]),
  );
  const exactMonthGap = monthGaps.every((gap) => gap === monthGaps[0]) ? monthGaps[0] : null;
  const followsMonthlyAnchor = dates.every((date) =>
    date.getDate() === Math.min(anchorDay, lastDayOfMonth(date.getFullYear(), date.getMonth())),
  );
  if (exactMonthGap && exactMonthGap > 0 && followsMonthlyAnchor) {
    candidates.unshift({
      frequency: "monthly",
      interval: exactMonthGap,
      weekday: null,
      dayOfMonth: anchorDay,
    });
  }

  return candidates.find((candidate) => {
    const generated = occurrenceDates(
      {
        ...candidate,
        startDate: first,
        untilDate: last,
      },
      last,
    );
    return sameLocalDates(generated, dates);
  }) ?? null;
}
