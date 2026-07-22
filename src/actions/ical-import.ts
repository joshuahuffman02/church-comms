"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { addDays, atMidnight } from "@/lib/engine/dates";
import { generateDeliverablesForRequest } from "@/lib/plan-service";
import {
  LOCAL_ICAL_SOURCE,
  buildExternalEventPreview,
  expandIcsEvents,
  loadLocalIcalEvents,
  type ExternalCalendarEvent,
} from "@/lib/external-calendar";

const MAX_ICAL_UPLOAD_BYTES = 2 * 1024 * 1024;
const ICAL_UPLOAD_HORIZON_DAYS = 365;

export type UploadedIcalEventInput = {
  uid: string;
  key: string;
  title: string;
  startsAtMs: number;
  endsAtMs: number | null;
  dateKey: string;
  location: string | null;
  description: string | null;
  operationalNoise: boolean;
};

export type IcalUploadPreviewRow = {
  event: UploadedIcalEventInput;
  status: "missing" | "possible_match" | "already_in_system";
  matches: {
    id: string;
    title: string;
    eventStartMs: number;
    reason: string;
    confidence: "exact" | "strong" | "possible";
  }[];
};

export type IcalUploadPreviewResult =
  | {
      ok: true;
      fileName: string;
      rows: IcalUploadPreviewRow[];
      windowStartMs: number;
      windowEndMs: number;
    }
  | { ok: false; message: string };

async function selectedEvents(keys: readonly string[]): Promise<ExternalCalendarEvent[]> {
  const wanted = new Set(keys);
  if (wanted.size === 0) return [];
  const events = await loadLocalIcalEvents();
  return events.filter((event) => wanted.has(event.key));
}

function refreshImportSurfaces() {
  revalidatePath("/imports");
  revalidatePath("/import/ical");
  revalidatePath("/import/planning-center");
  revalidatePath("/requests");
  revalidatePath("/calendar");
  revalidatePath("/this-week");
}

function uploadedInput(event: ExternalCalendarEvent): UploadedIcalEventInput {
  return {
    uid: event.uid,
    key: event.key,
    title: event.title,
    startsAtMs: event.startsAt.getTime(),
    endsAtMs: event.endsAt?.getTime() ?? null,
    dateKey: event.dateKey,
    location: event.location,
    description: event.description,
    operationalNoise: event.operationalNoise,
  };
}

function sanitizeUploadedEvent(input: UploadedIcalEventInput): ExternalCalendarEvent | null {
  if (!input || typeof input !== "object") return null;
  const startsAtMs = Number(input.startsAtMs);
  const endsAtMs = input.endsAtMs == null ? null : Number(input.endsAtMs);
  const title = String(input.title ?? "").trim().slice(0, 300);
  const key = String(input.key ?? "").trim().slice(0, 600);
  const uid = String(input.uid ?? "").trim().slice(0, 500);
  const dateKey = String(input.dateKey ?? "").trim();
  if (!title || !key || !uid || !Number.isFinite(startsAtMs) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }
  if (endsAtMs != null && !Number.isFinite(endsAtMs)) return null;
  const today = atMidnight(new Date());
  const latest = addDays(today, ICAL_UPLOAD_HORIZON_DAYS + 1);
  const startsAt = new Date(startsAtMs);
  if (startsAt < today || startsAt > latest) return null;

  return {
    uid,
    key,
    title,
    startsAt,
    endsAt: endsAtMs == null ? null : new Date(endsAtMs),
    dateKey,
    location: input.location == null ? null : String(input.location).trim().slice(0, 500) || null,
    description:
      input.description == null ? null : String(input.description).trim().slice(0, 10_000) || null,
    operationalNoise: Boolean(input.operationalNoise),
    source: "single",
  };
}

