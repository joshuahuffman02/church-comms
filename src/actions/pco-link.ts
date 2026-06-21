"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { atMidnight } from "@/lib/engine/dates";
import {
  fetchApprovedUpcomingPcoEvents,
  fetchPcoPerson,
  fetchEventRoomStatus,
} from "@/lib/pco";
import { replanRequest } from "@/lib/plan-service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/**
 * Model C — "Link to a Planning Center event".
 *
 * A comms event created by hand in the app can be ATTACHED to its real PCO
 * counterpart so the two become one record. Linking pulls PCO's authoritative
 * LOGISTICS (date/rooms/registration/approval/Church Center URL) down onto the
 * existing Request and, because the Request now owns that pcoEventId, the
 * one-way auto-sync upsert (keyed on pcoEventId) updates THIS record instead of
 * creating a duplicate.
 */

/** Paths that surface this request / its schedule + the PCO surfaces. */
function revalidateLinkSurfaces(requestId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/this-week");
  revalidatePath("/calendar");
  revalidatePath("/outputs");
  revalidatePath("/import/planning-center");
}

/**
 * Attach an existing (manual) Request to a chosen approved PCO event instance.
 *
 * `fd` carries `pcoEventId` (the event_instance id picked from the candidate
 * list). We:
 *  1. re-fetch the live approved events and find the match (so we link only to a
 *     real, currently-approved occurrence — not a stale id from the page);
 *  2. guard the UNIQUE constraint — if another Request already owns that
 *     pcoEventId, redirect back with a friendly "already linked" message;
 *  3. write pcoEventId + approval + Church Center URL, and pull the PCO-owned
 *     LOGISTICS (eventStart/eventEnd, location/roomBooked from rooms,
 *     registrationUrl + needsRegistration). Comms fields (tier / whoIsItFor /
 *     channels / status) are NOT touched — linking is logistics-only;
 *  4. if the request already had deliverables, the date may have moved, so we
 *     replan so the schedule matches the real PCO date.
 *
 * On not-found / already-linked we redirect back to the link page with `?error`.
 * On success we redirect to the request detail.
 */
export async function linkPcoEvent(requestId: string, fd: FormData) {
  const user = await requireEditor();

  const pcoEventId = String(fd.get("pcoEventId") ?? "").trim();
  if (!pcoEventId) {
    redirect(`/requests/${requestId}/link-pco?error=notfound`);
  }

  // Re-fetch live approved events and find the chosen occurrence.
  const approved = await fetchApprovedUpcomingPcoEvents();
  const pcoEvent = approved.find((e) => e.pcoEventId === pcoEventId);
  if (!pcoEvent) {
    redirect(`/requests/${requestId}/link-pco?error=notfound`);
  }

  // UNIQUE-constraint guard: a pcoEventId can back at most one Request. If some
  // OTHER request already owns it, refuse with a clear message rather than
  // letting the DB throw a P2002.
  const existing = await db.request.findUnique({
    where: { pcoEventId },
    select: { id: true },
  });
  if (existing && existing.id !== requestId) {
    redirect(`/requests/${requestId}/link-pco?error=alreadylinked`);
  }

  const hasRooms = pcoEvent.rooms.length > 0;
  const location = hasRooms ? pcoEvent.rooms.join(", ") : pcoEvent.location;
  const hasRegistration = !!pcoEvent.registrationUrl;

  // Detect a date change so we know whether to replan the schedule.
  const before = await db.request.findUnique({
    where: { id: requestId },
    select: { eventStart: true, description: true, _count: { select: { deliverables: true } } },
  });
  if (!before) {
    redirect(`/requests/${requestId}/link-pco?error=notfound`);
  }

  const newStart = atMidnight(pcoEvent.startsAt);
  const dateChanged = before.eventStart.getTime() !== newStart.getTime();

  // Resolve the same read-only enrichment the auto-import pulls (owner contact +
  // overall room-request status) for this single linked occurrence. Both
  // degrade to null on any non-200, so they never block the link.
  const owner = pcoEvent.ownerPersonId
    ? await fetchPcoPerson(pcoEvent.ownerPersonId)
    : { name: null, email: null };
  const roomStatus = pcoEvent.parentEventId
    ? await fetchEventRoomStatus(pcoEvent.parentEventId)
    : null;

  await db.request.update({
    where: { id: requestId },
    data: {
      pcoEventId,
      pcoApprovalStatus: pcoEvent.approvalStatus || "A",
      pcoChurchCenterUrl: pcoEvent.churchCenterUrl,
      pcoVisibleInChurchCenter: pcoEvent.visibleInChurchCenter,
      pcoFeatured: pcoEvent.featured,
      pcoTags: pcoEvent.tags.length > 0 ? pcoEvent.tags : undefined,
      pcoOwnerName: owner.name,
      pcoOwnerEmail: owner.email,
      pcoRoomStatus: roomStatus,
      // PCO-owned logistics — never comms fields.
      eventStart: newStart,
      eventEnd: pcoEvent.endsAt ? atMidnight(pcoEvent.endsAt) : null,
      location,
      roomBooked: hasRooms ? "yes" : null,
      ...(hasRegistration
        ? { registrationUrl: pcoEvent.registrationUrl, needsRegistration: true }
        : {}),
      // Only fill the description from PCO when the event doesn't already have one
      // (don't clobber a description the team wrote).
      ...(!before?.description && pcoEvent.description
        ? { description: pcoEvent.description }
        : {}),
    },
  });

  // If the date moved and this request already has a schedule, rebuild it so
  // the plan reflects the real PCO date.
  if (dateChanged && before._count.deliverables > 0) {
    await replanRequest(requestId);
  }

  await logRequestActivity(
    {
      requestId,
      action: "pco_event_linked",
      summary: `Linked to Planning Center event: ${pcoEvent.name}`,
      metadata: {
        pcoEventId,
        dateChanged,
        replanned: dateChanged && before._count.deliverables > 0,
        roomStatus,
      },
    },
    user,
  );

  revalidateLinkSurfaces(requestId);
  redirect(`/requests/${requestId}`);
}

/**
 * Detach a Request from its PCO event: clear the PCO link fields so the auto-sync
 * no longer treats this record as the PCO event's home (and could re-import it as
 * a fresh Request). The pulled LOGISTICS are intentionally LEFT as-is — unlinking
 * doesn't un-happen the date/room the user has been working against.
 */
export async function unlinkPcoEvent(requestId: string) {
  const user = await requireEditor();
  const before = await db.request.findUnique({
    where: { id: requestId },
    select: { pcoEventId: true },
  });

  await db.request.update({
    where: { id: requestId },
    data: {
      pcoEventId: null,
      pcoApprovalStatus: null,
      pcoChurchCenterUrl: null,
      pcoVisibleInChurchCenter: null,
      pcoFeatured: null,
      pcoTags: undefined,
      pcoOwnerName: null,
      pcoOwnerEmail: null,
      pcoRoomStatus: null,
    },
  });
  await logRequestActivity(
    {
      requestId,
      action: "pco_event_unlinked",
      summary: "Planning Center link removed",
      metadata: { pcoEventId: before?.pcoEventId ?? null },
    },
    user,
  );

  revalidateLinkSurfaces(requestId);
}
