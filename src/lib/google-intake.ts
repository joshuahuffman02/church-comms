/**
 * Google Calendar intake — the read-only "casual front door".
 *
 * Events on a church Google Calendar flow into a review inbox first. Staff
 * manually accept the right ones as lightweight STUB Requests (status
 * "submitted", no plan), then a dated "New event intake" checklist ripens them:
 * confirm details → create the Planning Center event (a guided human step,
 * since PCO's API is read-only) → set audience/channels → confirm room. Reuses
 * the existing external-calendar fetch/parse, the unique `externalCalendarKey`
 * dedup, and the playbook/EventTask engine.
 *
 * No "use server" — these are plain server-side helpers so the cron route (which
 * has no user session) can call them directly, alongside the admin-guarded
 * actions in `src/actions/google-import.ts`.
 */
import { db } from "@/lib/db";
import { activeExternalCalendarUrl } from "@/lib/calendar-settings";
import { atMidnight } from "@/lib/engine/dates";
import { computeTaskDueDates } from "@/lib/playbooks";
import {
  fetchExternalCalendarEvents,
  buildExternalEventPreview,
  type ExternalCalendarEvent,
  type ExternalEventMatch,
  type ExternalEventPreview,
} from "@/lib/external-calendar";

/** Provenance marker stored on `Request.externalCalendarSource`. */
export const GOOGLE_ICAL_SOURCE = "google-ics";

/** The ripening checklist's name (also the EventTask.source tag). */
export const INTAKE_TEMPLATE_NAME = "New event intake";

/** Where to create the real event (PCO Calendar) — surfaced in the to-do. */
const PCO_CALENDAR_URL = "https://calendar.planningcenteronline.com";

/** True when a calendar feed is configured in settings or via GOOGLE_* envs. */
export async function googleCalendarConfigured(): Promise<boolean> {
  return !!(await activeExternalCalendarUrl());
}

// ── The ripening checklist (Phases 3 + 4) ───────────────────────────────────
// `offsetDays` = days BEFORE the event the step is due (null = undated/now).

type IntakeTaskDef = {
  title: string;
  offsetDays: number | null;
  category: string;
  notes: string;
};

export const INTAKE_TASKS: IntakeTaskDef[] = [
  {
    title: "Confirm the event details",
    offsetDays: null,
    category: "Intake",
    notes:
      "This came in from Google Calendar as a tentative entry. Fill in who it's for, a short description, and the one next step.",
  },
  {
    title: "Create the event in Planning Center",
    offsetDays: 30,
    category: "Intake",
    notes:
      `Add it to Planning Center Calendar (the source of truth): ${PCO_CALENDAR_URL}. ` +
      "Then open this event here and use “Link to Planning Center” so the two become one record (no duplicate).",
  },
  {
    title: "Set the audience & channels",
    offsetDays: 21,
    category: "Intake",
    notes:
      "Pick who it's for (whole church / ministry / small group). That sets the channels and builds the promo plan.",
  },
  {
    title: "Confirm the room / location",
    offsetDays: 14,
    category: "Intake",
    notes: "Make sure the room is booked and the location is right before it goes out.",
  },
];

/** Find-or-create the intake checklist template (idempotent). */
export async function ensureIntakeTemplate(): Promise<{ id: string; name: string }> {
  const existing = await db.eventTemplate.findFirst({
    where: { name: INTAKE_TEMPLATE_NAME },
    select: { id: true, name: true },
  });
  if (existing) return existing;
  return db.eventTemplate.create({
    data: {
      name: INTAKE_TEMPLATE_NAME,
      description:
        "Auto-applied to events that arrive from Google Calendar — the steps to ripen a tentative calendar entry into a fully-planned, Planning-Center-linked event.",
      tasks: {
        create: INTAKE_TASKS.map((t, i) => ({
          title: t.title,
          notes: t.notes,
          offsetDays: t.offsetDays,
          category: t.category,
          sortOrder: i,
        })),
      },
    },
    select: { id: true, name: true },
  });
}

/**
 * Materialize an EventTemplate's tasks onto a Request as concrete EventTasks
 * (dueAt = eventStart − offsetDays), skipping any already present from the same
 * source. No-auth core (the admin action `applyTemplate` does the same with a
 * guard + activity log); safe to call from the cron path. Returns rows created.
 */
