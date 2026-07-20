"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";

/**
 * Check / uncheck one run-sheet line. A line is a Touch (one weekly appearance
 * on a channel); "done" maps to the touch's own status — published when checked,
 * scheduled when not. This is per-week-per-channel, so checking off the loop
 * slide for one Sunday doesn't affect the same event's other weeks/channels.
 */
export async function setTouchDone(touchId: string, done: boolean) {
  const user = await requireEditor();
  const row = await db.touch.update({
    where: { id: touchId },
    data: { status: done ? "published" : "scheduled" },
    select: {
      scheduledAt: true,
      channel: { select: { name: true, key: true } },
      deliverable: {
        select: { requestId: true, request: { select: { title: true } } },
      },
    },
  });
  await logRequestActivity(
    {
      requestId: row.deliverable.requestId,
      action: "checklist_touch_toggled",
      summary: `${row.channel.name} checklist item marked ${done ? "done" : "not done"}`,
      metadata: {
        touchId,
        channelKey: row.channel.key,
        scheduledAt: row.scheduledAt.toISOString(),
        done,
        title: row.deliverable.request.title,
      },
    },
    user,
  );
  revalidatePath("/run-sheet");
  revalidatePath("/outputs");
  revalidatePath(`/requests/${row.deliverable.requestId}`);
}

/** Complete the physical removal of a slide without rewriting its old publish state. */
export async function setLoopRemovalDone(touchId: string, done: boolean) {
  const user = await requireEditor();
  const row = await db.touch.update({
    where: { id: touchId },
    data: { removedAt: done ? new Date() : null },
    select: {
      scheduledAt: true,
      deliverable: {
        select: { requestId: true, request: { select: { title: true } } },
      },
    },
  });
  await logRequestActivity(
    {
      requestId: row.deliverable.requestId,
      action: "checklist_loop_removal_toggled",
      summary: `Loop slide removal marked ${done ? "done" : "not done"}`,
      metadata: {
        touchId,
        originalScheduledAt: row.scheduledAt.toISOString(),
        done,
        title: row.deliverable.request.title,
      },
    },
    user,
  );
  revalidatePath("/run-sheet");
  revalidatePath(`/requests/${row.deliverable.requestId}`);
}
