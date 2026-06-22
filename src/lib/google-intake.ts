/**
 * Google Calendar intake — the read-only "casual front door".
 *
 * Events on a church Google Calendar flow in as lightweight STUB Requests
 * (status "submitted", no plan), then a dated "New event intake" checklist
 * ripens them: confirm details → create the Planning Center event (a guided
 * human step, since PCO's API is read-only) → set audience/channels → confirm
 * room. Reuses the existing external-calendar fetch/parse, the unique
 * `externalCalendarKey` dedup, and the playbook/EventTask engine.
 *
 * No "use server" — these are plain server-side helpers so the cron route (which
 * has no user session) can call them directly, alongside the admin-guarded
 * actions in `src/actions/google-import.ts`.
 */
import { db } from "@/lib/db";
import { atMidnight } from "@/lib/engine/dates";
import { computeTaskDueDates } from "@/lib/playbooks";
import {
  configuredExternalCalendarUrl,
  fetchExternalCalendarEvents,
  buildExternalEventPreview,
  type ExternalCalendarEvent,
  type ExternalEventPreview,
} from "@/lib/external-calendar";

/** Provenance marker stored on `Request.externalCalendarSource`. */
export const GOOGLE_ICAL_SOURCE = "google-ics";

/** The ripening checklist's name (also the EventTask.source tag). */
export const INTAKE_TEMPLATE_NAME = "New event intake";

/** Where to create the real event (PCO Calendar) — surfaced in the to-do. */
const PCO_CALENDAR_URL = "https://calendar.planningcenteronline.com";

/** True when a Google calendar feed is configured (any of the GOOGLE_* envs). */
export function googleCalendarConfigured(): boolean {
  return !!configuredExternalCalendarUrl();
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

export type GoogleSyncResult = {
  configured: boolean;
  created: number;
  skipped: number;
};

/**
 * Scheduled auto-pull (cron): bring in new Google events as stub Requests +
 * ripening checklists. Idempotent — re-running only adds events that aren't
 * already imported/ignored/tracked. Throws only on a fetch failure (the cron
 * route catches it).
 */
export async function syncGoogleCalendar(): Promise<GoogleSyncResult> {
  if (!googleCalendarConfigured()) return { configured: false, created: 0, skipped: 0 };

  const events = await fetchExternalCalendarEvents();
  if (events.length === 0) return { configured: true, created: 0, skipped: 0 };

  const [existing, ignored] = await Promise.all([
    db.request.findMany({
      where: {
        OR: [
          { externalCalendarKey: { in: events.map((e) => e.key) } },
          { eventStart: { gte: atMidnight(new Date()) } },
        ],
      },
      select: { id: true, title: true, eventStart: true, location: true, pcoEventId: true, externalCalendarKey: true },
    }),
    db.externalCalendarIgnore.findMany({
      where: { source: GOOGLE_ICAL_SOURCE, key: { in: events.map((e) => e.key) } },
      select: { key: true },
    }),
  ]);

  const existingKeys = new Set(
    existing.map((r) => r.externalCalendarKey).filter((k): k is string => !!k),
  );
  const ignoredKeys = new Set(ignored.map((r) => r.key));
  const previews = buildExternalEventPreview(events, existing);

  const fresh = pickNewGoogleEvents(events, previews, existingKeys, ignoredKeys);
  let created = 0;
  for (const event of fresh) {
    const id = await createGoogleStub(event);
    if (id) created += 1;
  }
  return { configured: true, created, skipped: events.length - created };
}
