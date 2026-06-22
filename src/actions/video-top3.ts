"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { attachChannel } from "@/actions/quick-items";
import { comingSunday } from "@/lib/week";
import { atMidnight, addDays } from "@/lib/engine/dates";
import { revalidatePath } from "next/cache";

const LABEL_CAP = 120;

/** YYYY-MM-DD (church-local) for attachChannel's date field. */
function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Feature an event on THIS coming Sunday's announcement video. Unlike a bare
 * Top-3 pick, this actually PUTS A SLIDE on that Sunday (so it shows on the
 * output page, the Sunday Checklist, and the run-of-show), then adds it to the
 * Top-3 featured order (capped at 3). Idempotent: re-running won't duplicate the
 * slide or the pick. Use this for one-click "add to the video" from the event /
 * output pages.
 */
export async function featureOnComingVideo(requestId: string): Promise<void> {
  await requireEditor();
  const sunday = atMidnight(comingSunday(new Date()));
  const channel = await db.channel.findUnique({
    where: { key: "announcement_video" },
    select: { id: true },
  });
  if (!channel) return;

  // 1. Ensure a slide (deliverable + touch) on this Sunday for the event.
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
    await attachChannel(requestId, fd); // creates the dated_instance slide + touch
  }

  // 2. Feature it (Top-3 order), respecting the cap of 3.
  const existingPick = await db.videoTop3Item.findFirst({
    where: { sunday, requestId },
    select: { id: true },
  });
  if (!existingPick) {
    const count = await db.videoTop3Item.count({ where: { sunday } });
    if (count < 3) {
      await db.videoTop3Item.create({ data: { sunday, sortOrder: count, requestId } });
    }
  }

  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/outputs");
  revalidatePath("/outputs/announcement_video");
  revalidatePath("/exports");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/guardrails");
}

/**
 * Curate a Sunday's announcement-video "Top 3". An item is either an upcoming
 * event (`requestId`) — which may be promoted ahead of its own date — or a
 * free-text awareness item (`label`), mirroring the manual ad schedule's TOP 3.
 * Capped at 3 per Sunday. See `src/components/video-top3-editor.tsx`.
 */
export async function addTop3Item(fd: FormData) {
  await requireEditor();
  const sundayIso = String(fd.get("sunday") ?? "");
  const sunday = new Date(sundayIso);
  if (Number.isNaN(sunday.getTime())) throw new Error("Bad sunday date");

  const requestId = ((fd.get("requestId") as string) || "").trim() || null;
  const label = ((fd.get("label") as string) || "").trim().slice(0, LABEL_CAP) || null;
  if (!requestId && !label) return; // nothing to add

  const count = await db.videoTop3Item.count({ where: { sunday } });
  if (count >= 3) return; // capacity 3 — the Top 3 is the Top 3

  await db.videoTop3Item.create({
    data: {
      sunday,
      sortOrder: count,
      requestId: requestId ?? undefined,
      // An event reference wins; only store a label when there's no request.
      label: requestId ? null : label,
    },
  });
  revalidatePath("/this-week");
}

export async function removeTop3Item(id: string) {
  await requireEditor();
  await db.videoTop3Item.delete({ where: { id } });
  revalidatePath("/this-week");
}
