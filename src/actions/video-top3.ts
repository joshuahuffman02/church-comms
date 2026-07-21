"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { attachChannel } from "@/actions/quick-items";
import { comingSunday } from "@/lib/week";
import { atMidnight, addDays } from "@/lib/engine/dates";
import {
  canProtectAnnouncementItem,
  loadAnnouncementVideoLineup,
} from "@/lib/announcement-video";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import { effectiveEventCap } from "@/lib/social-curation";
import { revalidatePath } from "next/cache";

const LABEL_CAP = 120;

async function nextAvailableSortOrder(sunday: Date, capacity: number): Promise<number | null> {
  const rows = await db.videoTop3Item.findMany({
    where: { sunday },
    select: { sortOrder: true },
  });
  const used = new Set(rows.map((row) => row.sortOrder));
  for (let slot = 0; slot < capacity; slot++) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

async function ensureVideoPlacement(
  requestId: string,
  sunday: Date,
  createdById?: string | null,
  replacingRequestId?: string | null,
): Promise<void> {
  const [request, channel] = await Promise.all([
    db.request.findUnique({
      where: { id: requestId },
      select: { status: true, noPromo: true },
    }),
    db.channel.findUnique({
      where: { key: "announcement_video" },
      select: { id: true, name: true, type: true, capacity: true, frequencyCap: true },
    }),
  ]);
  if (!request || request.noPromo || !PROMOTABLE_REQUEST_STATUSES.includes(request.status)) {
    throw new Error("Only approved, promotable events can be featured.");
  }
  if (!channel) throw new Error("Announcement Video channel is not configured.");

  const existingLock = await db.scheduleLock.findUnique({
    where: {
      requestId_channelId_scheduledAt: { requestId, channelId: channel.id, scheduledAt: sunday },
    },
    select: { id: true },
  });
  const cap = effectiveEventCap(channel);
  if (!existingLock && cap) {
    const lockedCount = await db.scheduleLock.count({
      where: {
        channelId: channel.id,
        scheduledAt: sunday,
        ...(replacingRequestId ? { requestId: { not: replacingRequestId } } : {}),
      },
    });
    if (lockedCount >= cap) {
      throw new Error(
        `${channel.name} already has ${cap} locked slots for this Sunday. Unlock or replace one first.`,
      );
    }
  }

  const existingTouch = await db.touch.findFirst({
    where: {
      channelId: channel.id,
      deliverable: { requestId },
      scheduledAt: { gte: sunday, lt: addDays(sunday, 1) },
    },
    select: { id: true },
  });
  if (!existingTouch) {
    const fd = new FormData();
    fd.set("channelId", channel.id);
    fd.set("date", isoDay(sunday));
    await attachChannel(requestId, fd);
  }

  await db.scheduleLock.upsert({
    where: {
      requestId_channelId_scheduledAt: {
        requestId,
        channelId: channel.id,
        scheduledAt: sunday,
      },
    },
    update: {},
    create: {
      requestId,
      channelId: channel.id,
      scheduledAt: sunday,
      createdById: createdById ?? null,
    },
  });
}

/** YYYY-MM-DD (church-local) for attachChannel's date field. */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Refresh every surface that renders the Top-3 lineup after a pick changes. */
function revalidateTop3Surfaces(): void {
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/outputs");
  revalidatePath("/outputs/announcement_video");
  revalidatePath("/exports");
  revalidatePath("/guardrails");
}

/**
 * Feature an event on THIS coming Sunday's announcement video. Unlike a bare
 * Top-3 pick, this actually PUTS A SLIDE on that Sunday (so it shows on the
 * output page, the Sunday Checklist, and the run-of-show), then adds it to the
 * Top-3 featured order (capped at 3). Idempotent: re-running won't duplicate the
 * slide or the pick. Use this for one-click "add to the video" from the event /
 * output pages.
 */
export async function featureOnComingVideo(
  requestId: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const user = await requireEditor();
  const sunday = atMidnight(comingSunday(new Date()));
  const lineup = await loadAnnouncementVideoLineup(sunday);
  if (!canProtectAnnouncementItem(lineup, requestId)) {
    return { ok: false, message: "All three video slots are protected. Replace one on This Week first." };
  }
  try {
    await ensureVideoPlacement(requestId, sunday, user.id);

    // 2. Feature it (Top-3 order), respecting the cap of 3.
    const existingPick = await db.videoTop3Item.findFirst({
      where: { sunday, requestId },
      select: { id: true },
    });
    if (!existingPick) {
      const sortOrder = await nextAvailableSortOrder(sunday, lineup.capacity);
      if (sortOrder == null) {
        return { ok: false, message: "All three featured positions are already assigned. Replace one on This Week first." };
      }
      await db.videoTop3Item.create({ data: { sunday, sortOrder, requestId } });
    }

    revalidateTop3Surfaces();
    revalidatePath(`/requests/${requestId}`);
    return { ok: true, message: `Added to the ${isoDay(sunday)} Announcement Video.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The event could not be added to the video.",
    };
  }
}

/**
 * Curate a Sunday's announcement-video "Top 3". An item is either an upcoming
 * event (`requestId`) — which may be promoted ahead of its own date — or a
 * free-text awareness item (`label`), mirroring the manual ad schedule's TOP 3.
 * Capped at 3 per Sunday. See `src/components/video-top3-editor.tsx`.
 */
export async function addTop3Item(fd: FormData) {
  const user = await requireEditor();
  const sundayIso = String(fd.get("sunday") ?? "");
  const sunday = atMidnight(new Date(sundayIso));
  if (Number.isNaN(sunday.getTime())) throw new Error("Bad sunday date");

  const requestId = ((fd.get("requestId") as string) || "").trim() || null;
  const label = ((fd.get("label") as string) || "").trim().slice(0, LABEL_CAP) || null;
  if (!requestId && !label) return; // nothing to add

  const lineup = await loadAnnouncementVideoLineup(sunday);
  if (!canProtectAnnouncementItem(lineup, requestId)) {
    throw new Error("Every Announcement Video slot is featured or locked. Replace one first.");
  }

  if (requestId) await ensureVideoPlacement(requestId, sunday, user.id);

  const [sortOrder, duplicate] = await Promise.all([
    nextAvailableSortOrder(sunday, lineup.capacity),
    requestId
      ? db.videoTop3Item.findFirst({ where: { sunday, requestId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (duplicate || sortOrder == null) return;

  await db.videoTop3Item.create({
    data: {
      sunday,
      sortOrder,
      requestId: requestId ?? undefined,
      // An event reference wins; only store a label when there's no request.
      label: requestId ? null : label,
    },
  });
  revalidateTop3Surfaces();
}

export async function removeTop3Item(id: string) {
  await requireEditor();
  const item = await db.videoTop3Item.findUnique({
    where: { id },
    select: { requestId: true, sunday: true },
  });
  if (!item) return;
  const channel = item.requestId
    ? await db.channel.findUnique({ where: { key: "announcement_video" }, select: { id: true } })
    : null;
  await db.$transaction([
    db.videoTop3Item.delete({ where: { id } }),
    ...(item.requestId && channel
      ? [
          db.scheduleLock.deleteMany({
            where: {
              requestId: item.requestId,
              channelId: channel.id,
              scheduledAt: item.sunday,
            },
          }),
        ]
      : []),
  ]);
  revalidateTop3Surfaces();
}

/**
 * Swap one Top-3 pick for another in a single step: drop `removeId` and add the
 * chosen event/label in the SAME slot (same Sunday + sortOrder), so curating a
 * full 3/3 lineup doesn't require a separate remove-then-add. If the replacement
 * event is already featured that Sunday, the target is simply removed (no dupe).
 */
export async function replaceTop3Item(fd: FormData) {
  const user = await requireEditor();
  const removeId = String(fd.get("removeId") ?? "");
  const requestId = ((fd.get("requestId") as string) || "").trim() || null;
  const label = ((fd.get("label") as string) || "").trim().slice(0, LABEL_CAP) || null;
  if (!removeId || (!requestId && !label)) return;

  const target = await db.videoTop3Item.findUnique({
    where: { id: removeId },
    select: { sunday: true, sortOrder: true, requestId: true },
  });
  if (!target) return;

  if (requestId) {
    await ensureVideoPlacement(
      requestId,
      atMidnight(target.sunday),
      user.id,
      target.requestId,
    );
  }

  // Avoid creating a duplicate pick if the replacement event is already featured
  // that Sunday — in that case just take the target off.
  const dupe = requestId
    ? await db.videoTop3Item.findFirst({
        where: { sunday: target.sunday, requestId, NOT: { id: removeId } },
        select: { id: true },
      })
    : null;

  const channel = target.requestId
    ? await db.channel.findUnique({ where: { key: "announcement_video" }, select: { id: true } })
    : null;
  await db.$transaction([
    db.videoTop3Item.delete({ where: { id: removeId } }),
    ...(target.requestId && channel
      ? [
          db.scheduleLock.deleteMany({
            where: {
              requestId: target.requestId,
              channelId: channel.id,
              scheduledAt: target.sunday,
            },
          }),
        ]
      : []),
    ...(dupe
      ? []
      : [
          db.videoTop3Item.create({
            data: {
              sunday: target.sunday,
              sortOrder: target.sortOrder,
              requestId: requestId ?? undefined,
              label: requestId ? null : label,
            },
          }),
        ]),
  ]);
  revalidateTop3Surfaces();
}
