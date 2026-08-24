"use server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { atMidnight } from "@/lib/engine/dates";
import { ministryCreateData } from "@/lib/ministries";
import { generateDeliverablesForRequest, replanRequest } from "@/lib/plan-service";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import { classifyByTags, type TagRule } from "@/lib/tag-rules";
import {
  fetchApprovedUpcomingPcoEvents,
  fetchUpcomingPcoEvents,
  fetchPcoPerson,
  fetchEventRoomStatus,
  pcoPolitePause,
  pcoConfigured,
  type PcoEvent,
  type PcoPerson,
} from "@/lib/pco";
import { syncRooms } from "@/lib/pco-rooms-sync";
import { revalidatePath } from "next/cache";

const NEW_PCO_EVENT_SYNC_WINDOW = 50;

/**
 * Load the active tag-classification rules ONCE per sync (so we don't query per
 * event) and shape them into the pure {@link TagRule} the classifier wants.
 * Ordered by `sortOrder` for stable, admin-controlled precedence.
 */
async function loadTagRules(): Promise<TagRule[]> {
  const rules = await db.eventTagRule.findMany({ orderBy: { sortOrder: "asc" } });
  return rules.map((r) => ({
    tag: r.tag,
    ministryId: r.ministryId,
    tierSuggestion: r.tierSuggestion,
    noPromo: r.noPromo,
    missionTrip: r.missionTrip,
    suggestedTemplateId: r.suggestedTemplateId,
    schedulePreset: r.schedulePreset,
  }));
}

/**
 * The per-event extras we resolve from the PCO People + Calendar APIs (the
 * owner's contact and the overall room-request status) before upserting a
 * Request. Built by {@link enrichPcoEvent}; null fields mean "not resolved /
 * not present" and simply aren't persisted.
 */
interface PcoEventExtras {
  ownerName: string | null;
  ownerEmail: string | null;
  roomStatus: string | null;
}

/**
 * Resolve the per-event extras for one PCO event, memoizing the two network
 * calls within a single sync so shared owners / parent-events aren't refetched:
 *  - the owner Person (cached by `ownerPersonId`) → name + email,
 *  - the room resource-request status (cached by `parentEventId`).
 *
 * Both calls degrade gracefully (the underlying fetchers return nulls on any
 * non-200), so a People-scope gap or an inaccessible event never aborts the
 * sync. A polite pause is inserted only when we actually hit the network (a
 * cache hit costs nothing), keeping us comfortably under the rate limit.
 */
async function enrichPcoEvent(
  e: PcoEvent,
  personCache: Map<string, PcoPerson>,
  roomStatusCache: Map<string, string | null>,
): Promise<PcoEventExtras> {
  let owner: PcoPerson = { name: null, email: null };
  if (e.ownerPersonId) {
    const cached = personCache.get(e.ownerPersonId);
    if (cached) {
      owner = cached;
    } else {
      owner = await fetchPcoPerson(e.ownerPersonId);
      personCache.set(e.ownerPersonId, owner);
      await pcoPolitePause();
    }
  }

  let roomStatus: string | null = null;
  if (e.parentEventId) {
    if (roomStatusCache.has(e.parentEventId)) {
      roomStatus = roomStatusCache.get(e.parentEventId) ?? null;
    } else {
      roomStatus = await fetchEventRoomStatus(e.parentEventId);
      roomStatusCache.set(e.parentEventId, roomStatus);
      await pcoPolitePause();
    }
  }

  return { ownerName: owner.name, ownerEmail: owner.email, roomStatus };
}

