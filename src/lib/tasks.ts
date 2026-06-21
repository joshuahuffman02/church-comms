import { db } from "./db";
import { atMidnight } from "./engine/dates";
import { weekRange } from "./week";

/**
 * Task ownership + the "My Tasks" data layer.
 *
 * A deliverable's *effective* owner is its own `ownerId` if set, otherwise it
 * inherits the parent request's `ownerId`. So assigning a whole event to
 * someone makes every channel deliverable theirs by default, while a
 * per-deliverable owner can override for a single channel.
 */

/** A deliverable carries an optional explicit owner. */
type OwnedDeliverable = { ownerId?: string | null };
/** Its request carries the fallback owner. */
type OwnedRequest = { ownerId?: string | null };

/**
 * The effective owner of a deliverable: its own owner wins, else the request's
 * owner, else nobody (null). Pure — safe to unit test and reuse anywhere.
 */
export function effectiveOwnerId(
  deliverable: OwnedDeliverable,
  request: OwnedRequest
): string | null {
  return deliverable.ownerId ?? request.ownerId ?? null;
}

/** Up to two uppercase initials from a name (e.g. "Jane Smith" -> "JS"). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Bucket keys for the My Tasks view, in display order. */
export type TaskBucket = "overdue" | "thisWeek" | "awaitingProof" | "upcoming";

/** One row in the My Tasks view: a deliverable plus the bits the UI needs. */
export type MyTask = {
  id: string;
  requestId: string;
  requestTitle: string;
  channelName: string;
  channelColor: string;
  status: string;
  productionDueAt: Date | null;
  /** True when this deliverable's owner is explicit (vs. inherited from the request). */
  explicitOwner: boolean;
};

export type MyTasksResult = {
  overdue: MyTask[];
  thisWeek: MyTask[];
  awaitingProof: MyTask[];
  upcoming: MyTask[];
  /** Total across all buckets — handy for nav badges / empty states. */
  total: number;
};

/** Statuses that count as "done" — they never show as overdue or upcoming work. */
const DONE = new Set(["ready", "scheduled", "published", "skipped"]);

/**
 * Decide which bucket a single task falls into, given today.
 *
 * Precedence (mirrors how a person triages their day):
 *   1. Awaiting proof — anything sitting in "proof" needs a sign-off decision,
 *      regardless of date.
 *   2. Overdue — past its make-by date and not yet done.
 *   3. This week — make-by date falls in the current Mon–Sun week.
 *   4. Upcoming — everything else still to do (future, or no date yet).
 *
 * Done deliverables (ready/scheduled/published/skipped) that aren't in "proof"
 * drop out entirely (return null) so finished work doesn't clutter the list.
 */
export function bucketForTask(
  d: { productionDueAt: Date | null; status: string },
  today: Date
): TaskBucket | null {
  if (d.status === "proof") return "awaitingProof";
  if (DONE.has(d.status)) return null;

  const todayMid = atMidnight(today);
  if (d.productionDueAt) {
    const due = atMidnight(d.productionDueAt);
    if (due < todayMid) return "overdue";
    const { start, end } = weekRange(today);
    if (due >= start && due <= end) return "thisWeek";
  }
  return "upcoming";
}

/**
 * Every deliverable whose *effective* owner is `userId`, bucketed for the My
 * Tasks view. Pulls deliverables owned directly OR whose request is owned by
 * the user, then filters to the true effective owner (so a request-owned
 * deliverable that's been explicitly re-assigned to someone else drops out).
 *
 * A clean data function: no auth, no revalidation — callers handle those.
 */
export async function myTasks(userId: string, today: Date): Promise<MyTasksResult> {
  const deliverables = await db.deliverable.findMany({
    where: {
      OR: [{ ownerId: userId }, { request: { ownerId: userId } }],
    },
    include: {
      channel: { select: { name: true, color: true } },
      request: { select: { id: true, title: true, ownerId: true } },
    },
    orderBy: { productionDueAt: "asc" },
  });

  const result: MyTasksResult = {
    overdue: [],
    thisWeek: [],
    awaitingProof: [],
    upcoming: [],
    total: 0,
  };

  for (const d of deliverables) {
    // Effective-owner guard: a deliverable explicitly owned by someone else
    // must not appear just because the request is mine.
    if (effectiveOwnerId(d, d.request) !== userId) continue;

    const bucket = bucketForTask(d, today);
    if (!bucket) continue;

    const task: MyTask = {
      id: d.id,
      requestId: d.request.id,
      requestTitle: d.request.title,
      channelName: d.channel.name,
      channelColor: d.channel.color,
      status: d.status,
      productionDueAt: d.productionDueAt,
      explicitOwner: d.ownerId != null,
    };
    result[bucket].push(task);
    result.total += 1;
  }

  return result;
}
