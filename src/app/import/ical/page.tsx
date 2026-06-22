import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { addDays, atMidnight } from "@/lib/engine/dates";
import {
  LOCAL_ICAL_SOURCE,
  buildExternalEventPreview,
  configuredLocalIcalPath,
  loadLocalIcalEvents,
} from "@/lib/external-calendar";
import { IcalImportCalendar, type IcalImportRow } from "@/components/ical-import-calendar";

export const dynamic = "force-dynamic";

export default async function IcalImportPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!isAdmin(me.roles)) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-extrabold mb-2">iCal import preview</h1>
        <div className="card-float border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Admin access is required to import calendar events.
        </div>
      </div>
    );
  }

  const filePath = configuredLocalIcalPath();
  const today = atMidnight(new Date());
  const horizon = addDays(today, 180);
  const data = await loadIcalImportData(filePath, today, horizon);

  if (data.ok) {
    return (
      <IcalImportCalendar
        rows={data.rows}
        filePath={data.filePath}
        windowStartMs={today.getTime()}
        windowEndMs={horizon.getTime()}
        ignoredCount={data.ignoredCount}
      />
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-2">Import from a calendar (.ics)</h1>
      <div className="card-float border border-amber-200 bg-amber-50 p-5">
        <div className="font-bold text-amber-800 mb-1">No calendar file connected yet</div>
        <p className="text-sm text-amber-800 mb-3">
          This is a one-time technical setup — send this page to whoever installed the app if you&apos;re unsure.
        </p>
        <details className="rounded-2xl border border-amber-200 bg-white/70 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-amber-900 select-none">
            Setup details for your tech helper
          </summary>
          <p className="text-muted mt-2">
            Set <code className="font-mono">ICAL_IMPORT_FILE</code> to the absolute
            path of an <code className="font-mono">.ics</code> file on this server.
          </p>
          <p className="text-muted mt-2 text-xs">{data.error}</p>
        </details>
      </div>
      <Link href="/import/planning-center" className="mt-4 inline-block text-sm font-semibold underline">
        Back to Planning Center import
      </Link>
    </div>
  );
}

async function loadIcalImportData(
  filePath: string | null,
  today: Date,
  horizon: Date,
): Promise<
  | { ok: true; filePath: string; rows: IcalImportRow[]; ignoredCount: number }
  | { ok: false; error: string }
> {
  if (!filePath) {
    return {
      ok: false,
      error: "No local iCal file is configured.",
    };
  }

  try {
    const [events, ignored, existing] = await Promise.all([
      loadLocalIcalEvents(filePath, today),
      db.externalCalendarIgnore.findMany({
        where: { source: LOCAL_ICAL_SOURCE },
        select: { key: true },
      }),
      db.request.findMany({
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
      }),
    ]);

    const ignoredKeys = new Set(ignored.map((row) => row.key));
    const visibleEvents = events.filter((event) => !ignoredKeys.has(event.key));
    const previews = buildExternalEventPreview(visibleEvents, existing, today);
    const rows: IcalImportRow[] = previews.map((preview) => ({
      key: preview.event.key,
      title: preview.event.title,
      dateKey: preview.event.dateKey,
      startsAtMs: preview.event.startsAt.getTime(),
      location: preview.event.location,
      description: preview.event.description,
      status: preview.status,
      operationalNoise: preview.event.operationalNoise,
      matches: preview.matches.map((match) => ({
        id: match.id,
        title: match.title,
        eventStartMs: match.eventStart.getTime(),
        titleScore: match.titleScore,
        dateDistanceDays: match.dateDistanceDays,
      })),
    }));

    return { ok: true, filePath, rows, ignoredCount: ignored.length };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown calendar import error.",
    };
  }
}
