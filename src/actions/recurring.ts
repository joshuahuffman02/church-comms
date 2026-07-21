"use server";
import { db } from "@/lib/db";
import { requireEditor, requireAdmin, type SessionUser } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { planEvent, toPrismaDeliverables } from "@/lib/engine/persist";
import { activeChannelConfig } from "@/lib/plan-service";
import { parseDateInput, atMidnight, addDays } from "@/lib/engine/dates";
import {
  cadenceSummary,
  inferRecurrencePattern,
  occurrenceDates,
  type SeriesLike,
} from "@/lib/recurrence";
import { eventLocalDateKey, normalizeEventTitle } from "@/lib/events-overview";
import { ministryCreateData } from "@/lib/ministries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** whoIsItFor → tier, mirroring the create/edit event flows. */
const tierFor: Record<string, number> = { whole_church: 1, ministry: 2, small_group: 3, leadership: 3 };

/** Default look-ahead window for occurrence generation (days from today). */
const DEFAULT_HORIZON_DAYS = 120;

/** Refresh every surface that shows series, events, or scheduled work. */
function revalidateAll() {
  revalidatePath("/recurring");
  revalidatePath("/requests");
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/pipeline");
  revalidatePath("/outputs");
  revalidatePath("/guardrails");
  revalidatePath("/assign");
}

