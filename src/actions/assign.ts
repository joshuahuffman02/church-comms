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
 * Returns the real deliverable id (new or existing) so callers can reconcile
 * optimistic tmp: ids, or null when request/channel not found.
 */
export async function assignChannel(requestId: string, channelId: string): Promise<string | null> {
  await requireEditor();

  const [request, channel, dels] = await Promise.all([
    db.request.findUnique({ where: { id: requestId }, select: { eventStart: true } }),
    db.channel.findUnique({ where: { id: channelId }, select: { defaultPublishOffsetDays: true } }),
    db.deliverable.findMany({ where: { requestId }, select: { id: true, requestId: true, channelId: true, status: true } }),
  ]);
  if (!request || !channel) return null;

  const existing: AssignDeliverable[] = dels.map((d) => ({ ...d, publishMs: null }));
  if (canAssign(existing, requestId, channelId)) {
    const date = defaultPublishDate(request.eventStart, channel.defaultPublishOffsetDays);
    const fd = new FormData();
    fd.set("channelId", channelId);
    fd.set("date", isoDay(date));
    await attachChannel(requestId, fd);
  }

  // Always return the current (or newly created) non-skipped deliverable id.
  const placed = await db.deliverable.findFirst({
    where: { requestId, channelId, NOT: { status: "skipped" } },
    select: { id: true },
  });
  return placed?.id ?? null;
}
