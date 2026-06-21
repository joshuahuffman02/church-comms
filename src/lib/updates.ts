// Pure logic for the "Event Message Arc / Updates" feature: ordering a set of
// dated message phases, finding the phase active as of a given date, and
// proposing a sensible starter arc working back from the event. Everything here
// is deterministic and side-effect free (no Date.now, no DB) so it can be unit
// tested in isolation; the server actions in `src/actions/updates.ts` and the
// UI in `src/components/event-updates.tsx` build on top of it.
//
// INVARIANT (see `src/lib/engine/dates.ts`): every date here represents
// CHURCH-LOCAL MIDNIGHT. We re-normalize incoming dates with `atMidnight`
// before comparing so a stored DateTime with a stray time-of-day still compares
// by calendar day.
import { atMidnight, addDays, subDays } from "./engine/dates";

/** The kinds an EventUpdate phase can be tagged with. */
export type UpdateKind =
  | "save_the_date"
  | "register"
  | "reminder"
  | "last_call"
  | "day_of"
  | "follow_up"
  | "logistics"
  | "adhoc";

/** Human-friendly label for each {@link UpdateKind} chip. */
export const KIND_LABEL: Record<string, string> = {
  save_the_date: "Save the date",
  register: "Registration open",
  reminder: "Reminder",
  last_call: "Last call",
  day_of: "Day-of",
  follow_up: "Follow-up",
  logistics: "Logistics",
  adhoc: "Ad-hoc",
};

/** Per-channel copy override for one channel within a phase. */
export type ChannelCopyEntry = { content?: string; assetLink?: string };

/** The per-channel copy map carried by an EventUpdate: channelKey → entry. */
export type ChannelCopyMap = Record<string, ChannelCopyEntry>;

/**
 * The minimal shape of an update the pure logic needs. The DB row carries more
 * (id, body, kind, channelCopy, …); those are optional here so callers can pass
 * either a trimmed projection or the full Prisma row.
 */
export type EventUpdateLite = {
  scheduledFor: Date;
  title: string;
  status: string;
  sortOrder: number;
  id?: string;
  body?: string | null;
  kind?: string | null;
  channelCopy?: ChannelCopyMap | null;
};

/**
 * Sort updates by `scheduledFor` ascending, then `sortOrder` ascending as the
 * same-day tiebreaker. Pure: returns a new array, never mutates the input.
 */
export function sortUpdates<T extends EventUpdateLite>(updates: T[]): T[] {
  return [...updates].sort((a, b) => {
    const da = atMidnight(a.scheduledFor).getTime();
    const dbt = atMidnight(b.scheduledFor).getTime();
    if (da !== dbt) return da - dbt;
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * The "current message phase" as of `asOf`: the latest update whose
 * `scheduledFor` is on or before `asOf` (compared at church-local midnight).
 * Returns null when no phase has started yet (asOf precedes the first phase) or
 * the arc is empty. When several phases share the active day, the one latest in
 * sort order wins (it's the most recent to take effect).
 */
export function activeUpdateAt<T extends EventUpdateLite>(
  updates: T[],
  asOf: Date
): T | null {
  const cutoff = atMidnight(asOf).getTime();
  const eligible = sortUpdates(updates).filter(
    (u) => atMidnight(u.scheduledFor).getTime() <= cutoff
  );
  return eligible.length ? eligible[eligible.length - 1] : null;
}

/**
 * Filter updates whose `scheduledFor` falls within the inclusive
 * [weekStart, weekEnd] window (both compared at church-local midnight), sorted
 * the same way as {@link sortUpdates}. Used to surface "message updates due this
 * week" on the This Week board and the run sheet. Pure — no Date.now, no DB.
 */
export function updatesInWeek<T extends EventUpdateLite>(
  updates: T[],
  weekStart: Date,
  weekEnd: Date
): T[] {
  const lo = atMidnight(weekStart).getTime();
  // Half-open upper bound (day after weekEnd) so the whole of weekEnd counts.
  const hi = addDays(atMidnight(weekEnd), 1).getTime();
  return sortUpdates(updates).filter((u) => {
    const t = atMidnight(u.scheduledFor).getTime();
    return t >= lo && t < hi;
  });
}

/** One proposed phase from {@link suggestStarterArc}. */
export type StarterPhase = { title: string; kind: UpdateKind; scheduledFor: Date };

/**
 * Propose a standard message arc for an event, working back from the event date
 * (and the registration close, when present). Deterministic — no Date.now.
 *
 * Phases (church-local midnight):
 *  - Save the date  : event − 28d
 *  - Registration open : registrationClosesAt − 14d, else event − 21d
 *  - Last call      : registrationClosesAt − 3d, else event − 3d
 *  - Day-of         : the event date itself
 *
 * The derived dates are then clamped so the sequence is non-decreasing and no
 * phase lands after the event (short runways collapse earlier phases forward
 * rather than producing out-of-order or post-event dates). Day-of always stays
 * exactly on the event.
 */
export function suggestStarterArc(
  eventStart: Date,
  registrationClosesAt: Date | null
): StarterPhase[] {
  const event = atMidnight(eventStart);
  const regCloses = registrationClosesAt ? atMidnight(registrationClosesAt) : null;

  // Raw, un-clamped targets in chronological order.
  const raw: StarterPhase[] = [
    { title: "Save the date", kind: "save_the_date", scheduledFor: subDays(event, 28) },
    {
      title: "Registration open",
      kind: "register",
      scheduledFor: regCloses ? subDays(regCloses, 14) : subDays(event, 21),
    },
    {
      title: "Last call",
      kind: "last_call",
      scheduledFor: regCloses ? subDays(regCloses, 3) : subDays(event, 3),
    },
    { title: "Day-of", kind: "day_of", scheduledFor: event },
  ];

  // Clamp each date to be (a) not after the event and (b) not before the prior
  // phase, so the arc is ordered and bounded regardless of a tight runway.
  let prev = -Infinity;
  return raw.map((p) => {
    let t = Math.min(atMidnight(p.scheduledFor).getTime(), event.getTime());
    if (t < prev) t = prev;
    prev = t;
    return { ...p, scheduledFor: new Date(t) };
  });
}
