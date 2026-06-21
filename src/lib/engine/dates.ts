// INVARIANT: every Date produced/consumed here represents CHURCH-LOCAL MIDNIGHT
// (date-only, constructed via the local-time `new Date(y, m, d)`). Consumers MUST
// re-normalize any stored/incoming date with `atMidnight` on read before comparing
// or doing date math. Do NOT call `.toISOString()` on one of these dates for display:
// on a non-UTC host that yields an off-by-one calendar day (local midnight prints as
// the previous day in UTC). Format with local getters / a date library instead.
import type { Phase } from "./types";

export function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d: Date, n: number): Date {
  const r = atMidnight(d); r.setDate(r.getDate() + n); return r;
}
export function subDays(d: Date, n: number): Date { return addDays(d, -n); }

/** Later of two church-local-midnight dates (pure; both re-normalized first). */
export function maxDate(a: Date, b: Date): Date {
  return atMidnight(a) >= atMidnight(b) ? atMidnight(a) : atMidnight(b);
}
/** Earlier of two church-local-midnight dates (pure; both re-normalized first). */
export function minDate(a: Date, b: Date): Date {
  return atMidnight(a) <= atMidnight(b) ? atMidnight(a) : atMidnight(b);
}

/**
 * Parse a `YYYY-MM-DD` form value (e.g. from <input type="date">) as CHURCH-LOCAL
 * midnight. Avoids the UTC off-by-one of `new Date("2026-08-15")` (which is UTC
 * midnight and reads back as the previous day on hosts behind UTC). Returns null
 * if the string isn't a valid YYYY-MM-DD date.
 */
export function parseDateInput(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function weekdaysBetween(start: Date, end: Date, weekdays: number[]): Date[] {
  const out: Date[] = [];
  for (let d = atMidnight(start); d <= atMidnight(end); d = addDays(d, 1)) {
    if (weekdays.includes(d.getDay())) out.push(d);
  }
  return out;
}

export function phaseFor(date: Date, event: Date): Phase {
  const days = Math.round((atMidnight(event).getTime() - atMidnight(date).getTime()) / 86400000);
  if (days < 0) return "follow_up";
  if (days === 0) return "day_of";
  if (days <= 4) return "reminder";
  if (days <= 14) return "register";
  return "awareness";
}
