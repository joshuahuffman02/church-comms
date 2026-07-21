// src/actions/assign.ts
"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { attachChannel } from "@/actions/quick-items";
import { defaultPublishDate } from "@/lib/assign";
import { atMidnight } from "@/lib/engine/dates";

/** Local YYYY-MM-DD (church-local), to feed attachChannel's date field. */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Put an event on a channel at that channel's normal publish lead. A current
 * appearance is reused. When the only appearances are old, a new one is placed
 * today (or at the normal lead date when that is still ahead), so Assign never
 * creates fresh work in the past.
 */
export type AssignChannelResult = {
  deliverableId: string;
  scheduledAtMs: number;
  existing: boolean;
};

export async function assignChannelPlacement(requestId: string, channelId: string): Promise<AssignChannelResult | null> {
  await requireEditor();

  const today = atMidnight(new Date());
  const [request, channel, existingTouch] = await Promise.all([
    db.request.findUnique({ where: { id: requestId }, select: { eventStart: true } }),
    db.channel.findFirst({ where: { id: channelId, active: true }, select: { defaultPublishOffsetDays: true } }),
    db.touch.findFirst({
      where: {
        channelId,
        scheduledAt: { gte: today },
        NOT: { status: "skipped" },
        deliverable: { requestId, NOT: { status: "skipped" } },
      },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, deliverableId: true },
    }),
  ]);
  if (!request || !channel) return null;
  if (existingTouch) {
    return {
      deliverableId: existingTouch.deliverableId,
      scheduledAtMs: existingTouch.scheduledAt.getTime(),
      existing: true,
    };
  }

  const normalDate = defaultPublishDate(request.eventStart, channel.defaultPublishOffsetDays);
  const date = normalDate < today ? today : normalDate;
  const fd = new FormData();
  fd.set("channelId", channelId);
  fd.set("date", isoDay(date));
  await attachChannel(requestId, fd);

  const placed = await db.touch.findFirst({
    where: {
      channelId,
      scheduledAt: date,
      deliverable: { requestId, NOT: { status: "skipped" } },
    },
    select: { deliverableId: true },
  });
  return placed ? { deliverableId: placed.deliverableId, scheduledAtMs: date.getTime(), existing: false } : null;
}

/** Backwards-compatible event-page helper. */
export async function assignChannel(requestId: string, channelId: string): Promise<string | null> {
  const result = await assignChannelPlacement(requestId, channelId);
  return result?.deliverableId ?? null;
}
