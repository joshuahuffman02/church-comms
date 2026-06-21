"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { revalidatePath } from "next/cache";

const LABEL_CAP = 120;

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
