import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { activeExternalCalendarConfig } from "@/lib/calendar-settings";
import { GOOGLE_ICAL_SOURCE } from "@/lib/google-intake";
import { atMidnight } from "@/lib/engine/dates";
import { ExternalCalendarUrlForm } from "@/components/external-calendar-url-form";
import { GoogleImportList, type GoogleImportRow } from "@/components/google-import-list";
import { GoogleCalendarCheckButton } from "@/components/google-calendar-check-button";

export const dynamic = "force-dynamic";

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function includePastFromParams(params: SearchParams): boolean {
  return firstParam(params.past) === "1";
}

function CalendarFeedCard({
  currentUrl,
  configured,
}: {
  currentUrl: string | null;
  configured: boolean;
}) {
  return (
    <div className="card-float p-6 bg-sky-bg/40">
      <div className="text-lg font-bold mb-2">
        {configured ? "Calendar feed connected" : "Connect a calendar feed"}
      </div>
      <p className="text-sm text-muted mb-4">
        Paste the calendar&apos;s iCal URL here. Events appear as tentative entries — each with a short
        checklist to turn it into a real, planned event.
      </p>
      <ExternalCalendarUrlForm
        currentUrl={currentUrl}
        buttonLabel={configured ? "Update URL" : "Connect calendar"}
        className="mb-4"
      />
      <details className="rounded-2xl border bg-white px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-ink select-none">
          Setup details for your tech helper
        </summary>
        <p className="text-muted mt-3">
          In Google Calendar → <i>Settings → Settings for my calendars → Integrate calendar</i>, copy the{" "}
          <b>Secret address in iCal format</b> or a public iCal URL.
        </p>
        <p className="text-muted mt-2 text-xs">
          The feed is read-only and refreshes on Google&apos;s schedule. Existing server <code>GOOGLE_*</code>{" "}
          environment variables still work as a fallback.
        </p>
      </details>
    </div>
  );
}

export default async function GoogleImportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
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

  const calendar = await activeExternalCalendarConfig();
  const includePast = includePastFromParams(await searchParams);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-1">Import from Google Calendar 📅</h1>
      <p className="text-muted mb-5">
        Review events found on your church Google Calendar. The daily check and
        Check calendar now button fill this inbox; you still choose what to accept
        or ignore.
      </p>
      {!calendar.feedUrl ? (
        <CalendarFeedCard currentUrl={calendar.sourceUrl} configured={false} />
      ) : (
        <>
          <div className="mb-5">
            <CalendarFeedCard currentUrl={calendar.sourceUrl} configured />
          </div>
          <Preview includePast={includePast} />
        </>
      )}
    </div>
  );
}

async function Preview({ includePast }: { includePast: boolean }) {
  const today = atMidnight(new Date());
  const [candidates, hiddenPastCount] = await Promise.all([
    db.calendarImportCandidate.findMany({
      where: {
        status: "pending",
        source: GOOGLE_ICAL_SOURCE,
        ...(includePast ? {} : { startsAt: { gte: today } }),
      },
      orderBy: [{ startsAt: "asc" }, { title: "asc" }],
    }),
    db.calendarImportCandidate.count({
      where: { status: "pending", source: GOOGLE_ICAL_SOURCE, startsAt: { lt: today } },
    }),
  ]);
  const rows: GoogleImportRow[] = candidates.map((candidate) => ({
    key: candidate.key,
    title: candidate.title,
    dateLabel: fmt(candidate.startsAt),
    status:
      candidate.matchConfidence === "exact"
        ? "already_in_system"
        : candidate.matchRequestId
          ? "possible_match"
          : "missing",
    location: candidate.location,
    recommendation: candidate.recommendation as GoogleImportRow["recommendation"],
    recommendationReason: candidate.recommendationReason,
    match: candidate.matchRequestId
      ? {
          requestId: candidate.matchRequestId,
          title: candidate.matchTitle ?? "Existing event",
          dateLabel: candidate.matchDate ? fmt(candidate.matchDate) : "Date not set",
          reason: candidate.matchReason ?? "Similar title or date",
          confidence: candidate.matchConfidence as NonNullable<GoogleImportRow["match"]>["confidence"],
          score: candidate.matchScore ?? null,
        }
      : null,
  }));

  if (rows.length === 0) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <GoogleCalendarCheckButton />
          <PastToggle includePast={includePast} hiddenPastCount={hiddenPastCount} />
        </div>
        <div className="card-float p-5 text-muted text-sm">
          {includePast
            ? "No calendar events are waiting for review. Use Check calendar now to pull the latest feed into this inbox."
            : hiddenPastCount > 0
              ? "No upcoming calendar events are waiting for review. Past events are hidden by default."
              : "No upcoming calendar events are waiting for review. Use Check calendar now to pull the latest feed into this inbox."}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GoogleCalendarCheckButton />
        <PastToggle includePast={includePast} hiddenPastCount={hiddenPastCount} />
      </div>
      <GoogleImportList rows={rows} />
    </div>
  );
}

function PastToggle({
  includePast,
  hiddenPastCount,
}: {
  includePast: boolean;
  hiddenPastCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link
        href={includePast ? "/import/google" : "/import/google?past=1"}
        className="font-semibold text-sky-700 hover:underline"
      >
        {includePast ? "Hide past events" : "Show past events"}
      </Link>
      {!includePast && hiddenPastCount > 0 && (
        <span className="text-xs text-muted">
          {hiddenPastCount} past {hiddenPastCount === 1 ? "event is" : "events are"} hidden
        </span>
      )}
    </div>
  );
}