export async function materializeTemplateOnto(requestId: string, templateId: string): Promise<number> {
  const [request, template] = await Promise.all([
    db.request.findUnique({ where: { id: requestId }, select: { id: true, eventStart: true } }),
    db.eventTemplate.findUnique({
      where: { id: templateId },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);
  if (!request || !template) return 0;

  const dated = computeTaskDueDates(request.eventStart, template.tasks);
  const existing = await db.eventTask.findMany({
    where: { requestId, source: template.name },
    select: { title: true },
  });
  const have = new Set(existing.map((t) => t.title));

  const toCreate = dated
    .filter((t) => !have.has(t.title))
    .map((t) => ({
      requestId,
      title: t.title,
      notes: t.notes ?? null,
      dueAt: t.dueAt,
      status: "todo",
      source: template.name,
      category: t.category ?? null,
      sortOrder: t.sortOrder,
    }));

  if (toCreate.length > 0) await db.eventTask.createMany({ data: toCreate });
  return toCreate.length;
}

/** Attach the intake checklist to a (Google-sourced) stub event. */
export async function applyIntakeChecklist(requestId: string): Promise<number> {
  const template = await ensureIntakeTemplate();
  return materializeTemplateOnto(requestId, template.id);
}

// ── Stub creation + selection ────────────────────────────────────────────────

/**
 * Create one Google-sourced stub Request (submitted, unplanned) + its ripening
 * checklist. Returns the new id, or null if a stub for this key already exists
 * (dedup on the unique externalCalendarKey — safe under concurrent syncs).
 */
export async function createGoogleStub(event: ExternalCalendarEvent): Promise<string | null> {
  try {
    const request = await db.request.create({
      data: {
        externalCalendarSource: GOOGLE_ICAL_SOURCE,
        externalCalendarKey: event.key,
        title: event.title,
        description: event.description,
        eventStart: atMidnight(event.startsAt),
        eventEnd: event.endsAt ? atMidnight(event.endsAt) : null,
        location: event.location,
        whoIsItFor: "whole_church",
        tier: 2,
        status: "submitted",
        notes: `From Google Calendar (${event.dateKey}). Tentative until details are confirmed.`,
      },
      select: { id: true },
    });
    await applyIntakeChecklist(request.id);
    return request.id;
  } catch {
    // Unique externalCalendarKey collision (already imported) — treat as skip.
    return null;
  }
}

/**
 * Pure: decide which fetched Google events are NEW and worth importing
 * automatically — not operational noise, not already imported (by key), not
 * ignored, and not already tracked in the system (a title+date match with an
 * existing event, incl. PCO ones, so we never duplicate Planning Center).
 */
export function pickNewGoogleEvents(
  events: ExternalCalendarEvent[],
  previews: ExternalEventPreview[],
  existingKeys: ReadonlySet<string>,
  ignoredKeys: ReadonlySet<string>,
): ExternalCalendarEvent[] {
  const status = new Map(previews.map((p) => [p.event.key, p.status]));
  return events.filter(
    (e) =>
      !e.operationalNoise &&
      !existingKeys.has(e.key) &&
      !ignoredKeys.has(e.key) &&
      (status.get(e.key) ?? "missing") === "missing",
  );
}

export type CalendarImportRecommendation = {
  recommendation: "accept" | "ignore" | "review";
  reason: string;
};

function normalizeHistoryTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function pruneStaleGoogleCandidates(activeKeys: ReadonlySet<string>): Promise<void> {
  const pending = await db.calendarImportCandidate.findMany({
    where: { source: GOOGLE_ICAL_SOURCE, status: "pending" },
    select: { id: true, key: true },
  });
  const staleIds = pending
    .filter((candidate) => !activeKeys.has(candidate.key))
    .map((candidate) => candidate.id);

  const chunkSize = 500;
  for (let i = 0; i < staleIds.length; i += chunkSize) {
    await db.calendarImportCandidate.deleteMany({
      where: { id: { in: staleIds.slice(i, i + chunkSize) } },
    });
  }
}

export function recommendGoogleImportCandidate(
  event: ExternalCalendarEvent,
  status: ExternalEventPreview["status"],
  history: {
    acceptedTitles: ReadonlySet<string>;
    ignoredTitles: ReadonlySet<string>;
  },
  match?: ExternalEventMatch | null,
): CalendarImportRecommendation {
  const title = normalizeHistoryTitle(event.title);

  if (status === "already_in_system") {
    return {
      recommendation: "ignore",
      reason: match
        ? `Looks like this is already in Church Comms as "${match.title}" (${match.reason}).`
        : "Looks like this event is already in Church Comms.",
    };
  }
  if (event.operationalNoise) {
    return { recommendation: "ignore", reason: "Looks like room/admin noise instead of a promoted event." };
  }
  if (history.ignoredTitles.has(title)) {
    return { recommendation: "ignore", reason: "Similar calendar items have been ignored before." };
  }
  if (status === "possible_match") {
    return {
      recommendation: "review",
      reason: match
        ? `Possible duplicate of "${match.title}" (${match.reason}).`
        : "It may already exist under a similar title or date.",
    };
  }
  if (history.acceptedTitles.has(title)) {
    return { recommendation: "accept", reason: "Similar calendar items have been accepted before." };
  }
  return { recommendation: "accept", reason: "New calendar event with no close match in Church Comms." };
}

export type GoogleSyncResult = {
  configured: boolean;
  checked: number;
  pending: number;
  suggestedAccept: number;
  suggestedIgnore: number;
  suggestedReview: number;
};

/**
 * One-way calendar discovery: fetch the feed and refresh the review inbox.
 * It does NOT create, update, or delete Requests. Staff still accept/ignore on
 * /import/google. Throws only on a fetch failure (the cron route catches it).
 */
export async function discoverGoogleCalendarCandidates(): Promise<GoogleSyncResult> {
  const calendarUrl = await activeExternalCalendarUrl();
  if (!calendarUrl) {
    return { configured: false, checked: 0, pending: 0, suggestedAccept: 0, suggestedIgnore: 0, suggestedReview: 0 };
  }

  const events = await fetchExternalCalendarEvents(calendarUrl);
  const activeKeys = new Set(events.map((event) => event.key));
  const [existing, ignored, acceptedHistory, ignoredHistory] = await Promise.all([
    db.request.findMany({
      where: {
        OR: [
          { externalCalendarSource: GOOGLE_ICAL_SOURCE },
          { eventStart: { gte: atMidnight(new Date()) } },
        ],
      },
      select: { id: true, title: true, eventStart: true, location: true, pcoEventId: true, externalCalendarKey: true },
    }),
    db.externalCalendarIgnore.findMany({
      where: { source: GOOGLE_ICAL_SOURCE },
      select: { key: true, title: true },
    }),
    db.request.findMany({
      where: { externalCalendarSource: GOOGLE_ICAL_SOURCE },
      select: { title: true },
      distinct: ["title"],
    }),
    db.externalCalendarIgnore.findMany({
      where: { source: GOOGLE_ICAL_SOURCE },
      select: { title: true },
    }),
  ]);

  const existingKeys = new Set(
    existing.map((r) => r.externalCalendarKey).filter((k): k is string => !!k),
  );
  const ignoredKeys = new Set(ignored.map((r) => r.key));
  const previews = buildExternalEventPreview(events, existing);
  const previewByKey = new Map(previews.map((preview) => [preview.event.key, preview]));
  const history = {
    acceptedTitles: new Set(acceptedHistory.map((row) => normalizeHistoryTitle(row.title))),
    ignoredTitles: new Set(ignoredHistory.map((row) => normalizeHistoryTitle(row.title))),
  };

  await pruneStaleGoogleCandidates(activeKeys);

  for (const event of events) {
    if (existingKeys.has(event.key) || ignoredKeys.has(event.key)) continue;

    const preview = previewByKey.get(event.key);
    const status = preview?.status ?? "missing";
    const match = preview?.matches[0] ?? null;
    const suggestion = recommendGoogleImportCandidate(event, status, history, match);
    const matchData = {
      matchRequestId: match?.id ?? null,
      matchTitle: match?.title ?? null,
      matchDate: match?.eventStart ? atMidnight(match.eventStart) : null,
      matchReason: match?.reason ?? null,
      matchConfidence: match?.confidence ?? null,
      matchScore: match?.titleScore ?? null,
    };

    await db.calendarImportCandidate.upsert({
      where: { source_key: { source: GOOGLE_ICAL_SOURCE, key: event.key } },
      update: {
        uid: event.uid,
        dateKey: event.dateKey,
        title: event.title,
        startsAt: atMidnight(event.startsAt),
        endsAt: event.endsAt ? atMidnight(event.endsAt) : null,
        location: event.location,
        description: event.description,
        operationalNoise: event.operationalNoise,
        status: "pending",
        recommendation: suggestion.recommendation,
        recommendationReason: suggestion.reason,
        ...matchData,
      },
      create: {
        source: GOOGLE_ICAL_SOURCE,
        key: event.key,
        uid: event.uid,
        dateKey: event.dateKey,
        title: event.title,
        startsAt: atMidnight(event.startsAt),
        endsAt: event.endsAt ? atMidnight(event.endsAt) : null,
        location: event.location,
        description: event.description,
        operationalNoise: event.operationalNoise,
        recommendation: suggestion.recommendation,
        recommendationReason: suggestion.reason,
        ...matchData,
      },
    });
  }

  const pending = await db.calendarImportCandidate.groupBy({
    by: ["recommendation"],
    where: { source: GOOGLE_ICAL_SOURCE, status: "pending" },
    _count: { _all: true },
  });
  const count = (recommendation: string) =>
    pending.find((row) => row.recommendation === recommendation)?._count._all ?? 0;

  return {
    configured: true,
    checked: events.length,
    pending: pending.reduce((sum, row) => sum + row._count._all, 0),
    suggestedAccept: count("accept"),
    suggestedIgnore: count("ignore"),
    suggestedReview: count("review"),
  };
}

export const syncGoogleCalendar = discoverGoogleCalendarCandidates;
