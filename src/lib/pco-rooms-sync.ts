import { db } from "@/lib/db";
import { pcoConfigured } from "@/lib/pco";
import {
  fetchPcoResources,
  fetchFutureBookingsForResource,
} from "@/lib/pco-rooms";
import { revalidatePath } from "next/cache";

/** What a `syncRooms()` run did. `skipped` true ⇒ PCO not configured (no-op). */
export interface SyncRoomsResult {
  skipped: boolean;
  resources: number; // resources upserted this run
  rooms: number; // of those, kind === "Room" (bookings synced for these)
  deactivated: number; // resources marked inactive (gone from PCO)
  bookings: number; // future bookings upserted across all rooms
}

const ROOM_KIND = "Room";

/**
 * Pull the org's bookable Resources + each ROOM's future bookings from PCO
 * Calendar into our read-only mirror (PcoResource / PcoResourceBooking).
 *
 * Idempotent and safe to run on a schedule:
 *  1. Upsert every resource keyed on `pcoResourceId` (refreshing name/kind/etc.,
 *     marking `active`). Any resource we'd seen before but PCO no longer returns
 *     is marked `active = false` (its historical bookings survive via the row).
 *  2. For each ROOM, pull its FUTURE bookings and replace that room's bookings:
 *     delete the room's existing rows, then insert the fresh future set. This
 *     prunes past/cancelled bookings without leaving stale rows behind.
 *
 * Resources are synced sequentially with the polite pagination in
 * `pco-rooms.ts`, so we stay well under PCO's 100-req/20s limit. If PCO isn't
 * configured this no-ops with `{ skipped: true }`. Network/credential errors
 * propagate to the caller (the cron catches them so a rooms failure can't break
 * the event sync). READ-ONLY against PCO throughout.
 */
export async function syncRooms(): Promise<SyncRoomsResult> {
  if (!pcoConfigured()) {
    return { skipped: true, resources: 0, rooms: 0, deactivated: 0, bookings: 0 };
  }

  const resources = await fetchPcoResources();
  const seenIds = new Set(resources.map((r) => r.pcoResourceId));

  // 1) Upsert resources. Map pcoResourceId → our row id (for booking FKs).
  const localIdByPco = new Map<string, string>();
  for (const r of resources) {
    const row = await db.pcoResource.upsert({
      where: { pcoResourceId: r.pcoResourceId },
      update: {
        name: r.name,
        kind: r.kind,
        description: r.description,
        homeLocation: r.homeLocation,
        quantity: r.quantity,
        imageUrl: r.imageUrl,
        updatedAt: r.updatedAt,
        active: true,
        syncedAt: new Date(),
      },
      create: {
        pcoResourceId: r.pcoResourceId,
        name: r.name,
        kind: r.kind,
        description: r.description,
        homeLocation: r.homeLocation,
        quantity: r.quantity,
        imageUrl: r.imageUrl,
        updatedAt: r.updatedAt,
        active: true,
      },
      select: { id: true },
    });
    localIdByPco.set(r.pcoResourceId, row.id);
  }

  // Mark resources we have but PCO no longer returns as inactive (keep history).
  const deactivated = await db.pcoResource.updateMany({
    where: { active: true, pcoResourceId: { notIn: [...seenIds] } },
    data: { active: false },
  });

  // 2) For each ROOM, replace its future bookings with a fresh pull.
  const rooms = resources.filter((r) => r.kind === ROOM_KIND);
  let bookings = 0;
  for (const room of rooms) {
    const localId = localIdByPco.get(room.pcoResourceId);
    if (!localId) continue;

    const future = await fetchFutureBookingsForResource(room.pcoResourceId);

    // Replace this room's bookings: delete then insert the fresh future set.
    // (Idempotent + prunes past/cancelled bookings in one shot.)
    await db.$transaction([
      db.pcoResourceBooking.deleteMany({ where: { resourceId: localId } }),
      ...(future.length > 0
        ? [
            db.pcoResourceBooking.createMany({
              data: future.map((b) => ({
                pcoBookingId: b.pcoBookingId,
                resourceId: localId,
                startsAt: b.startsAt,
                endsAt: b.endsAt,
                eventInstanceId: b.eventInstanceId,
                eventTitle: b.eventTitle,
                churchCenterUrl: b.churchCenterUrl,
                approvalStatus: b.approvalStatus,
              })),
            }),
          ]
        : []),
    ]);
    bookings += future.length;
  }

  // Refresh the Rooms pages. Guarded: when syncRooms is invoked outside a
  // request context (e.g. a one-off script) revalidatePath throws — the data is
  // already written, so a failed cache nudge must not fail the whole sync.
  try {
    revalidatePath("/rooms");
  } catch {
    // no request store (script/test context) — safe to ignore
  }

  return {
    skipped: false,
    resources: resources.length,
    rooms: rooms.length,
    deactivated: deactivated.count,
    bookings,
  };
}
