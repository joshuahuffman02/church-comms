"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { atMidnight } from "@/lib/engine/dates";
import {
  LOCAL_ICAL_SOURCE,
  loadLocalIcalEvents,
  type ExternalCalendarEvent,
} from "@/lib/external-calendar";

async function selectedEvents(keys: readonly string[]): Promise<ExternalCalendarEvent[]> {
  const wanted = new Set(keys);
  if (wanted.size === 0) return [];
  const events = await loadLocalIcalEvents();
  return events.filter((event) => wanted.has(event.key));
}

function refreshImportSurfaces() {
  revalidatePath("/import/ical");
  revalidatePath("/import/planning-center");
  revalidatePath("/requests");
  revalidatePath("/calendar");
  revalidatePath("/this-week");
}

export async function importIcalEvents(keys: string[]): Promise<{ created: number; skipped: number }> {
  const user = await requireAdmin();
  const events = await selectedEvents(keys);
  if (events.length === 0) return { created: 0, skipped: keys.length };

  const existing = await db.request.findMany({
    where: { externalCalendarKey: { in: events.map((event) => event.key) } },
    select: { externalCalendarKey: true },
  });
  const existingKeys = new Set(existing.map((row) => row.externalCalendarKey).filter(Boolean));

  let created = 0;
  for (const event of events) {
    if (existingKeys.has(event.key)) continue;
    const request = await db.request.create({
      data: {
        externalCalendarSource: LOCAL_ICAL_SOURCE,
        externalCalendarKey: event.key,
        title: event.title,
        description: event.description,
        eventStart: atMidnight(event.startsAt),
        eventEnd: event.endsAt ? atMidnight(event.endsAt) : null,
        location: event.location,
        whoIsItFor: "whole_church",
        tier: 2,
        status: "submitted",
        notes: `Imported from local iCal file (${event.dateKey}).`,
      },
      select: { id: true },
    });
    await logRequestActivity(
      {
        requestId: request.id,
        action: "ical_event_imported",
        summary: `Imported from iCal: ${event.title}`,
        metadata: { key: event.key, uid: event.uid, dateKey: event.dateKey },
      },
      user,
    );
    created += 1;
  }

  refreshImportSurfaces();
  return { created, skipped: keys.length - created };
}

export async function ignoreIcalEvents(keys: string[]): Promise<{ ignored: number }> {
  await requireAdmin();
  const events = await selectedEvents(keys);
  if (events.length === 0) return { ignored: 0 };

  for (const event of events) {
    await db.externalCalendarIgnore.upsert({
      where: { source_key: { source: LOCAL_ICAL_SOURCE, key: event.key } },
      update: {
        uid: event.uid,
        dateKey: event.dateKey,
        title: event.title,
        location: event.location,
      },
      create: {
        source: LOCAL_ICAL_SOURCE,
        key: event.key,
        uid: event.uid,
        dateKey: event.dateKey,
        title: event.title,
        location: event.location,
      },
    });
  }

  refreshImportSurfaces();
  return { ignored: events.length };
}

export async function confirmIcalMatch(
  key: string,
  requestId: string,
): Promise<{ linked: boolean }> {
  const user = await requireAdmin();

  const [event] = await selectedEvents([key]);
  if (!event) return { linked: false };

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { id: true },
  });
  if (!request) return { linked: false };

  await db.request.update({
    where: { id: requestId },
    data: {
      externalCalendarSource: LOCAL_ICAL_SOURCE,
      externalCalendarKey: event.key,
    },
  });
  await logRequestActivity(
    {
      requestId,
      action: "ical_event_linked",
      summary: `Linked to iCal event: ${event.title}`,
      metadata: { key: event.key, uid: event.uid, dateKey: event.dateKey },
    },
    user,
  );

  refreshImportSurfaces();
  return { linked: true };
}