/**
 * The single source of truth for turning ONE approved PCO event into a Request.
 *
 * Upserts keyed on `pcoEventId`, so it is idempotent:
 *  - new ids CREATE a Request as "submitted" with a tentative schedule (the
 *    team confirms/re-tiers it at triage), carrying over the PCO logistics we pulled
 *    (start/end, rooms → location/roomBooked, registration, approval status,
 *    Church Center URL). tier defaults to 2 — triage sets the real tier from
 *    reach; we don't pre-judge.
 *  - already-imported ids UPDATE only PCO-owned logistics (start/end, location,
 *    roomBooked, approval status, Church Center URL) so the latest booking is
 *    reflected — but never the comms fields (tier, whoIsItFor, channels), so
 *    triage edits survive a re-import.
 *
 * Returns whether this call CREATED the request (vs. updated an existing one),
 * so callers can tally created/updated counts.
 *
 * `rules` are the active tag-classification rules (loaded once per sync). They
 * are applied ON CREATE ONLY — a well-tagged event lands already classified
 * (ministries + a suggested/applied tier + the no-promo control). We never
 * re-classify on update, so triage edits survive a re-import.
 */
async function upsertPcoEvent(
  e: PcoEvent,
  extras: PcoEventExtras,
  rules: TagRule[],
): Promise<{ id: string; title: string; created: boolean; replanned: boolean }> {
  const hasRooms = e.rooms.length > 0;
  const hasRegistration = !!e.registrationUrl;
  // PCO enrichment (read-only mirror): empty tag list stored as null.
  const tags = e.tags.length > 0 ? e.tags : null;
  const pcoTags = tags ?? Prisma.JsonNull;
  const eventStart = atMidnight(e.startsAt);
  const eventEnd = e.endsAt ? atMidnight(e.endsAt) : null;

  const existing = await db.request.findUnique({
    where: { pcoEventId: e.pcoEventId },
    select: {
      id: true,
      eventStart: true,
      status: true,
      noPromo: true,
      _count: { select: { deliverables: true } },
    },
  });
  const dateChanged = !!existing && existing.eventStart.getTime() !== eventStart.getTime();

  // Tag-driven auto-classification (CREATE-path only — see below). A matched
  // set of rules yields the event's ministries, the broadest suggested tier,
  // and the no-promo control.
  const cls = classifyByTags(e.tags, rules);
  // Only attach ministries when classification found some — otherwise leave the
  // event unministried (as today) rather than wiping the relation to empty.
  const ministryData = cls.ministryIds.length
    ? ministryCreateData(cls.ministryIds)
    : {};
  // The broadest-audience tier beats the blanket tier-2 default; null → keep 2.
  const createTier = cls.tier ?? 2;

  const result = await db.request.upsert({
    where: { pcoEventId: e.pcoEventId },
    // On update, refresh the PCO-owned logistics + read-only enrichment only —
    // leave comms fields (tier / whoIsItFor / channels / deliverables) and the
    // triage-owned requester contact as the team set them.
    update: {
      title: e.name,
      description: e.description,
      eventStart,
      eventEnd,
      location: e.location,
      roomBooked: hasRooms ? "yes" : null,
      needsRegistration: hasRegistration,
      registrationUrl: e.registrationUrl,
      pcoApprovalStatus: e.approvalStatus,
      pcoChurchCenterUrl: e.churchCenterUrl,
      pcoVisibleInChurchCenter: e.visibleInChurchCenter,
      pcoFeatured: e.featured,
      pcoTags,
      pcoOwnerName: extras.ownerName,
      pcoOwnerEmail: extras.ownerEmail,
      pcoRoomStatus: extras.roomStatus,
    },
    create: {
      pcoEventId: e.pcoEventId,
      title: e.name,
      description: e.description,
      eventStart,
      eventEnd,
      location: e.location,
      roomBooked: hasRooms ? "yes" : null,
      needsRegistration: hasRegistration,
      registrationUrl: e.registrationUrl,
      pcoApprovalStatus: e.approvalStatus,
      pcoChurchCenterUrl: e.churchCenterUrl,
      pcoVisibleInChurchCenter: e.visibleInChurchCenter,
      pcoFeatured: e.featured,
      pcoTags,
      pcoOwnerName: extras.ownerName,
      pcoOwnerEmail: extras.ownerEmail,
      pcoRoomStatus: extras.roomStatus,
      // PCO's event owner is source context, not proof that the person submitted
      // a communications request. Keep that contact only in pcoOwnerName/email
      // above so imports never appear in somebody's My Requests history.
      whoIsItFor: "whole_church",
      // Tag-driven classification (CREATE only): the matched ministries, the
      // suggested tier as both an advisory hint AND the working `tier` (so the
      // broadest-audience default beats blanket tier-2; triage still confirms),
      // and the no-promo control from a "Room Only" tag.
      ...ministryData,
      tier: createTier,
      suggestedTier: cls.tier,
      noPromo: cls.noPromo,
      status: "submitted",
    },
    select: { id: true, title: true },
  });

  const created = !existing;
  const shouldReplan =
    !!existing &&
    dateChanged &&
    existing._count.deliverables > 0 &&
    !existing.noPromo &&
    PROMOTABLE_REQUEST_STATUSES.includes(existing.status);
  if (shouldReplan) {
    await replanRequest(result.id);
  } else if (created && !cls.noPromo) {
    // Plan immediately so approval is a publish/visibility decision, not a
    // second manual sync step. Submitted rows remain hidden from production
    // surfaces through their status filters.
    await generateDeliverablesForRequest(result.id);
  }

  return {
    id: result.id,
    title: result.title,
    created,
    replanned: shouldReplan,
  };
}

