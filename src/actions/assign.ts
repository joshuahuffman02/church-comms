// src/actions/assign.ts
"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { attachChannel } from "@/actions/quick-items";
import { canAssign, defaultPublishDate, type AssignDeliverable } from "@/lib/assign";

/** Local YYYY-MM-DD (church-local), to feed attachChannel's date field. */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Put an event on a channel at that channel's normal publish lead. Dedups
 * (no-op if already on the channel), then delegates to attachChannel — which
 * bypasses tier (manual override), schedules the touch, logs, and revalidates.
 */
export async function assignChannel(requestId: string, channelId: string): Promise<void> {
  await requireEditor();

  const [request, channel, dels] = await Promise.all([
    db.request.findUnique({ where: { id: requestId }, select: { eventStart: true } }),
    db.channel.findUnique({ where: { id: channelId }, select: { defaultPublishOffsetDays: true } }),
    db.deliverable.findMany({ where: { requestId }, select: { id: true, requestId: true, channelId: true, status: true } }),
  ]);
  if (!request || !channel) return;

  const existing: AssignDeliverable[] = dels.map((d) => ({ ...d, publishMs: null }));
  if (!canAssign(existing, requestId, channelId)) return; // already on this channel

  const date = defaultPublishDate(request.eventStart, channel.defaultPublishOffsetDays);
  const fd = new FormData();
  fd.set("channelId", channelId);
  fd.set("date", isoDay(date));
  await attachChannel(requestId, fd);
}
