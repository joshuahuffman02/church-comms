"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import {
  focusActionName,
  type FocusDisposition,
  type FocusEntityType,
} from "@/lib/focus-queue";
import { addDays, atMidnight } from "@/lib/engine/dates";

const ENTITY_TYPES = new Set<FocusEntityType>(["request", "deliverable"]);
const DISPOSITIONS = new Set<FocusDisposition>(["done", "snoozed", "not_mine"]);

export async function setAttentionDisposition(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) throw new Error("You must be signed in.");

  const entityType = String(formData.get("entityType") ?? "") as FocusEntityType;
  const entityId = String(formData.get("entityId") ?? "").trim();
  const fingerprint = String(formData.get("fingerprint") ?? "").trim();
  const disposition = String(formData.get("disposition") ?? "") as FocusDisposition;

  if (
    !ENTITY_TYPES.has(entityType) ||
    !DISPOSITIONS.has(disposition) ||
    !entityId ||
    !fingerprint ||
    fingerprint.length > 500
  ) {
    throw new Error("This focus action is no longer valid.");
  }

  const exists =
    entityType === "request"
      ? await db.request.count({ where: { id: entityId } })
      : await db.deliverable.count({ where: { id: entityId } });
  if (exists === 0) throw new Error("This item no longer exists.");

  const snoozedUntil =
    disposition === "snoozed"
      ? addDays(atMidnight(new Date()), 1).toISOString()
      : null;

  await db.activityLog.create({
    data: {
      action: focusActionName(disposition),
      entityType,
      entityId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: user.name,
      summary:
        disposition === "done"
          ? "Removed an item from the personal focus queue"
          : disposition === "snoozed"
            ? "Snoozed an item in the personal focus queue"
            : "Marked a focus item as belonging to someone else",
      metadata: {
        fingerprint,
        snoozedUntil,
        personalPreference: true,
      },
    },
  });

  revalidatePath("/");
}