/** Parse a one-off .ics upload in memory. The file is never saved on the server. */
export async function previewIcalUpload(formData: FormData): Promise<IcalUploadPreviewResult> {
  await requireAdmin();
  const upload = formData.get("calendarFile");
  if (!(upload instanceof File) || upload.size === 0) {
    return { ok: false, message: "Choose a calendar (.ics) file first." };
  }
  if (upload.size > MAX_ICAL_UPLOAD_BYTES) {
    return { ok: false, message: "That file is larger than 2 MB. Export a smaller date range and try again." };
  }
  if (!upload.name.toLowerCase().endsWith(".ics")) {
    return { ok: false, message: "Choose a file whose name ends in .ics." };
  }

  const ics = await upload.text();
  if (!/BEGIN:VCALENDAR/i.test(ics) || !/BEGIN:VEVENT/i.test(ics)) {
    return { ok: false, message: "This does not look like a calendar export with events." };
  }

  const today = atMidnight(new Date());
  const horizon = addDays(today, ICAL_UPLOAD_HORIZON_DAYS);
  const events = expandIcsEvents(ics, today, horizon);
  if (events.length === 0) {
    return { ok: false, message: "No upcoming events were found in this file." };
  }

  const existing = await db.request.findMany({
    where: { eventStart: { gte: today, lte: horizon } },
    orderBy: { eventStart: "asc" },
    select: {
      id: true,
      title: true,
      eventStart: true,
      location: true,
      pcoEventId: true,
      externalCalendarKey: true,
    },
  });
  const previews = buildExternalEventPreview(events, existing, today, ICAL_UPLOAD_HORIZON_DAYS);

  return {
    ok: true,
    fileName: upload.name.slice(0, 200),
    windowStartMs: today.getTime(),
    windowEndMs: horizon.getTime(),
    rows: previews.map((preview) => ({
      event: uploadedInput(preview.event),
      status: preview.status,
      matches: preview.matches.map((match) => ({
        id: match.id,
        title: match.title,
        eventStartMs: match.eventStart.getTime(),
        reason: match.reason,
        confidence: match.confidence,
      })),
    })),
  };
}

/** Import selected rows from an in-memory upload preview. */
export async function importUploadedIcalEvents(
  inputs: UploadedIcalEventInput[],
): Promise<{ created: number; skipped: number }> {
  const user = await requireAdmin();
  const events = inputs.slice(0, 200).map(sanitizeUploadedEvent).filter((event): event is ExternalCalendarEvent => !!event);
  if (events.length === 0) return { created: 0, skipped: inputs.length };

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
        notes: `Imported from ${event.dateKey} calendar-file preview.`,
      },
      select: { id: true },
    });
    const planned = await generateDeliverablesForRequest(request.id);
    await logRequestActivity(
      {
        requestId: request.id,
        action: "ical_upload_imported",
        summary: `Imported from calendar file: ${event.title}`,
        metadata: { key: event.key, uid: event.uid, dateKey: event.dateKey, planned },
      },
      user,
    );
    created += 1;
  }
  refreshImportSurfaces();
  return { created, skipped: inputs.length - created };
}

/** Link a file occurrence to an existing event instead of creating a duplicate. */
export async function linkUploadedIcalEvent(
  input: UploadedIcalEventInput,
  requestId: string,
): Promise<{ linked: boolean }> {
  const user = await requireAdmin();
  const event = sanitizeUploadedEvent(input);
  if (!event) return { linked: false };
  const request = await db.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!request) return { linked: false };
  await db.request.update({
    where: { id: requestId },
    data: { externalCalendarSource: LOCAL_ICAL_SOURCE, externalCalendarKey: event.key },
  });
  await logRequestActivity(
    {
      requestId,
      action: "ical_upload_linked",
      summary: `Linked to calendar-file event: ${event.title}`,
      metadata: { key: event.key, uid: event.uid, dateKey: event.dateKey },
    },
    user,
  );
  refreshImportSurfaces();
  return { linked: true };
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
    const planned = await generateDeliverablesForRequest(request.id);
    await logRequestActivity(
      {
        requestId: request.id,
        action: "ical_event_imported",
        summary: `Imported from iCal: ${event.title}`,
        metadata: { key: event.key, uid: event.uid, dateKey: event.dateKey, planned },
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
