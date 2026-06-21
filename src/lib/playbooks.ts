// Pure logic for the "Event Playbooks" feature: turning a playbook's relative
// task offsets into concrete due dates for a dated event, filtering the tasks
// that land in a given week, and ordering a checklist by due date. Everything
// here is deterministic and side-effect free (no Date.now, no DB) so it can be
// unit tested in isolation; the server actions in `src/actions/playbooks.ts`
// and the UI in `src/components/event-tasks.tsx` build on top of it.
//
// INVARIANT (see `src/lib/engine/dates.ts`): every date here represents
// CHURCH-LOCAL MIDNIGHT. We re-normalize incoming dates with `atMidnight`
// before comparing / doing date math so a stored DateTime with a stray
// time-of-day still compares by calendar day.
import { atMidnight, addDays, subDays } from "./engine/dates";

/**
 * The minimal shape needed to compute a task's due date from a playbook offset.
 * `offsetDays` is the number of days BEFORE the event the task is due; `null`
 * means the task carries no date (a standing reminder with no deadline).
 */
export type TaskOffset = { offsetDays: number | null };

/** A task with its concrete (or absent) due date attached. */
export type DatedTask<T> = T & { dueAt: Date | null };

/**
 * Compute each task's due date from the event date and the task's `offsetDays`:
 * `dueAt = offsetDays == null ? null : eventStart − offsetDays` (church-local
 * midnight). Pure: returns a new array of `{ ...task, dueAt }`, never mutates.
 */
export function computeTaskDueDates<T extends TaskOffset>(
  eventStart: Date,
  tasks: T[]
): DatedTask<T>[] {
  const event = atMidnight(eventStart);
  return tasks.map((t) => ({
    ...t,
    dueAt: t.offsetDays == null ? null : subDays(event, t.offsetDays),
  }));
}

/**
 * The minimal shape the week / sort helpers need. The DB row carries more
 * (id, title, notes, category, …); those are irrelevant here so callers can
 * pass either a trimmed projection or the full Prisma row.
 */
export type TaskLite = { dueAt: Date | null; status: string; sortOrder?: number };

/**
 * Filter tasks whose `dueAt` falls within the inclusive [weekStart, weekEnd]
 * window (both compared at church-local midnight). Tasks with a null `dueAt`
 * (no deadline) are excluded — they never "land" in a particular week. Used to
 * surface "admin tasks due this week" on the This Week board. Pure — no
 * Date.now, no DB.
 */
export function tasksInWeek<T extends TaskLite>(
  tasks: T[],
  weekStart: Date,
  weekEnd: Date
): T[] {
  const lo = atMidnight(weekStart).getTime();
  // Half-open upper bound (day after weekEnd) so the whole of weekEnd counts.
  const hi = addDays(atMidnight(weekEnd), 1).getTime();
  return tasks.filter((t) => {
    if (t.dueAt == null) return false;
    const time = atMidnight(t.dueAt).getTime();
    return time >= lo && time < hi;
  });
}

/**
 * Sort a checklist by `dueAt` ascending with NULLS LAST (undated tasks sink to
 * the bottom), then by `sortOrder` ascending as the tiebreaker (missing
 * sortOrder treated as 0). Pure: returns a new array, never mutates the input.
 */
export function sortTasks<T extends TaskLite>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const aNull = a.dueAt == null;
    const bNull = b.dueAt == null;
    if (aNull !== bNull) return aNull ? 1 : -1; // nulls last
    if (!aNull && !bNull) {
      const da = atMidnight(a.dueAt as Date).getTime();
      const dbt = atMidnight(b.dueAt as Date).getTime();
      if (da !== dbt) return da - dbt;
    }
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}
