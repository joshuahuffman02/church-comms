"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { parseDateInput } from "@/lib/engine/dates";
import { ministryIdsFromForm, ministryUpdateData } from "@/lib/ministries";
import { replanRequest } from "@/lib/plan-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** whoIsItFor → tier, mirroring the create flow. */
const tierFor: Record<string, number> = { whole_church: 1, ministry: 2, small_group: 3, leadership: 3 };

/** Refresh every surface that shows an event or its scheduled work. */
function revalidateEvent(id: string) {
  revalidatePath(`/requests/${id}`);
  revalidatePath("/requests");
  revalidatePath("/this-week");
  revalidatePath("/calendar");
  revalidatePath("/outputs");
  revalidatePath("/guardrails");
}

/** Read a form field as a trimmed string, or undefined when blank. */
function optStr(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

/**
 * Edit an event's core fields. If a tier was submitted it's used directly,
 * otherwise it's derived from whoIsItFor (mirroring create). When eventStart,
 * registrationClosesAt, or tier changes, the event is re-planned so its
 * schedule reflects the new planning target instead of going stale.
 */
export async function updateEvent(id: string, fd: FormData) {
  const user = await requireEditor();

  const existing = await db.request.findUnique({
    where: { id },
    select: { title: true, eventStart: true, registrationClosesAt: true, tier: true },
  });
  if (!existing) throw new Error("Request not found");

  const title = optStr(fd, "title");
  const eventStart = parseDateInput(String(fd.get("eventStart") ?? ""));
  // Validate required fields — bail without mutating if either is bad.
  if (!title || !eventStart) return;

  const whoIsItFor = String(fd.get("whoIsItFor") || "whole_church");
  // Accept an explicit tier when present, otherwise derive from whoIsItFor.
  const tierRaw = optStr(fd, "tier");
  const tier = tierRaw != null ? Number(tierRaw) : (tierFor[whoIsItFor] ?? 2);

  const eventEnd = parseDateInput(String(fd.get("eventEnd") ?? ""));
  const registrationClosesAt = parseDateInput(String(fd.get("registrationClosesAt") ?? ""));
  const needsRegistration = fd.get("needsRegistration") != null;

  // Replace the m-n ministry set with the submitted selection (all equal) and
  // keep the denormalized ministryId synced to the first, via the shared helper.
  const ministryData = ministryUpdateData(ministryIdsFromForm(fd));

  await db.request.update({
    where: { id },
    data: {
      title,
      description: optStr(fd, "description") ?? null,
      ...ministryData,
      tier,
      whoIsItFor,
      eventStart,
      eventEnd,
      location: optStr(fd, "location") ?? null,
      needsRegistration,
      registrationUrl: optStr(fd, "registrationUrl") ?? null,
      cost: optStr(fd, "cost") ?? null,
      registrationClosesAt,
      nextStepText: optStr(fd, "nextStepText") ?? null,
      notes: optStr(fd, "notes") ?? null,
    },
  });

  // Re-plan only when the schedule's inputs changed.
  const dateChanged = existing.eventStart.getTime() !== eventStart.getTime();
  const registrationChanged =
    (existing.registrationClosesAt?.getTime() ?? null) !==
    (registrationClosesAt?.getTime() ?? null);
  const tierChanged = existing.tier !== tier;
  if (dateChanged || registrationChanged || tierChanged) {
    await replanRequest(id);
  }

  await logRequestActivity(
    {
      requestId: id,
      action: "request_updated",
      summary: dateChanged || registrationChanged || tierChanged
        ? "Event details updated and schedule re-planned"
        : "Event details updated",
      metadata: {
        previousTitle: existing.title,
        title,
        dateChanged,
        registrationChanged,
        tierChanged,
        previousTier: existing.tier,
        tier,
      },
    },
    user,
  );

  revalidateEvent(id);
  redirect(`/requests/${id}`);
}

/**
 * Re-plan an event's schedule on demand (auth-guarded wrapper around
 * replanRequest) — useful after correcting a date or tier.
 */
export async function replanEvent(id: string) {
  const user = await requireEditor();
  const count = await replanRequest(id);
  await logRequestActivity(
    {
      requestId: id,
      action: "request_replanned",
      summary: `Schedule rebuilt with ${count} deliverable${count === 1 ? "" : "s"}`,
      metadata: { generatedDeliverables: count },
    },
    user,
  );
  revalidateEvent(id);
}