/** Read a form field as a trimmed string, or undefined when blank. */
function optStr(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

/** Read a form field as a bounded integer, or null when blank/invalid/out of range. */
function optInt(fd: FormData, key: string, min: number, max: number): number | null {
  const s = optStr(fd, key);
  if (s == null) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * Core (unguarded) occurrence generator. Shared by the editor-facing
 * `generateOccurrences` action and the cron-driven `generateAllSeries`, which
 * each apply their own auth. `ownerId` is the session user when an editor runs
 * it, or null for the unattended cron run. See `generateOccurrences` for the
 * idempotency contract.
 */
async function buildOccurrences(
  seriesId: string,
  horizonDays: number,
  actor: SessionUser | null
): Promise<number> {
  const seriesRow = await db.recurringSeries.findUnique({ where: { id: seriesId } });
  if (!seriesRow) throw new Error("Series not found");
  if (!seriesRow.active) return 0; // inactive series don't grow

  const horizonEnd = addDays(atMidnight(new Date()), horizonDays);
  const shape: SeriesLike = {
    frequency: seriesRow.frequency,
    interval: seriesRow.interval,
    weekday: seriesRow.weekday,
    dayOfMonth: seriesRow.dayOfMonth,
    startDate: seriesRow.startDate,
    untilDate: seriesRow.untilDate,
  };
  const dates = occurrenceDates(shape, horizonEnd);
  if (dates.length === 0) return 0;

  // Which of these dates already have an occurrence Request? Fetch once and
  // skip them — this is what makes generation idempotent.
  const existing = await db.request.findMany({
    where: { seriesId },
    select: { eventStart: true },
  });
  const taken = new Set(existing.map((r) => atMidnight(r.eventStart).getTime()));

  const toCreate = dates.filter((d) => !taken.has(d.getTime()));
  if (toCreate.length === 0) return 0;

  const { cfg, idByKey } = await activeChannelConfig();
  const today = new Date();
  const ownerId = actor?.id ?? null;

  let created = 0;
  for (const date of toCreate) {
    const plan = planEvent({ eventStart: date, tier: seriesRow.tier }, cfg, today);
    const request = await db.request.create({
      data: {
        seriesId,
        title: seriesRow.title,
        description: seriesRow.description,
        // A series carries at most one ministry → an m-n of one (helper keeps
        // ministryId in sync). null ministry → no entries, ministryId null.
        ...ministryCreateData(seriesRow.ministryId ? [seriesRow.ministryId] : []),
        tier: seriesRow.tier,
        whoIsItFor: seriesRow.whoIsItFor,
        nextStepText: seriesRow.nextStepText,
        location: seriesRow.location,
        eventStart: date,
        status: "approved",
        requesterId: ownerId,
        ownerId,
        deliverables: { create: toPrismaDeliverables(plan, idByKey) },
      },
      select: { id: true },
    });
    await logRequestActivity(
      {
        requestId: request.id,
        action: "series_occurrence_generated",
        summary: `Generated from recurring series: ${seriesRow.title}`,
        metadata: {
          seriesId,
          eventStart: date.toISOString(),
          generatedDeliverables: plan.length,
        },
      },
      actor,
    );
    created++;
  }

  if (created > 0) revalidateAll();
  return created;
}

/**
 * Generate (and persist) the occurrence Requests for a series, up to
 * `today + horizonDays` (and never past untilDate). Idempotent: a date that
 * already has an occurrence Request for this series is skipped, so re-running —
 * or extending the horizon — never duplicates an event. Each new occurrence is
 * a normal approved Request carrying the series template fields, with
 * deliverables built by the shared plan engine. Returns the count created.
 */
export async function generateOccurrences(
  seriesId: string,
  horizonDays = DEFAULT_HORIZON_DAYS
): Promise<number> {
  const user = await requireEditor();
  return buildOccurrences(seriesId, horizonDays, user);
}

export type ConvertToSeriesResult =
  | {
      ok: true;
      seriesId: string;
      title: string;
      cadence: string;
      linked: number;
      generated: number;
    }
  | { ok: false; message: string; seriesId?: string };

const REQUEST_STATUS_WEIGHT: Record<string, number> = {
  submitted: 1,
  needs_info: 1,
  triaged: 2,
  approved: 3,
  in_production: 4,
  proof: 5,
  scheduled: 6,
  published: 7,
};

/**
 * Convert a reviewed set of imported occurrences into one managed recurring
 * series. Existing events stay intact — including their channels and work — and
 * become the first occurrences. Only future missing dates are generated.
 */
export async function turnEventsIntoRecurringSeries(
  requestIds: string[],
): Promise<ConvertToSeriesResult> {
  const user = await requireEditor();
  const ids = [...new Set(requestIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length < 2 || ids.length > 200) {
    return { ok: false, message: "Choose at least two occurrences from one repeated event." };
  }

  const rows = await db.request.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      title: true,
      description: true,
      ministryId: true,
      tier: true,
      whoIsItFor: true,
      nextStepText: true,
      location: true,
      eventStart: true,
      status: true,
      ownerId: true,
      seriesId: true,
      _count: { select: { deliverables: true, tasks: true, assets: true, updates: true } },
    },
  });
  if (rows.length !== ids.length) {
    return { ok: false, message: "One of these occurrences no longer exists. Refresh and try again." };
  }

  const titleKeys = new Set(rows.map((row) => normalizeEventTitle(row.title)));
  if (titleKeys.size !== 1 || ![...titleKeys][0]) {
    return { ok: false, message: "Only occurrences with the same event title can become one series." };
  }

  const dateKeys = rows.map((row) => eventLocalDateKey(row.eventStart.getTime()));
  if (new Set(dateKeys).size !== dateKeys.length) {
    return { ok: false, message: "Merge the overlapping duplicate dates first, then turn this pattern into a series." };
  }

  const existingSeriesIds = [...new Set(rows.map((row) => row.seriesId).filter((id): id is string => !!id))];
  if (existingSeriesIds.length > 1) {
    return { ok: false, message: "These events already belong to different recurring series." };
  }
  if (existingSeriesIds.length === 1) {
    return {
      ok: false,
      message: rows.every((row) => row.seriesId === existingSeriesIds[0])
        ? "These occurrences are already managed as a recurring series."
        : "Some of these events already belong to a recurring series. Review that series before adding the remaining dates.",
      seriesId: existingSeriesIds[0],
    };
  }

  const sorted = [...rows].sort((a, b) => a.eventStart.getTime() - b.eventStart.getTime());
  const inferred = inferRecurrencePattern(sorted.map((row) => row.eventStart));
  if (!inferred) {
    return {
      ok: false,
      message: "The dates are not regular enough to convert automatically. Review the occurrences and fix any missing or unusual dates first.",
    };
  }

  const score = (row: typeof rows[number]) =>
    (REQUEST_STATUS_WEIGHT[row.status] ?? 0) * 100 +
    row._count.deliverables * 12 +
    row._count.tasks * 8 +
    row._count.assets * 5 +
    row._count.updates * 5 +
    (row.ownerId ? 10 : 0) +
    (row.description ? Math.min(row.description.length, 100) / 100 : 0);
  const template = [...rows].sort((a, b) => score(b) - score(a) || a.eventStart.getTime() - b.eventStart.getTime())[0];
  const description = [...rows]
    .map((row) => row.description)
    .filter((value): value is string => !!value)
    .sort((a, b) => b.length - a.length)[0] ?? null;

  const series = await db.$transaction(async (tx) => {
    const created = await tx.recurringSeries.create({
      data: {
        title: template.title,
        description,
        ministryId: template.ministryId,
        tier: template.tier,
        whoIsItFor: template.whoIsItFor,
        nextStepText: template.nextStepText,
        location: template.location,
        frequency: inferred.frequency,
        interval: inferred.interval,
        weekday: inferred.weekday,
        dayOfMonth: inferred.dayOfMonth,
        startDate: sorted[0].eventStart,
        untilDate: null,
        active: true,
      },
    });
    await tx.request.updateMany({
      where: { id: { in: ids } },
      data: { seriesId: created.id },
    });
    return created;
  });

  const generated = await buildOccurrences(series.id, DEFAULT_HORIZON_DAYS, user);
  const shape: SeriesLike = {
    ...inferred,
    startDate: sorted[0].eventStart,
    untilDate: null,
  };
  const cadence = cadenceSummary(shape);
  await logRequestActivity(
    {
      requestId: template.id,
      action: "recurring_series_created_from_events",
      summary: `Turned ${rows.length} existing events into recurring series: ${series.title}`,
      metadata: {
        seriesId: series.id,
        cadence,
        linkedRequestIds: ids,
        generated,
      },
    },
    user,
  );
  revalidateAll();
  return {
    ok: true,
    seriesId: series.id,
    title: series.title,
    cadence,
    linked: rows.length,
    generated,
  };
}

