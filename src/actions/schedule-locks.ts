"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { atMidnight } from "@/lib/engine/dates";
import { effectiveEventCap } from "@/lib/social-curation";
import { revalidatePath } from "next/cache";

function revalidateLockedSchedule(requestId: string, channelKey?: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/outputs");
  if (channelKey) revalidatePath(`/outputs/${channelKey}`);
  revalidatePath("/guardrails");
  revalidatePath("/assign");
  revalidatePath("/exports");
}

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export async function lockTouch(touchId: string): Promise<string | null> {
  const user = await requireEditor();

  const touch = await db.touch.findUnique({
    where: { id: touchId },
    select: {
      scheduledAt: true,
      channelId: true,
      channel: {
        select: {
          key: true,
          name: true,
          type: true,
          capacity: true,
          frequencyCap: true,
        },
      },
      deliverable: {
        select: {
          requestId: true,
          request: { select: { title: true } },
        },
      },
    },
  });
  if (!touch) return null;

  const scheduledAt = atMidnight(touch.scheduledAt);
  const alreadyLocked = await db.scheduleLock.findUnique({
    where: {
      requestId_channelId_scheduledAt: {
        requestId: touch.deliverable.requestId,
        channelId: touch.channelId,
        scheduledAt,
      },
    },
    select: { id: true },
  });
  const cap = effectiveEventCap(touch.channel);
  if (!alreadyLocked && cap) {
    const lockedCount = await db.scheduleLock.count({
      where: { channelId: touch.channelId, scheduledAt },
    });
    if (lockedCount >= cap) {
      throw new Error(
        `${touch.channel.name} already has ${cap} locked ${cap === 1 ? "slot" : "slots"} on this date. Unlock one before locking another.`,
      );
    }
  }
  const lock = await db.scheduleLock.upsert({
    where: {
      requestId_channelId_scheduledAt: {
        requestId: touch.deliverable.requestId,
        channelId: touch.channelId,
        scheduledAt,
      },
    },
    update: {},
    create: {
      requestId: touch.deliverable.requestId,
      channelId: touch.channelId,
      scheduledAt,
      createdById: user.id ?? null,
    },
    select: { id: true },
  });

  await logRequestActivity(
    {
      requestId: touch.deliverable.requestId,
      action: "schedule_lock_created",
      summary: `Locked ${touch.channel.name} for ${fmt(scheduledAt)}`,
      metadata: {
        touchId,
        channelId: touch.channelId,
        channelName: touch.channel.name,
        scheduledAt: scheduledAt.toISOString(),
        title: touch.deliverable.request.title,
      },
    },
    user,
  );

  revalidateLockedSchedule(touch.deliverable.requestId, touch.channel.key);
  return lock.id;
}

export async function unlockScheduleLock(lockId: string): Promise<void> {
  const user = await requireEditor();
  const lock = await db.scheduleLock.findUnique({
    where: { id: lockId },
    select: {
      requestId: true,
      channelId: true,
      scheduledAt: true,
      channel: { select: { key: true, name: true } },
      request: { select: { title: true } },
    },
  });
  if (!lock) return;

  await db.scheduleLock.delete({ where: { id: lockId } });
  await logRequestActivity(
    {
      requestId: lock.requestId,
      action: "schedule_lock_removed",
      summary: `Unlocked ${lock.channel.name} for ${fmt(lock.scheduledAt)}`,
      metadata: {
        lockId,
        channelId: lock.channelId,
        channelName: lock.channel.name,
        scheduledAt: lock.scheduledAt.toISOString(),
        title: lock.request.title,
      },
    },
    user,
  );

  revalidateLockedSchedule(lock.requestId, lock.channel.key);
}