/**
 * Import the selected approved Planning Center events as Requests.
 *
 * We only ever import events whose event-level approval_status is "A"
 * (Model A): the approved-only list is the source of truth, so a selection of
 * an unapproved/expired id simply imports nothing rather than fabricating a
 * Request. Each event is upserted via {@link upsertPcoEvent}.
 *
 * Returns an explicit completion summary so the review inbox can distinguish
 * brand-new imports from refreshed Planning Center details. Auth-guarded.
 */
export async function importPcoEvents(pcoEventIds: string[]): Promise<{
  created: number;
  updated: number;
  skipped: number;
}> {
  const user = await requireAdmin();

  if (pcoEventIds.length === 0) return { created: 0, updated: 0, skipped: 0 };

  // Pull the live APPROVED upcoming events and keep only the selected ones.
  const approved = await fetchApprovedUpcomingPcoEvents();
  const wanted = new Set(pcoEventIds);
  const selected = approved.filter((e) => wanted.has(e.pcoEventId));

  // Per-import caches so a shared owner / parent-event is fetched once.
  const personCache = new Map<string, PcoPerson>();
  const roomStatusCache = new Map<string, string | null>();
  // Tag rules loaded ONCE for the whole import (not per event).
  const rules = await loadTagRules();

  let created = 0;
  let updated = 0;
  for (const e of selected) {
    const extras = await enrichPcoEvent(e, personCache, roomStatusCache);
    const r = await upsertPcoEvent(e, extras, rules);
    if (r.created) created++;
    else updated++;
    await logRequestActivity(
      {
        requestId: r.id,
        action: r.created ? "pco_event_imported" : "pco_event_refreshed",
        summary: r.created
          ? `Imported from Planning Center: ${r.title}`
          : `Refreshed from Planning Center: ${r.title}`,
        metadata: {
          pcoEventId: e.pcoEventId,
          approvalStatus: e.approvalStatus,
          replanned: r.replanned,
        },
      },
      user,
    );
  }

  revalidatePath("/requests");
  revalidatePath("/imports");
  revalidatePath("/import/planning-center");
  return { created, updated, skipped: pcoEventIds.length - selected.length };
}

/**
 * Check whether the Planning Center connection actually works, without importing
 * anything. Admin-guarded. Returns a friendly {ok, message} the Connections page
 * can show — so an admin can confirm the credentials are good before relying on
 * the sync.
 */
export async function testPcoConnection(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!pcoConfigured()) {
    return { ok: false, message: "Not connected yet — no Planning Center credentials are set." };
  }
  try {
    const events = await fetchUpcomingPcoEvents();
    return {
      ok: true,
      message: `Connected — Planning Center returned ${events.length} upcoming event${
        events.length === 1 ? "" : "s"
      }.`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Couldn't reach Planning Center: ${err.message}`
          : "Couldn't reach Planning Center. Double-check the credentials.",
    };
  }
}

