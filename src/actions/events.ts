"use server";
import { db } from "@/lib/db";
import { requireAdmin, requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { atMidnight } from "@/lib/engine/dates";
import { eventLocalDateKey, normalizeEventTitle } from "@/lib/events-overview";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** Paths that surface scheduled work and need refreshing after a change. */
function revalidateSchedules() {
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/pipeline");
  revalidatePath("/guardrails");
  revalidatePath("/outputs");
  revalidatePath("/assign");
}

export type MergeDuplicateResult =
  | { ok: true; keptId: string; title: string; archived: number }
  | { ok: false; message: string };

const REQUEST_STATUS_WEIGHT: Record<string, number> = {
  submitted: 1,
  needs_info: 1,
  triaged: 2,
  approved: 3,
  in_production: 4,
  proof: 5,
  scheduled: 6,
  published: 7,
};

const DELIVERABLE_STATUS_WEIGHT: Record<string, number> = {
  skipped: 0,
  to_design: 1,
  in_progress: 2,
  proof: 3,
  ready: 4,
  scheduled: 5,
  published: 6,
};

const TOUCH_STATUS_WEIGHT: Record<string, number> = {
  skipped: 0,
  scheduled: 1,
  published: 2,
};

function richerText(values: Array<string | null | undefined>): string | null {
  return values
    .filter((value): value is string => !!value?.trim())
    .sort((a, b) => b.trim().length - a.trim().length)[0] ?? null;
}

function dateKey(date: Date | null): string {
  return date ? String(date.getTime()) : "";
}

function deliverableKey(deliverable: {
  channelId: string;
  instanceDate: Date | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  phase: string | null;
}): string {
  return [
    deliverable.channelId,
    dateKey(deliverable.instanceDate),
    dateKey(deliverable.windowStart),
    dateKey(deliverable.windowEnd),
    deliverable.phase ?? "",
  ].join("|");
}

/**
 * Consolidate exact same-title/same-date records without losing source identity.
 * One imported record remains primary; extra Request rows are archived (rather
 * than deleted) so later PCO/calendar syncs still recognize those source IDs.
 */
export async function mergeDuplicateEvents(requestIds: string[]): Promise<MergeDuplicateResult> {
  const user = await requireEditor();
  const ids = [...new Set(requestIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length < 2 || ids.length > 20) {
    return { ok: false, message: "Choose at least two copies of the same event." };
  }

  const result = await db.$transaction(async (tx) => {
    const rows = await tx.request.findMany({
      where: { id: { in: ids } },
      include: {
        ministries: { select: { id: true } },
        assets: true,
        deliverables: { include: { touches: true } },
        approvals: true,
        updates: true,
        tasks: true,
        videoTop3: true,
        scheduleLocks: true,
        _count: {
          select: {
            assets: true,
            deliverables: true,
            approvals: true,
            updates: true,
            tasks: true,
            videoTop3: true,
            scheduleLocks: true,
          },
        },
      },
    });
    if (rows.length !== ids.length) {
      return { ok: false as const, message: "One of these event copies no longer exists. Refresh and try again." };
    }

    const titleKeys = new Set(rows.map((row) => normalizeEventTitle(row.title)));
    const eventDates = new Set(rows.map((row) => eventLocalDateKey(row.eventStart.getTime())));
    if (titleKeys.size !== 1 || eventDates.size !== 1 || ![...titleKeys][0]) {
      return { ok: false as const, message: "Only exact same-title, same-date copies can be merged." };
    }
    const seriesIds = [...new Set(rows.map((row) => row.seriesId).filter((id): id is string => !!id))];
    if (seriesIds.length > 1) {
      return { ok: false as const, message: "These copies belong to different recurring series and need manual review." };
    }

    // Keep a source-linked row primary so future imports update the merged
    // event. The workflow/work counts then break ties in favor of the record
    // staff have already invested in.
    const score = (row: typeof rows[number]) => {
      const sourceWeight = row.pcoEventId ? 3 : row.externalCalendarKey ? 2 : 1;
      const work = row._count.deliverables * 12 + row._count.tasks * 8 + row._count.assets * 5 +
        row._count.updates * 5 + row._count.approvals * 3 + row._count.scheduleLocks * 3 + row._count.videoTop3 * 3;
      return sourceWeight * 100_000 + (REQUEST_STATUS_WEIGHT[row.status] ?? 0) * 1_000 +
        work + (row.ownerId ? 20 : 0) + (row.description ? Math.min(row.description.length, 100) / 100 : 0);
    };
    const ordered = [...rows].sort((a, b) => score(b) - score(a) || a.createdAt.getTime() - b.createdAt.getTime());
    const primary = ordered[0];
    const extras = ordered.slice(1);
    const extraIds = extras.map((row) => row.id);
    const ministryIds = [...new Set(ordered.flatMap((row) => row.ministries.map((ministry) => ministry.id)))];
    const bestStatus = [...ordered].sort(
      (a, b) => (REQUEST_STATUS_WEIGHT[b.status] ?? 0) - (REQUEST_STATUS_WEIGHT[a.status] ?? 0),
    )[0].status;
    const bestOwner = ordered.find((row) => row.ownerId)?.ownerId ?? null;
    const bestRequester = ordered.find((row) => row.requesterId)?.requesterId ?? null;
    const endDates = ordered.map((row) => row.eventEnd).filter((date): date is Date => !!date);
    const closeDates = ordered.map((row) => row.registrationClosesAt).filter((date): date is Date => !!date);

    await tx.request.update({
      where: { id: primary.id },
      data: {
        description: richerText(ordered.map((row) => row.description)),
        ministryId: ministryIds[0] ?? null,
        ministries: { set: ministryIds.map((id) => ({ id })) },
        tier: Math.min(...ordered.map((row) => row.tier)),
        status: bestStatus,
        ownerId: bestOwner,
        requesterId: bestRequester,
        requesterName: richerText(ordered.map((row) => row.requesterName)),
        requesterEmail: richerText(ordered.map((row) => row.requesterEmail)),
        whoIsItFor: ordered.find((row) => row.whoIsItFor)?.whoIsItFor ?? primary.whoIsItFor,
        audienceReachPct: Math.max(...ordered.map((row) => row.audienceReachPct ?? 0)) || null,
        eventEnd: endDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
        location: richerText(ordered.map((row) => row.location)),
        needsRegistration: ordered.some((row) => row.needsRegistration),
        registrationUrl: richerText(ordered.map((row) => row.registrationUrl)),
        cost: richerText(ordered.map((row) => row.cost)),
        capacity: Math.max(...ordered.map((row) => row.capacity ?? 0)) || null,
        registrationClosesAt: closeDates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
        schedulePreset: ordered.find((row) => row.schedulePreset)?.schedulePreset ?? null,
        roomBooked: richerText(ordered.map((row) => row.roomBooked)),
        nextStepText: richerText(ordered.map((row) => row.nextStepText)),
        nextStepUrl: richerText(ordered.map((row) => row.nextStepUrl)),
        successMetric: richerText(ordered.map((row) => row.successMetric)),
        notes: richerText(ordered.map((row) => row.notes)),
        sensitiveFlag: ordered.some((row) => row.sensitiveFlag),
        noPromo: ordered.some((row) => row.noPromo),
        seriesId: seriesIds[0] ?? null,
      },
    });

    await Promise.all([
      tx.asset.updateMany({ where: { requestId: { in: extraIds } }, data: { requestId: primary.id } }),
      tx.approval.updateMany({ where: { requestId: { in: extraIds } }, data: { requestId: primary.id } }),
      tx.eventUpdate.updateMany({ where: { requestId: { in: extraIds } }, data: { requestId: primary.id } }),
      tx.eventTask.updateMany({ where: { requestId: { in: extraIds } }, data: { requestId: primary.id } }),
      tx.calendarImportCandidate.updateMany({ where: { matchRequestId: { in: extraIds } }, data: { matchRequestId: primary.id } }),
      tx.activityLog.updateMany({
        where: { entityType: "request", entityId: { in: extraIds } },
        data: { entityId: primary.id },
      }),
    ]);

    const deliverablesByKey = new Map(primary.deliverables.map((deliverable) => [deliverableKey(deliverable), deliverable]));
    for (const extra of extras) {
      for (const deliverable of extra.deliverables) {
        const key = deliverableKey(deliverable);
        const existing = deliverablesByKey.get(key);
        if (!existing) {
          await tx.deliverable.update({ where: { id: deliverable.id }, data: { requestId: primary.id } });
          deliverablesByKey.set(key, deliverable);
          continue;
        }

        const touchesByKey = new Map(existing.touches.map((touch) => [
          `${touch.channelId}|${touch.scheduledAt.getTime()}`,
          touch,
        ]));
        for (const touch of deliverable.touches) {
          const touchKey = `${touch.channelId}|${touch.scheduledAt.getTime()}`;
          const existingTouch = touchesByKey.get(touchKey);
          if (!existingTouch) {
            await tx.touch.update({ where: { id: touch.id }, data: { deliverableId: existing.id } });
            existing.touches.push(touch);
            touchesByKey.set(touchKey, touch);
            continue;
          }
          const preferredStatus = (TOUCH_STATUS_WEIGHT[touch.status] ?? 0) > (TOUCH_STATUS_WEIGHT[existingTouch.status] ?? 0)
            ? touch.status
            : existingTouch.status;
          const mergedTouch = {
            status: preferredStatus,
            removedAt: existingTouch.removedAt ?? touch.removedAt,
            purposeLabel: richerText([existingTouch.purposeLabel, touch.purposeLabel]),
            content: richerText([existingTouch.content, touch.content]),
            assetLink: richerText([existingTouch.assetLink, touch.assetLink]),
            note: richerText([existingTouch.note, touch.note]),
          };
          await tx.touch.update({
            where: { id: existingTouch.id },
            data: mergedTouch,
          });
          Object.assign(existingTouch, mergedTouch);
          await tx.touch.delete({ where: { id: touch.id } });
        }

        const preferredStatus = (DELIVERABLE_STATUS_WEIGHT[deliverable.status] ?? 0) >
          (DELIVERABLE_STATUS_WEIGHT[existing.status] ?? 0)
          ? deliverable.status
          : existing.status;
        const dueDates = [existing.productionDueAt, deliverable.productionDueAt]
          .filter((date): date is Date => !!date)
          .sort((a, b) => a.getTime() - b.getTime());
        const mergedDeliverable = {
          status: preferredStatus,
          productionDueAt: dueDates[0] ?? null,
          skippedReason: preferredStatus === "skipped"
            ? richerText([existing.skippedReason, deliverable.skippedReason])
            : null,
          assetLink: richerText([existing.assetLink, deliverable.assetLink]),
          notes: richerText([existing.notes, deliverable.notes]),
          ownerId: existing.ownerId ?? deliverable.ownerId,
        };
        await tx.deliverable.update({
          where: { id: existing.id },
          data: mergedDeliverable,
        });
        Object.assign(existing, mergedDeliverable);
        await tx.deliverable.delete({ where: { id: deliverable.id } });
      }
    }

    for (const extra of extras) {
      for (const lock of extra.scheduleLocks) {
        const existing = await tx.scheduleLock.findUnique({
          where: {
            requestId_channelId_scheduledAt: {
              requestId: primary.id,
              channelId: lock.channelId,
              scheduledAt: lock.scheduledAt,
            },
          },
        });
        if (existing) {
          if (!existing.note && lock.note) {
            await tx.scheduleLock.update({ where: { id: existing.id }, data: { note: lock.note } });
          }
          await tx.scheduleLock.delete({ where: { id: lock.id } });
        } else {
          await tx.scheduleLock.update({ where: { id: lock.id }, data: { requestId: primary.id } });
        }
      }
      for (const pick of extra.videoTop3) {
        const existing = await tx.videoTop3Item.findFirst({
          where: { requestId: primary.id, sunday: pick.sunday },
          select: { id: true },
        });
        if (existing) await tx.videoTop3Item.delete({ where: { id: pick.id } });
        else await tx.videoTop3Item.update({ where: { id: pick.id }, data: { requestId: primary.id } });
      }
    }

    const mergedNote = `Merged into ${primary.title} (${primary.id}) on ${new Date().toISOString().slice(0, 10)}.`;
    for (const extra of extras) {
      await tx.request.update({
        where: { id: extra.id },
        data: {
          status: "archived",
          noPromo: true,
          seriesId: null,
          ownerId: null,
          overrideReason: mergedNote,
          notes: [extra.notes, mergedNote].filter(Boolean).join("\n\n"),
        },
      });
    }

    return {
      ok: true as const,
      keptId: primary.id,
      title: primary.title,
      archived: extras.length,
      sourceIds: extraIds,
    };
  });

  if (!result.ok) return result;
  await logRequestActivity(
    {
      requestId: result.keptId,
      action: "duplicate_events_merged",
      summary: `Merged ${result.archived + 1} copies of ${result.title}`,
      metadata: { archivedSourceRequestIds: result.sourceIds },
    },
    user,
  );
  revalidatePath("/requests");
  revalidatePath(`/requests/${result.keptId}`);
  for (const id of result.sourceIds) revalidatePath(`/requests/${id}`);
  revalidateSchedules();
  return { ok: true, keptId: result.keptId, title: result.title, archived: result.archived };
}

/**
 * Cancel an event: mark it cancelled and drop all its scheduled items so it
 * disappears from This Week / Calendar / Outputs, while staying in the Events
 * list as a record. Deleting deliverables cascades their touches.
 */
export async function cancelEvent(id: string) {
  const user = await requireEditor();
  const req = await db.request.findUnique({
    where: { id },
    select: { title: true, status: true, _count: { select: { deliverables: true } } },
  });
  if (!req) throw new Error("Request not found");
  await db.request.update({ where: { id }, data: { status: "cancelled" } });
  const removedLocks = await db.scheduleLock.deleteMany({ where: { requestId: id } });
  await db.deliverable.deleteMany({ where: { requestId: id } });
  await logRequestActivity(
    {
      requestId: id,
      action: "request_cancelled",
      summary: `Cancelled ${req.title} and removed scheduled items`,
      metadata: { fromStatus: req.status, removedDeliverables: req._count.deliverables, removedLocks: removedLocks.count },
    },
    user,
  );
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
  revalidateSchedules();
}

/**
 * Permanently delete an event. Cascades remove its deliverables and touches.
 */
export async function deleteEvent(id: string) {
  const user = await requireAdmin();
  const req = await db.request.findUnique({
    where: { id },
    select: { title: true, status: true },
  });
  if (!req) throw new Error("Request not found");
  await db.request.delete({ where: { id } });
  await logRequestActivity(
    {
      requestId: id,
      action: "request_deleted",
      summary: `Permanently deleted ${req.title}`,
      metadata: { status: req.status },
    },
    user,
  );
  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
  revalidateSchedules();
  redirect("/requests");
}

/**
 * Remove a single deliverable — pulls this event off one output entirely.
 * Cascades remove the deliverable's touches.
 */
export async function removeDeliverable(deliverableId: string) {
  const user = await requireEditor();
  const existing = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      requestId: true,
      channelId: true,
      channel: { select: { name: true } },
      status: true,
      touches: { select: { scheduledAt: true } },
    },
  });
  if (!existing) throw new Error("Deliverable not found");
  const [removedLocks] = await db.$transaction([
    db.scheduleLock.deleteMany({
      where: {
        requestId: existing.requestId,
        channelId: existing.channelId,
        scheduledAt: { in: existing.touches.map((touch) => atMidnight(touch.scheduledAt)) },
      },
    }),
    db.deliverable.delete({ where: { id: deliverableId } }),
  ]);
  await logRequestActivity(
    {
      requestId: existing.requestId,
      action: "deliverable_removed",
      summary: `Removed ${existing.channel.name} from this event`,
      metadata: {
        deliverableId,
        channelName: existing.channel.name,
        status: existing.status,
        removedLocks: removedLocks.count,
      },
    },
    user,
  );
  revalidatePath(`/requests/${existing.requestId}`);
  revalidateSchedules();
}

