import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { pcoConfigured, fetchUpcomingPcoEvents } from "@/lib/pco";
import { activeExternalCalendarConfig } from "@/lib/calendar-settings";
import { GOOGLE_ICAL_SOURCE } from "@/lib/google-intake";
import { atMidnight } from "@/lib/engine/dates";
import { buildImportPatterns, describePcoChanges } from "@/lib/import-review";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { GoogleCalendarCheckButton } from "@/components/google-calendar-check-button";
import { PcoSyncButton } from "@/components/pco-sync-button";
import { GoogleReviewList, type GoogleReviewRow } from "@/components/imports/google-review-list";
import { PcoReviewList, type PcoReviewRow } from "@/components/imports/pco-review-list";
import { IcalUploadImporter } from "@/components/imports/ical-upload-importer";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
type ImportSource = "google" | "planning-center" | "ical";
type GoogleDecision = "all" | "review" | "accept" | "ignore" | "duplicates";

const PAGE_SIZE = 30;

function param(params: SearchParams, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validSource(value: string): ImportSource {
  return value === "planning-center" || value === "ical" ? value : "google";
}

function validDecision(value: string): GoogleDecision {
  return value === "review" || value === "accept" || value === "ignore" || value === "duplicates" ? value : "all";
}

const formatDate = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

const formatTime = (date: Date | null) =>
  date ? date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not checked yet";

export default async function ImportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!isAdmin(me.roles)) return <AdminOnlyCard area="imports" />;

  const params = await searchParams;
  const source = validSource(param(params, "source"));
  const today = atMidnight(new Date());
  const calendar = await activeExternalCalendarConfig();
  const pcoConnected = pcoConfigured();

  const [googleCounts, latestGoogle, latestPco, importedPcoCount] = await Promise.all([
    loadGoogleCounts(today),
    db.calendarImportCandidate.findFirst({
      where: { source: GOOGLE_ICAL_SOURCE },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    db.request.findFirst({
      where: { pcoEventId: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    db.request.count({ where: { pcoEventId: { not: null } } }),
  ]);

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">One review inbox</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">Imports</h1>
          <p className="mt-1 max-w-3xl text-muted">
            Bring event details in without retyping them. Connections run in the background; this page only asks you to review items that need a decision.
          </p>
        </div>
        <Link href="/settings/connections" className="rounded-full border bg-white px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg">
          Manage connections
        </Link>
      </div>

      <section aria-labelledby="import-sources-title">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="import-sources-title" className="text-sm font-extrabold uppercase tracking-wide text-muted">Sources</h2>
          <span className="text-xs text-muted">Choose a source to review</span>
        </div>
        <div className="mb-7 grid gap-3 md:grid-cols-3">
          <SourceCard
            href="/imports?source=google"
            active={source === "google"}
            icon="📆"
            title="Google Calendar"
            connected={!!calendar.feedUrl}
            metric={calendar.feedUrl ? `${googleCounts.all} waiting` : "Setup needed"}
            detail={calendar.feedUrl ? `Last checked ${formatTime(latestGoogle?.updatedAt ?? null)}` : "Connect a read-only calendar feed"}
          />
          <SourceCard
            href="/imports?source=planning-center"
            active={source === "planning-center"}
            icon="🗓️"
            title="Planning Center"
            connected={pcoConnected}
            metric={pcoConnected ? `${importedPcoCount} linked` : "Setup needed"}
            detail={pcoConnected ? `Latest linked update ${formatTime(latestPco?.updatedAt ?? null)}` : "Add API credentials in Connections"}
          />
          <SourceCard
            href="/imports?source=ical"
            active={source === "ical"}
            icon="📥"
            title="Calendar file"
            connected
            metric="Upload anytime"
            detail="One-off .ics file · nothing stored"
          />
        </div>
      </section>

      <section aria-labelledby="review-inbox-title">
        <div className="mb-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-violet-700">Actionable only</p>
          <h2 id="review-inbox-title" className="mt-1 text-2xl font-extrabold text-ink">Review inbox</h2>
        </div>
        {source === "google" && <GoogleInbox params={params} today={today} configured={!!calendar.feedUrl} counts={googleCounts} />}
        {source === "planning-center" && <PlanningCenterInbox connected={pcoConnected} />}
        {source === "ical" && <IcalInbox />}
      </section>
    </div>
  );
}

function SourceCard({ href, active, icon, title, connected, metric, detail }: { href: string; active: boolean; icon: string; title: string; connected: boolean; metric: string; detail: string }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`card-float group border p-4 transition ${active ? "border-sky-300 bg-sky-bg/60 ring-2 ring-sky-100" : "border-transparent hover:border-sky-200"}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-xl shadow-sm">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-extrabold text-ink">{title}</h3>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-400"}`} aria-label={connected ? "Available" : "Setup needed"} />
          </div>
          <div className="mt-1 text-sm font-bold text-sky-800">{metric}</div>
          <p className="mt-0.5 text-xs text-muted">{detail}</p>
        </div>
        <span className="text-muted group-hover:text-sky-700" aria-hidden>→</span>
      </div>
    </Link>
  );
}

type GoogleCounts = { all: number; review: number; accept: number; ignore: number; duplicates: number; past: number };

async function loadGoogleCounts(today: Date): Promise<GoogleCounts> {
  const base = { source: GOOGLE_ICAL_SOURCE, status: "pending" } as const;
  const [all, review, accept, ignore, duplicates, past] = await Promise.all([
    db.calendarImportCandidate.count({ where: { ...base, startsAt: { gte: today } } }),
    db.calendarImportCandidate.count({ where: { ...base, startsAt: { gte: today }, recommendation: "review" } }),
    db.calendarImportCandidate.count({ where: { ...base, startsAt: { gte: today }, recommendation: "accept" } }),
    db.calendarImportCandidate.count({ where: { ...base, startsAt: { gte: today }, recommendation: "ignore" } }),
    db.calendarImportCandidate.count({ where: { ...base, startsAt: { gte: today }, matchRequestId: { not: null } } }),
    db.calendarImportCandidate.count({ where: { ...base, startsAt: { lt: today } } }),
  ]);
  return { all, review, accept, ignore, duplicates, past };
}

async function GoogleInbox({ params, today, configured, counts }: { params: SearchParams; today: Date; configured: boolean; counts: GoogleCounts }) {
  if (!configured) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
        <h3 className="font-extrabold text-amber-900">Connect Google Calendar first</h3>
        <p className="mt-1 text-sm text-amber-800">The feed address belongs in Connections, where it stays masked. Review happens here after setup.</p>
        <Link href="/settings/connections" className="mt-4 inline-flex rounded-full bg-amber-900 px-4 py-2 text-sm font-semibold text-white">Open Connections</Link>
      </div>
    );
  }

  const decision = validDecision(param(params, "decision"));
  const query = param(params, "q").trim().slice(0, 100);
  const includePast = param(params, "past") === "1";
  const requestedPattern = param(params, "pattern").trim();

  const patternRows = await db.calendarImportCandidate.findMany({
    where: { source: GOOGLE_ICAL_SOURCE, status: "pending", ...(includePast ? {} : { startsAt: { gte: today } }) },
    select: { key: true, title: true, recommendation: true },
  });
  const patterns = buildImportPatterns(
    patternRows.map((row) => ({ key: row.key, title: row.title, recommendation: row.recommendation as "accept" | "ignore" | "review" })),
  );
  const activePattern = patterns.find((pattern) => pattern.id === requestedPattern) ?? null;

  const where: Prisma.CalendarImportCandidateWhereInput = {
    source: GOOGLE_ICAL_SOURCE,
    status: "pending",
    ...(includePast ? {} : { startsAt: { gte: today } }),
    ...(decision === "duplicates"
      ? { matchRequestId: { not: null } }
      : decision === "all"
        ? {}
        : { recommendation: decision }),
    ...(query ? { OR: [{ title: { contains: query } }, { location: { contains: query } }] } : {}),
    ...(activePattern ? { key: { in: activePattern.keys } } : {}),
  };

  const total = await db.calendarImportCandidate.count({ where });
  const requestedPage = Math.max(1, Number.parseInt(param(params, "page") || "1", 10) || 1);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const candidates = await db.calendarImportCandidate.findMany({
    where,
    orderBy: [{ matchRequestId: "desc" }, { startsAt: "asc" }, { title: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  const rows: GoogleReviewRow[] = candidates.map((candidate) => ({
    key: candidate.key,
    title: candidate.title,
    dateLabel: formatDate(candidate.startsAt),
    location: candidate.location,
    recommendation: candidate.recommendation as GoogleReviewRow["recommendation"],
    recommendationReason: candidate.recommendationReason,
    operationalNoise: candidate.operationalNoise,
    match: candidate.matchRequestId
      ? {
          requestId: candidate.matchRequestId,
          title: candidate.matchTitle ?? "Existing event",
          dateLabel: candidate.matchDate ? formatDate(candidate.matchDate) : "Date not set",
          reason: candidate.matchReason ?? "Similar title or date",
          confidence: candidate.matchConfidence,
        }
      : null,
  }));

  const href = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams();
    next.set("source", "google");
    if (decision !== "all") next.set("decision", decision);
    if (query) next.set("q", query);
    if (includePast) next.set("past", "1");
    if (activePattern) next.set("pattern", activePattern.id);
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "" || (key === "decision" && value === "all")) next.delete(key);
      else next.set(key, value);
    }
    return `/imports?${next.toString()}`;
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sky-100 bg-sky-bg/40 p-4">
        <div>
          <h3 className="font-extrabold text-ink">Google Calendar review</h3>
          <p className="text-sm text-muted">Checking the feed never creates events. Import or skip each item here.</p>
        </div>
        <GoogleCalendarCheckButton />
      </div>

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Google import filters">
        <DecisionLink href={href({ decision: "all", page: null })} active={decision === "all"} label="All waiting" count={counts.all} />
        <DecisionLink href={href({ decision: "review", page: null })} active={decision === "review"} label="Needs decision" count={counts.review} />
        <DecisionLink href={href({ decision: "accept", page: null })} active={decision === "accept"} label="Likely import" count={counts.accept} />
        <DecisionLink href={href({ decision: "ignore", page: null })} active={decision === "ignore"} label="Likely skip" count={counts.ignore} />
        <DecisionLink href={href({ decision: "duplicates", page: null })} active={decision === "duplicates"} label="Possible duplicates" count={counts.duplicates} />
      </div>

      <form action="/imports" method="get" className="card-float mb-4 flex flex-wrap items-center gap-2 p-3">
        <input type="hidden" name="source" value="google" />
        {decision !== "all" && <input type="hidden" name="decision" value={decision} />}
        {includePast && <input type="hidden" name="past" value="1" />}
        {activePattern && <input type="hidden" name="pattern" value={activePattern.id} />}
        <label className="min-w-52 flex-1">
          <span className="sr-only">Search Google Calendar imports</span>
          <input type="search" name="q" defaultValue={query} placeholder="Search title or location" className="w-full rounded-full border px-4 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg">Search</button>
        {(query || activePattern) && <Link href={href({ q: null, pattern: null, page: null })} className="rounded-full px-3 py-2 text-sm font-semibold text-muted hover:text-ink">Clear</Link>}
        <Link href={href({ past: includePast ? null : "1", page: null })} className="rounded-full px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg">
          {includePast ? "Hide past" : `Show past (${counts.past})`}
        </Link>
      </form>

      {patterns.length > 0 && (
        <details className="card-float mb-4 p-4" open={!!activePattern}>
          <summary className="cursor-pointer font-bold text-ink">Recurring patterns <span className="ml-1 text-sm font-medium text-muted">({patterns.length})</span></summary>
          <p className="mt-1 text-xs text-muted">Repeated titles are grouped for clarity. Opening a pattern filters the inbox; it never imports the whole series automatically.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {patterns.slice(0, 12).map((pattern) => (
              <Link key={pattern.id} href={href({ pattern: activePattern?.id === pattern.id ? null : pattern.id, page: null })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${activePattern?.id === pattern.id ? "border-sky-300 bg-sky-bg text-sky-800" : "text-muted hover:bg-sky-bg"}`}>
                {pattern.title} · {pattern.count}
              </Link>
            ))}
          </div>
        </details>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>{total === 0 ? "No items" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}</span>
        {activePattern && <span>Pattern: <b className="text-ink">{activePattern.title}</b></span>}
      </div>
      <GoogleReviewList rows={rows} />
      {pageCount > 1 && (
        <nav aria-label="Import review pages" className="mt-4 flex items-center justify-center gap-2">
          <Link aria-disabled={page === 1} href={page === 1 ? href({ page: "1" }) : href({ page: String(page - 1) })} className={`rounded-full border px-4 py-2 text-sm font-semibold ${page === 1 ? "pointer-events-none opacity-40" : "hover:bg-sky-bg"}`}>Previous</Link>
          <span className="px-2 text-sm font-semibold text-muted">Page {page} of {pageCount}</span>
          <Link aria-disabled={page === pageCount} href={page === pageCount ? href({ page: String(pageCount) }) : href({ page: String(page + 1) })} className={`rounded-full border px-4 py-2 text-sm font-semibold ${page === pageCount ? "pointer-events-none opacity-40" : "hover:bg-sky-bg"}`}>Next</Link>
        </nav>
      )}
    </div>
  );
}

function DecisionLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${active ? "border-ink bg-ink text-white" : "bg-white text-muted hover:bg-sky-bg"}`}>{label} <span className={active ? "text-white/75" : "text-muted"}>{count}</span></Link>;
}

async function PlanningCenterInbox({ connected }: { connected: boolean }) {
  if (!connected) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
        <h3 className="font-extrabold text-amber-900">Connect Planning Center first</h3>
        <p className="mt-1 text-sm text-amber-800">Credentials belong in Connections. Once connected, approved events sync automatically and only new or changed items appear here.</p>
        <Link href="/settings/connections" className="mt-4 inline-flex rounded-full bg-amber-900 px-4 py-2 text-sm font-semibold text-white">Open Connections</Link>
      </div>
    );
  }

  let events: PcoReviewRow[] = [];
  let hiddenImported = 0;
  let pendingApproval = 0;
  let error: string | null = null;
  try {
    const upcoming = await fetchUpcomingPcoEvents();
    const approved = upcoming.filter((event) => event.approvalStatus === "A");
    pendingApproval = upcoming.length - approved.length;
    const existingRows = approved.length
      ? await db.request.findMany({
          where: { pcoEventId: { in: approved.map((event) => event.pcoEventId) } },
          select: {
            pcoEventId: true,
            title: true,
            eventStart: true,
            eventEnd: true,
            location: true,
            registrationUrl: true,
            pcoApprovalStatus: true,
          },
        })
      : [];
    const existing = new Map(existingRows.map((row) => [row.pcoEventId, row]));
    events = approved.flatMap((event) => {
      const linked = existing.get(event.pcoEventId);
      const changes = linked ? describePcoChanges(event, linked) : [];
      if (linked && changes.length === 0) return [];
      return [{
        pcoEventId: event.pcoEventId,
        name: event.name,
        startsAtMs: event.startsAt.getTime(),
        location: event.location,
        needsRegistration: !!event.registrationUrl,
        state: linked ? "changed" as const : "new" as const,
        changes,
      }];
    });
    hiddenImported = approved.length - events.length;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Could not reach Planning Center.";
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-violet-100 bg-violet-50/60 p-4">
        <div>
          <h3 className="font-extrabold text-ink">Planning Center review</h3>
          <p className="text-sm text-muted">Approved events sync automatically. This inbox hides {hiddenImported} up-to-date {hiddenImported === 1 ? "event" : "events"}{pendingApproval ? ` and notes ${pendingApproval} awaiting PCO approval` : ""}.</p>
        </div>
        <div>
          <PcoSyncButton />
          <p className="mt-1 text-right text-[11px] text-muted">Backup check—normally no manual sync is needed</p>
        </div>
      </div>
      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><b>Planning Center could not be checked.</b><br />{error}</div>
      ) : <PcoReviewList events={events} />}
    </div>
  );
}

function IcalInbox() {
  return (
    <div>
      <div className="mb-4 rounded-3xl border border-violet-100 bg-violet-50/60 p-4">
        <h3 className="font-extrabold text-ink">One-off calendar file</h3>
        <p className="text-sm text-muted">Use this for an export you do not want connected long-term. Preview first, compare possible duplicates, then import only your selection.</p>
      </div>
      <IcalUploadImporter />
    </div>
  );
}