/**
 * Sync Planning Center into Requests. New Requests are limited to the first 50
 * upcoming events, which avoids flooding the app with every future recurring
 * instance. Existing linked Requests are searched across all future PCO pages,
 * so later date/title/registration changes still refresh.
 *
 * Each approved event is upserted via the same {@link upsertPcoEvent} helper
 * `importPcoEvents` uses, so behaviour is identical and idempotent: approved
 * events in the import window are CREATED as Submitted, while existing linked
 * events have their PCO-owned logistics refreshed.
 *
 * Throws when PCO is unconfigured or unreachable (the caller catches it).
 * Returns `{ created, updated }` counts.
 */
export async function syncApprovedPcoEvents(): Promise<{
  created: number;
  updated: number;
}> {
  const upcoming = await fetchUpcomingPcoEvents({ maxPages: "all" });
  const existing = await db.request.findMany({
    where: { pcoEventId: { not: null } },
    select: { pcoEventId: true },
  });
  const existingPcoIds = new Set(
    existing.map((request) => request.pcoEventId).filter((id): id is string => !!id),
  );
  const createWindowPcoIds = new Set(
    upcoming.slice(0, NEW_PCO_EVENT_SYNC_WINDOW).map((event) => event.pcoEventId),
  );
  const syncable = upcoming.filter(
    (event) =>
      existingPcoIds.has(event.pcoEventId) ||
      (event.approvalStatus === "A" && createWindowPcoIds.has(event.pcoEventId)),
  );

  // Per-sync caches: many approved instances share a parent event (and often an
  // owner), so memoizing the People + resource-request lookups keeps the ~50
  // event sync to a handful of extra calls — well under the 100 req/20s limit.
  const personCache = new Map<string, PcoPerson>();
  const roomStatusCache = new Map<string, string | null>();
  // Tag rules loaded ONCE for the whole sync (not per event).
  const rules = await loadTagRules();

  let created = 0;
  let updated = 0;
  for (const e of syncable) {
    const extras = await enrichPcoEvent(e, personCache, roomStatusCache);
    const r = await upsertPcoEvent(e, extras, rules);
    if (r.created) created++;
    else updated++;
  }

  if (created > 0 || updated > 0) {
    for (const path of [
      "/requests",
      "/imports",
      "/import/planning-center",
      "/calendar",
      "/this-week",
      "/run-sheet",
      "/outputs",
      "/exports",
    ]) {
      revalidatePath(path);
    }
  }
  return { created, updated };
}

/**
 * Force the scheduled PCO sync to run NOW, on demand, from the Import page.
 *
 * This is the same engine the cron route drives — {@link syncApprovedPcoEvents}
 * (pull every approved event into Requests) plus the {@link syncRooms} mirror —
 * but admin-guarded so it can back a button instead of CRON_SECRET. Behaviour is
 * identical and idempotent: new events are CREATED as Submitted, existing ones
 * have their PCO-owned logistics refreshed, triage edits survive.
 *
 * The rooms mirror is isolated (like the cron) so a rooms failure — its own
 * endpoints / rate limit — can't fail the event sync; we just report `rooms:
 * null` and a note in the message. Throws "Forbidden" for non-admins and a
 * friendly error when PCO is unconfigured.
 */
export async function forcePcoSync(): Promise<{
  created: number;
  updated: number;
  message: string;
}> {
  await requireAdmin();
  if (!pcoConfigured()) {
    throw new Error("Planning Center isn't connected yet — add credentials first.");
  }

  const { created, updated } = await syncApprovedPcoEvents();

  // Mirror rooms too, but never let a rooms hiccup fail the event sync.
  let roomsNote = "";
  try {
    const rooms = await syncRooms();
    if (!rooms.skipped) {
      roomsNote = `, ${rooms.bookings} room booking${rooms.bookings === 1 ? "" : "s"}`;
    }
  } catch {
    roomsNote = ", rooms unavailable";
  }

  const parts =
    created === 0 && updated === 0
      ? "Already up to date"
      : `${created} new, ${updated} refreshed`;
  return { created, updated, message: `Synced — ${parts}${roomsNote}.` };
}
