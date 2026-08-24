import { db } from "./db";
import { addDays, atMidnight } from "./engine/dates";
import { productionNeeds, type ProductionNeed } from "./production-needs";
import { describeRequestProvenance } from "./provenance";
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
  eventStart: Date;
  status: string;
  productionDueAt: Date | null;
  /** True when this deliverable's owner is explicit (vs. inherited from the request). */
  explicitOwner: boolean;
  sourceLabel: string;
  requesterLabel: string;
  ownerLabel: string;
  productionNeeds: ProductionNeed[];
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
const DONE_STATUSES = ["ready", "scheduled", "published", "skipped"];
const DONE = new Set(DONE_STATUSES);

type DatedPlacement = { scheduledAt: Date };

/**
 * A dated channel stops being actionable after its final placement has passed.
 * Deliverables without touches remain visible because they may be legitimate
 * unscheduled work that still needs attention.
 */
export function hasCurrentPlacement(touches: DatedPlacement[], today: Date): boolean {
  if (touches.length === 0) return true;
  const day = atMidnight(today);
  return touches.some((touch) => atMidnight(touch.scheduledAt) >= day);
}

export type MyTasksFocus = {
  recentOverdue: MyTask[];
  oldBacklog: MyTask[];
  nearTerm: MyTask[];
  later: MyTask[];
  actionTotal: number;
};

/**
 * Keep the daily view bounded without losing work. Recently overdue means the
 * previous two weeks; coming next means the next 30 days. Older/farther items
 * remain counted and available, but do not become a wall on first load.
 */
export function focusMyTasks(
  tasks: MyTasksResult,
  today: Date,
  recentDays = 14,
  upcomingDays = 30,
): MyTasksFocus {
  const day = atMidnight(today);
  const recentCutoff = addDays(day, -recentDays);
  const upcomingCutoff = addDays(day, upcomingDays);
  const recentOverdue = tasks.overdue.filter(
    (task) => task.productionDueAt && atMidnight(task.productionDueAt) >= recentCutoff,
  );
  const recentIds = new Set(recentOverdue.map((task) => task.id));
  const oldBacklog = tasks.overdue.filter((task) => !recentIds.has(task.id));
  const nearTerm = tasks.upcoming.filter(
    (task) => task.productionDueAt && atMidnight(task.productionDueAt) <= upcomingCutoff,
  );
  const nearIds = new Set(nearTerm.map((task) => task.id));
  const later = tasks.upcoming.filter((task) => !nearIds.has(task.id));

  return {
    recentOverdue,
    oldBacklog,
    nearTerm,
    later,
    actionTotal: recentOverdue.length + tasks.thisWeek.length + tasks.awaitingProof.length,
  };
}

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
      status: { notIn: DONE_STATUSES },
      OR: [{ ownerId: userId }, { request: { ownerId: userId } }],
    },
    include: {
      channel: { select: { name: true, color: true } },
      owner: { select: { name: true } },
      request: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          eventStart: true,
          pcoEventId: true,
          externalCalendarKey: true,
          description: true,
          nextStepText: true,
          nextStepUrl: true,
          needsRegistration: true,
          registrationUrl: true,
          requesterName: true,
          requesterEmail: true,
          requester: { select: { name: true } },
          owner: { select: { name: true } },
          assets: {
            where: { isFinal: true },
            select: { id: true },
            take: 1,
          },
        },
      },
      touches: {
        select: {
          scheduledAt: true,
          content: true,
          assetLink: true,
        },
      },
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
    // A one-shot or multi-week placement is no longer useful here once every
    // scheduled appearance is in the past. Do not turn expired advertising
    // opportunities into permanent overdue production tasks.
    if (!hasCurrentPlacement(d.touches, today)) continue;

    const bucket = bucketForTask(d, today);
    if (!bucket) continue;
    const provenance = describeRequestProvenance(
      d.request,
      d.owner?.name ?? d.request.owner?.name,
    );

    const task: MyTask = {
      id: d.id,
      requestId: d.request.id,
      requestTitle: d.request.title,
      channelName: d.channel.name,
      channelColor: d.channel.color,
      eventStart: d.request.eventStart,
      status: d.status,
      productionDueAt: d.productionDueAt,
      explicitOwner: d.ownerId != null,
      sourceLabel: provenance.sourceLabel,
      requesterLabel: provenance.requesterLabel,
      ownerLabel: provenance.ownerLabel,
      productionNeeds: productionNeeds({
        requestId: d.request.id,
        channelName: d.channel.name,
        pieceStatus: d.status,
        ownerReady: true,
        description: d.request.description,
        nextStepText: d.request.nextStepText,
        nextStepUrl: d.request.nextStepUrl,
        needsRegistration: d.request.needsRegistration,
        registrationUrl: d.request.registrationUrl,
        hasChannelCopy:
          Boolean(d.notes?.trim()) ||
          d.touches.some((touch) => Boolean(touch.content?.trim())),
        hasCreativeAsset:
          Boolean(d.assetLink?.trim()) ||
          d.touches.some((touch) => Boolean(touch.assetLink?.trim())) ||
          d.request.assets.length > 0,
      }),
    };
    result[bucket].push(task);
    result.total += 1;
  }

  return result;
}