/**
 * Create a series from the form, then immediately generate its first batch of
 * occurrences. Validates title + startDate + frequency; tier is derived from
 * whoIsItFor unless sent explicitly. Redirects back to /recurring.
 */
export async function createSeries(fd: FormData): Promise<void> {
  const user = await requireEditor();

  const title = optStr(fd, "title");
  const startDate = parseDateInput(String(fd.get("startDate") ?? ""));
  const frequency = String(fd.get("frequency") || "");
  if (!title || !startDate || !["daily", "weekly", "monthly"].includes(frequency)) return;

  const whoIsItFor = String(fd.get("whoIsItFor") || "whole_church");
  const tierRaw = optStr(fd, "tier");
  const tier = tierRaw != null ? Number(tierRaw) : (tierFor[whoIsItFor] ?? 2);
  const interval = optInt(fd, "interval", 1, 52) ?? 1;
  const untilDate = parseDateInput(String(fd.get("untilDate") ?? ""));

  const created = await db.recurringSeries.create({
    data: {
      title,
      description: optStr(fd, "description") ?? null,
      ministryId: optStr(fd, "ministryId") ?? null,
      tier,
      whoIsItFor,
      nextStepText: optStr(fd, "nextStepText") ?? null,
      location: optStr(fd, "location") ?? null,
      frequency,
      interval,
      weekday: frequency === "weekly" ? optInt(fd, "weekday", 0, 6) : null,
      dayOfMonth: frequency === "monthly" ? optInt(fd, "dayOfMonth", 1, 31) : null,
      startDate,
      untilDate,
      active: true,
    },
  });

  await buildOccurrences(created.id, DEFAULT_HORIZON_DAYS, user);
  revalidateAll();
  redirect("/recurring");
}

/**
 * Edit a series' template fields and active toggle. Does NOT retro-edit already
 * generated occurrences (they're independent Request rows by then) — it only
 * shapes future generation. Toggling inactive simply stops new occurrences.
 */
