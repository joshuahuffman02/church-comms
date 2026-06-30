"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";

const CONTENT_CAP = 2000;
const NOTE_CAP = 1000;

/** Normalize a form field to a trimmed string, treating empty as null. */
function readField(fd: FormData, name: string): string | null {
  const raw = fd.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Edit one touch's per-week content. Sets the slide/copy `content`, the
 * graphic `assetLink`, and a production `note` for THIS appearance only, so
 * each weekly touch of the same deliverable can differ. Caps oversized text and
 * rejects an asset link that isn't a URL. Revalidates the outputs surfaces and
 * the parent event detail (looked up via the deliverable's request).
 */
export async function updateTouch(id: string, fd: FormData) {
  const user = await requireEditor();

  const content = readField(fd, "content")?.slice(0, CONTENT_CAP) ?? null;
  const note = readField(fd, "note")?.slice(0, NOTE_CAP) ?? null;
  const assetLink = readField(fd, "assetLink");

  // assetLink is optional, but if present it must look like a URL.
  if (assetLink !== null && !/^https?:\/\//i.test(assetLink)) {
    throw new Error("Asset link must start with http:// or https://");
  }

  const touch = await db.touch.update({
    where: { id },
    data: { content, assetLink, note },
    select: {
      scheduledAt: true,
      deliverable: { select: { requestId: true, channel: { select: { name: true } } } },
    },
  });
  await logRequestActivity(
    {
      requestId: touch.deliverable.requestId,
      action: "touch_content_updated",
      summary: `${touch.deliverable.channel.name} appearance updated`,
      metadata: {
        touchId: id,
        channelName: touch.deliverable.channel.name,
        scheduledAt: touch.scheduledAt.toISOString(),
        hasContent: content != null,
        hasAssetLink: assetLink != null,
        hasNote: note != null,
      },
    },
    user,
  );

  revalidatePath("/outputs");
  revalidatePath("/run-sheet");
  revalidatePath(`/requests/${touch.deliverable.requestId}`);
}
