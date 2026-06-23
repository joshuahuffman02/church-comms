"use server";
import { db } from "@/lib/db";
import { requireAdmin, requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** Paths that surface scheduled work and need refreshing after a change. */
function revalidateSchedules() {
  revalidatePath("/this-week");
  revalidatePath("/calendar");
  revalidatePath("/pipeline");
  revalidatePath("/guardrails");
  revalidatePath("/outputs");
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
  await db.deliverable.deleteMany({ where: { requestId: id } });
  await logRequestActivity(
    {
      requestId: id,
      action: "request_cancelled",
      summary: `Cancelled ${req.title} and removed scheduled items`,
      metadata: { fromStatus: req.status, removedDeliverables: req._count.deliverables },
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
  const d = await db.deliverable.delete({
    where: { id: deliverableId },
    select: { requestId: true, channel: { select: { name: true } }, status: true },
  });
  await logRequestActivity(
    {
      requestId: d.requestId,
      action: "deliverable_removed",
      summary: `Removed ${d.channel.name} from this event`,
      metadata: { deliverableId, channelName: d.channel.name, status: d.status },
    },
    user,
  );
  revalidatePath(`/requests/${d.requestId}`);
  revalidatePath("/this-week");
  revalidatePath("/outputs");
  revalidatePath("/assign");
}

/**
 * Remove a single touch — pulls one appearance (one output, one week).
 */
export async function removeTouch(touchId: string) {
  const user = await requireEditor();
  const t = await db.touch.delete({
    where: { id: touchId },
    select: {
      scheduledAt: true,
      deliverable: { select: { requestId: true, channel: { select: { name: true } } } },
    },
  });
  await logRequestActivity(
    {
      requestId: t.deliverable.requestId,
      action: "touch_removed",
      summary: `Removed one ${t.deliverable.channel.name} appearance`,
      metadata: { touchId, channelName: t.deliverable.channel.name, scheduledAt: t.scheduledAt.toISOString() },
    },
    user,
  );
  revalidatePath(`/requests/${t.deliverable.requestId}`);
  revalidatePath("/this-week");
  revalidatePath("/outputs");
}
