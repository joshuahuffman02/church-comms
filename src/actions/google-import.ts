"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { fetchExternalCalendarEvents, type ExternalCalendarEvent } from "@/lib/external-calendar";
import { GOOGLE_ICAL_SOURCE, createGoogleStub } from "@/lib/google-intake";

async function selectedGoogleEvents(keys: readonly string[]): Promise<ExternalCalendarEvent[]> {
  const wanted = new Set(keys);
  if (wanted.size === 0) return [];
  const events = await fetchExternalCalendarEvents();
  return events.filter((event) => wanted.has(event.key));
}

function refreshImportSurfaces() {
  revalidatePath("/import/google");
  revalidatePath("/requests");
  revalidatePath("/calendar");
  revalidatePath("/this-week");
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

  refreshImportSurfaces();
  return { ignored: events.length };
}