export async function updateSeries(id: string, fd: FormData): Promise<void> {
  await requireEditor();

  const seriesRow = await db.recurringSeries.findUnique({ where: { id } });
  if (!seriesRow) throw new Error("Series not found");

  const title = optStr(fd, "title");
  const startDate = parseDateInput(String(fd.get("startDate") ?? ""));
  const frequency = String(fd.get("frequency") || seriesRow.frequency);
  if (!title || !startDate || !["daily", "weekly", "monthly"].includes(frequency)) return;

  const whoIsItFor = String(fd.get("whoIsItFor") || "whole_church");
  const tierRaw = optStr(fd, "tier");
  const tier = tierRaw != null ? Number(tierRaw) : (tierFor[whoIsItFor] ?? 2);

  await db.recurringSeries.update({
    where: { id },
    data: {
      title,
      description: optStr(fd, "description") ?? null,
      ministryId: optStr(fd, "ministryId") ?? null,
      tier,
      whoIsItFor,
      nextStepText: optStr(fd, "nextStepText") ?? null,
      location: optStr(fd, "location") ?? null,
      frequency,
      interval: optInt(fd, "interval", 1, 52) ?? 1,
      weekday: frequency === "weekly" ? optInt(fd, "weekday", 0, 6) : null,
      dayOfMonth: frequency === "monthly" ? optInt(fd, "dayOfMonth", 1, 31) : null,
      startDate,
      untilDate: parseDateInput(String(fd.get("untilDate") ?? "")),
      active: fd.get("active") != null,
    },
  });

  revalidateAll();
  redirect("/recurring");
}

/** Activate / deactivate a series (editor). Deactivating stops new occurrences. */
export async function setSeriesActive(id: string, active: boolean): Promise<void> {
  await requireEditor();
  await db.recurringSeries.update({ where: { id }, data: { active } });
  revalidateAll();
}

/**
 * "Mark filled / End now" (editor). For an open-ended standing need (e.g. "Kids
 * volunteer needed") that ran until someone said yes — and for any series you
 * want to stop today. It:
 *  - sets the series inactive AND pins untilDate = today, so neither the cron
 *    nor a manual "Generate now" will ever spawn another occurrence, and
 *  - deletes the FUTURE, NOT-YET-PUBLISHED occurrence Requests (eventStart in the
 *    future, status !== "published"). Deleting cascades their deliverables/touches
 *    so they vanish from This Week / Calendar / Outputs immediately.
 *
 * Past occurrences AND anything already published are KEPT as history. Returns
 * the number of future occurrences removed.
 */
export async function endSeries(id: string): Promise<number> {
  await requireEditor();
  const seriesRow = await db.recurringSeries.findUnique({ where: { id } });
  if (!seriesRow) throw new Error("Series not found");

  const today = atMidnight(new Date());

  // Stop all future generation: inactive + untilDate clamped to today.
  await db.recurringSeries.update({
    where: { id },
    data: { active: false, untilDate: today },
  });

  // Remove future, unpublished occurrences. Delete (not cancel) for cleanliness;
  // the Request → Deliverable/Touch cascades take their scheduled work with them.
  const removed = await db.request.deleteMany({
    where: {
      seriesId: id,
      eventStart: { gte: today },
      status: { not: "published" },
    },
  });

  revalidateAll();
  return removed.count;
}

/** Editor-facing "Generate now" — extend a single series to the default horizon. */
export async function regenerate(seriesId: string): Promise<number> {
  // generateOccurrences guards with requireEditor() itself.
  return generateOccurrences(seriesId);
}

/**
 * Delete a series (admin). The occurrences it already spawned KEEP existing as
 * normal events — the FK is ON DELETE SET NULL, so their seriesId is cleared
 * rather than cascading the events away.
 */
export async function deleteSeries(id: string): Promise<void> {
  await requireAdmin();
  await db.recurringSeries.delete({ where: { id } });
  revalidateAll();
  redirect("/recurring");
}

/**
 * Generate occurrences for every active series. Safe/idempotent — reuses the
 * per-series generator (which skips dates that already exist). Returned counts
 * let the caller (e.g. the cron route) log how much was created. Auth is the
 * caller's responsibility (the cron route guards itself with CRON_SECRET).
 */
export async function generateAllSeries(): Promise<{ series: number; created: number }> {
  const active = await db.recurringSeries.findMany({ where: { active: true }, select: { id: true } });
  let created = 0;
  for (const s of active) {
    created += await buildOccurrences(s.id, DEFAULT_HORIZON_DAYS, null);
  }
  return { series: active.length, created };
}
