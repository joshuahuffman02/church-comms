"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import type { CalendarImportCandidate } from "@prisma/client";
import { GOOGLE_ICAL_SOURCE, createGoogleStub, discoverGoogleCalendarCandidates } from "@/lib/google-intake";
import type { ExternalCalendarEvent } from "@/lib/external-calendar";

function candidateToEvent(candidate: CalendarImportCandidate): ExternalCalendarEvent {
  return {
    uid: candidate.uid,
    key: candidate.key,
    title: candidate.title,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    dateKey: candidate.dateKey,
    location: candidate.location,
    description: candidate.description,
    source: "single",
    operationalNoise: candidate.operationalNoise,
  };
}

async function selectedGoogleEvents(keys: readonly string[]): Promise<ExternalCalendarEvent[]> {
  const wanted = new Set(keys);
  if (wanted.size === 0) return [];
  const candidates = await db.calendarImportCandidate.findMany({
    where: { source: GOOGLE_ICAL_SOURCE, status: "pending", key: { in: [...wanted] } },
    orderBy: { startsAt: "asc" },
  });
  return candidates.map(candidateToEvent);
}

function refreshImportSurfaces() {
  revalidatePath("/import/google");
  revalidatePath("/requests");
  revalidatePath("/calendar");
  revalidatePath("/this-week");
}

/** Pull the calendar feed into the one-way review inbox without creating Requests. */
export async function checkGoogleCalendarForEvents() {
  await requireAdmin();
  const result = await discoverGoogleCalendarCandidates();
  refreshImportSurfaces();
  return result;
}

/** Manually import the chosen Google Calendar events as stub Requests. */
export async function importGoogleEvents(keys: string[]): Promise<{ created: number; skipped: number }> {
  const user = await requireAdmin();
  const events = await selectedGoogleEvents(keys);
  if (events.length === 0) return { created: 0, skipped: keys.length };

  let created = 0;
  for (const event of events) {
    const id = await createGoogleStub(event); // creates stub + ripening checklist; null = already imported
    if (!id) continue;
    await logRequestActivity(
      {
        requestId: id,
        action: "google_event_imported",
        summary: `Imported from Google Calendar: ${event.title}`,
        metadata: { key: event.key, uid: event.uid, dateKey: event.dateKey },
      },
      user,
    );
    created += 1;
  }

  await db.calendarImportCandidate.updateMany({
    where: { source: GOOGLE_ICAL_SOURCE, key: { in: keys } },
    data: { status: "accepted" },
  });

  refreshImportSurfaces();
  return { created, skipped: keys.length - created };
}

/** Hide chosen Google events so they stop appearing in the import list. */
export async function ignoreGoogleEvents(keys: string[]): Promise<{ ignored: number }> {
  await requireAdmin();
  const events = await selectedGoogleEvents(keys);
  if (events.length === 0) return { ignored: 0 };

  for (const event of events) {
    await db.externalCalendarIgnore.upsert({
      where: { source_key: { source: GOOGLE_ICAL_SOURCE, key: event.key } },
      update: { uid: event.uid, dateKey: event.dateKey, title: event.title, location: event.location },
      create: {
        source: GOOGLE_ICAL_SOURCE,
        key: event.key,
        uid: event.uid,
        dateKey: event.dateKey,
        title: event.title,
        location: event.location,
      },
    });
  }

  await db.calendarImportCandidate.updateMany({
    where: { source: GOOGLE_ICAL_SOURCE, key: { in: keys } },
    data: { status: "ignored" },
  });

  refreshImportSurfaces();
  return { ignored: events.length };
}
