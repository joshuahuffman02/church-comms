import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { db } from "@/lib/db";
import { pcoConfigured, fetchUpcomingPcoEvents } from "@/lib/pco";
import {
  buildExternalEventPreview,
  configuredExternalCalendarSourceUrl,
  configuredExternalCalendarUrl,
  fetchExternalCalendarEvents,
  type ExternalEventPreview,
} from "@/lib/external-calendar";
import { addDays, atMidnight } from "@/lib/engine/dates";
import { ExternalCalendarPreview } from "@/components/external-calendar-preview";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { PcoImportList, type PcoEventRow } from "@/components/pco-import-list";
import { PcoSyncButton } from "@/components/pco-sync-button";

// "A" is PCO's approved event-level status; everything else is still pending /
// rejected and is NOT importable here (Model A imports approved events only).
const PCO_APPROVED = "A";

export const dynamic = "force-dynamic";

export default async function PlanningCenterImport() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!isAdmin(me.roles)) {
    return <AdminOnlyCard area="Planning Center imports" />;
  }
  const externalPreviewPromise = loadExternalCalendarPreview();

  // Unconfigured: no-op gracefully with setup instructions.
  if (!pcoConfigured()) {
    const externalPreview = await externalPreviewPromise;
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-extrabold mb-1">Import from Planning Center 🗓️</h1>
        <p className="text-muted mb-5">
          Pull upcoming events straight from Planning Center Calendar so you don&apos;t
          have to re-enter them by hand.
        </p>
        <PcoSetupCard />
        <ExternalCalendarPreview {...externalPreview} />
      </div>
    );
  }

  // Configured: try the live API; surface any error message gracefully. We
  // fetch the FULL upcoming set once: the approved events are importable, while
  // the rest feed a read-only "pending in PCO" count so triagers see what's
  // still coming.
  let events: PcoEventRow[] = [];
  let pendingCount = 0;
  let errorMessage: string | null = null;
  try {
    const upcoming = await fetchUpcomingPcoEvents();
    const approved = upcoming.filter((e) => e.approvalStatus === PCO_APPROVED);
    pendingCount = upcoming.length - approved.length;

    const ids = approved.map((e) => e.pcoEventId);
    const existing = ids.length
      ? await db.request.findMany({
          where: { pcoEventId: { in: ids } },
          select: { pcoEventId: true },
        })
      : [];
    const importedIds = new Set(existing.map((r) => r.pcoEventId));
    events = approved.map((e) => ({
      pcoEventId: e.pcoEventId,
      name: e.name,
      startsAtMs: e.startsAt.getTime(),
      location: e.location,
      needsRegistration: !!e.registrationUrl,
      alreadyImported: importedIds.has(e.pcoEventId),
    }));
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Could not load events.";
  }

  const externalPreview = await externalPreviewPromise;

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-extrabold mb-1">Import from Planning Center 🗓️</h1>
      <p className="text-muted mb-1">
        These are the <span className="font-semibold">approved</span> Planning Center
        events. Importing one creates a request at{" "}
        <span className="font-semibold">submitted</span> as tier 2 — re-tier and plan it
        at triage. (A scheduled sync also pulls approved events in automatically.)
      </p>
      <p className="text-muted mb-4 text-sm">
        Planning Center stays the source of truth for events and rooms — this is a
        one-way pull, so you can&apos;t file PCO requests from here.
      </p>

      <div className="mb-5">
        <PcoSyncButton />
      </div>

      {errorMessage ? (
        <div className="card-float p-5 bg-rose-50 border border-rose-200">
          <div className="font-bold text-rose-700 mb-1">
            Couldn&apos;t reach Planning Center
          </div>
          <p className="text-sm text-rose-700">{errorMessage}</p>
        </div>
      ) : (
        <>
          <PcoImportList events={events} />
          {pendingCount > 0 && (
            <p className="mt-3 text-sm text-muted">
              ⏳ {pendingCount} more upcoming{" "}
              {pendingCount === 1 ? "event is" : "events are"} still pending approval in
              Planning Center — they&apos;ll appear here once approved.
            </p>
          )}
        </>
      )}

      <ExternalCalendarPreview {...externalPreview} />
    </div>
  );
}

async function loadExternalCalendarPreview(): Promise<{
  previews: ExternalEventPreview[];
  calendarUrl: string | null;
  errorMessage: string | null;
}> {
  const calendarUrl = configuredExternalCalendarUrl();
  const sourceUrl = configuredExternalCalendarSourceUrl();
  const today = atMidnight(new Date());
  const horizon = addDays(today, 180);

  if (!calendarUrl) {
    return {
      calendarUrl: sourceUrl,
      previews: [],
      errorMessage: null,
    };
  }

  try {
    const [externalEvents, existingEvents] = await Promise.all([
      fetchExternalCalendarEvents(calendarUrl),
      db.request.findMany({
        where: { eventStart: { gte: today, lte: horizon } },
        orderBy: { eventStart: "asc" },
        select: {
          id: true,
          title: true,
          eventStart: true,
          location: true,
          pcoEventId: true,
        },
      }),
    ]);

    return {
      calendarUrl: sourceUrl ?? calendarUrl,
      previews: buildExternalEventPreview(externalEvents, existingEvents, today),
      errorMessage: null,
    };
  } catch (err) {
    return {
      calendarUrl: sourceUrl ?? calendarUrl,
      previews: [],
      errorMessage: err instanceof Error ? err.message : "Could not load calendar.",
    };
  }
}

function PcoSetupCard() {
  return (
    <div className="card-float p-6 bg-sky-bg/40">
      <div className="text-lg font-bold mb-2">Planning Center isn&apos;t connected yet</div>
      <p className="text-sm text-muted mb-4">
        Once it&apos;s connected, your approved Planning Center events show up here
        automatically, ready to bring in. Connecting is a <b>one-time technical
        setup</b> — if you&apos;re not sure how, send this page to whoever installed
        the app for you.
      </p>
      <details className="rounded-2xl border bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-ink select-none">
          Setup details for your tech helper
        </summary>
        <p className="text-muted mt-3">
          Add Planning Center API credentials to the server&apos;s <code>.env</code>{" "}
          file, then restart the app:
        </p>
        <div className="mt-2 rounded-xl border bg-sky-bg/50 px-4 py-3 font-mono text-ink">
          <div># Personal Access Token (HTTP Basic)</div>
          <div>PCO_APP_ID=your-app-id</div>
          <div>PCO_SECRET=your-secret</div>
          <div className="mt-2"># ...or an OAuth bearer token</div>
          <div>PCO_TOKEN=your-token</div>
        </div>
        <p className="text-muted mt-3">
          Create credentials in the Planning Center developer console —{" "}
          <a
            href="https://developer.planning.center/docs/#/overview/authentication"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            developer.planning.center
          </a>
          . The integration reads upcoming Calendar events only.
        </p>
      </details>
    </div>
  );
}
