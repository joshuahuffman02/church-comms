import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { activeExternalCalendarConfig } from "@/lib/calendar-settings";
import { GOOGLE_ICAL_SOURCE } from "@/lib/google-intake";
import { ExternalCalendarUrlForm } from "@/components/external-calendar-url-form";
import { GoogleImportList, type GoogleImportRow } from "@/components/google-import-list";
import { GoogleCalendarCheckButton } from "@/components/google-calendar-check-button";

export const dynamic = "force-dynamic";

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

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

  const calendar = await activeExternalCalendarConfig();

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
          <Preview />
        </>
      )}
    </div>
  );
}

async function Preview() {
  const candidates = await db.calendarImportCandidate.findMany({
    where: { status: "pending", source: GOOGLE_ICAL_SOURCE },
    orderBy: [{ startsAt: "asc" }, { title: "asc" }],
  });
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
        <div className="mb-4">
          <GoogleCalendarCheckButton />
        </div>
        <div className="card-float p-5 text-muted text-sm">
          No calendar events are waiting for review. Use Check calendar now to pull the latest feed into this inbox.
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-4">
        <GoogleCalendarCheckButton />
      </div>
      <GoogleImportList rows={rows} />
    </div>
  );
}