/**
 * Remove an event from a channel completely. Unlike removing one deliverable,
 * this clears every dated appearance, every lock, and (for Announcement Video)
 * every featured Top-3 pick for the event.
 */
export async function removeChannelFromRequest(requestId: string, channelId: string) {
  const user = await requireEditor();
  const [request, channel] = await Promise.all([
    db.request.findUnique({ where: { id: requestId }, select: { title: true } }),
    db.channel.findUnique({ where: { id: channelId }, select: { key: true, name: true } }),
  ]);
  if (!request) throw new Error("Event not found");
  if (!channel) throw new Error("Channel not found");

  const removed = await db.$transaction(async (tx) => {
    const locks = await tx.scheduleLock.deleteMany({ where: { requestId, channelId } });
    const deliverables = await tx.deliverable.deleteMany({ where: { requestId, channelId } });
    const picks = channel.key === "announcement_video"
      ? await tx.videoTop3Item.deleteMany({ where: { requestId } })
      : { count: 0 };
    return { locks: locks.count, deliverables: deliverables.count, picks: picks.count };
  });

  await logRequestActivity(
    {
      requestId,
      action: "channel_removed",
      summary: `Removed ${channel.name} from ${request.title}`,
      metadata: { channelId, channelKey: channel.key, ...removed },
    },
    user,
  );
  revalidatePath(`/requests/${requestId}`);
  revalidateSchedules();
  return removed;
}

/**
 * Remove a single touch — pulls one appearance (one output, one week).
 */
export async function removeTouch(touchId: string) {
  const user = await requireEditor();
  const existing = await db.touch.findUnique({
    where: { id: touchId },
    select: {
      channelId: true,
      scheduledAt: true,
      deliverable: { select: { requestId: true, channel: { select: { name: true } } } },
    },
  });
  if (!existing) throw new Error("Touch not found");
  const [removedLocks] = await db.$transaction([
    db.scheduleLock.deleteMany({
      where: {
        requestId: existing.deliverable.requestId,
        channelId: existing.channelId,
        scheduledAt: atMidnight(existing.scheduledAt),
      },
    }),
    db.touch.delete({ where: { id: touchId } }),
  ]);
  await logRequestActivity(
    {
      requestId: existing.deliverable.requestId,
      action: "touch_removed",
      summary: `Removed one ${existing.deliverable.channel.name} appearance`,
      metadata: {
        touchId,
        channelName: existing.deliverable.channel.name,
        scheduledAt: existing.scheduledAt.toISOString(),
        removedLocks: removedLocks.count,
      },
    },
    user,
  );
  revalidatePath(`/requests/${existing.deliverable.requestId}`);
  revalidateSchedules();
}
