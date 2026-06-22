import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { atMidnight, addDays } from "@/lib/engine/dates";
import {
  fetchExternalCalendarEvents,
  buildExternalEventPreview,
  type ExistingCalendarEvent,
} from "@/lib/external-calendar";
import { googleCalendarConfigured } from "@/lib/google-intake";
import { GoogleImportList, type GoogleImportRow } from "@/components/google-import-list";

export const dynamic = "force-dynamic";

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

function SetupCard() {
  return (
    <div className="card-float p-6 bg-sky-bg/40">
      <div className="text-lg font-bold mb-2">Google Calendar isn&apos;t connected yet</div>
      <p className="text-sm text-muted mb-4">
        Once it&apos;s connected, events on your church Google Calendar appear here automatically as
        tentative entries — each with a short checklist to turn it into a real, planned event. Connecting
        is a <b>one-time technical setup</b> — send this page to whoever installed the app if you&apos;re unsure.
      </p>
      <details className="rounded-2xl border bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-ink select-none">
          Setup details for your tech helper
        </summary>
        <p className="text-muted mt-3">
          In Google Calendar → <i>Settings → Settings for my calendars → Integrate calendar</i>, copy the{" "}
          <b>Secret address in iCal format</b> (or the public iCal URL), then set it on the server&apos;s{" "}
          <code className="font-mono">.env</code> and restart:
        </p>
        <div className="mt-2 rounded-xl border bg-sky-bg/50 px-4 py-3 font-mono text-ink">
          <div>GOOGLE_CALENDAR_URL=&quot;https://calendar.google.com/.../basic.ics&quot;</div>
        </div>
        <p className="text-muted mt-2 text-xs">
          The feed is read-only and refreshes on Google&apos;s schedule (can lag an hour or two) — fine for
          planning ahead. The scheduled sync then pulls new events in on its own.
        </p>
      </details>
    </div>
  );
}

export default async function GoogleImportPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!isAdmin(me.roles)) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-extrabold mb-2">Import from Google Calendar</h1>
        <div className="card-float border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Admin access is required to import calendar events.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-1">Import from Google Calendar 📅</h1>
      <p className="text-muted mb-5">
        Bring events from your church Google Calendar in as tentative entries. New events also pull in
        automatically on the scheduled sync — this page is for reviewing or pulling them in now.
      </p>
      {!googleCalendarConfigured() ? <SetupCard /> : <Preview />}
    </div>
  );
}

async function Preview() {
  let rows: GoogleImportRow[];
  try {
    const today = atMidnight(new Date());
    const [events, existing] = await Promise.all([
      fetchExternalCalendarEvents(),
      db.request.findMany({
        where: { eventStart: { gte: addDays(today, -1) } },
        select: { id: true, title: true, eventStart: true, location: true, pcoEventId: true, externalCalendarKey: true },
      }),
    ]);
    const previews = buildExternalEventPreview(events, existing as ExistingCalendarEvent[]);
    rows = previews
      .filter((p) => !p.event.operationalNoise)
      .map((p) => ({
        key: p.event.key,
        title: p.event.title,
        dateLabel: fmt(p.event.startsAt),
        status: p.status,
        location: p.event.location,
      }));
  } catch (err) {
    return (
      <div className="card-float border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Couldn&apos;t reach Google Calendar: {err instanceof Error ? err.message : "unknown error"}. Double-check
        the calendar URL with your tech helper.
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="card-float p-5 text-muted text-sm">No upcoming events on the Google Calendar.</div>;
  }
  return <GoogleImportList rows={rows} />;
}
