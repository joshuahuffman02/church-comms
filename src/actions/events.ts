"use server";
import { db } from "@/lib/db";
import { requireAdmin, requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { atMidnight } from "@/lib/engine/dates";
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
