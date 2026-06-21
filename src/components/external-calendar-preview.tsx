import Link from "next/link";
import type { ExternalEventPreview } from "@/lib/external-calendar";

type Props = {
  previews: ExternalEventPreview[];
  calendarUrl: string | null;
  errorMessage: string | null;
};

const statusLabel: Record<ExternalEventPreview["status"], string> = {
  missing: "Missing",
  possible_match: "Possible match",
  already_in_system: "Already in app",
};

export function ExternalCalendarPreview({
  previews,
  calendarUrl,
  errorMessage,
}: Props) {
  const missing = previews.filter((preview) => preview.status === "missing");
  const possible = previews.filter((preview) => preview.status === "possible_match");
  const already = previews.filter(
    (preview) => preview.status === "already_in_system",
  );

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-ink">External calendar preview</h2>
          <p className="text-sm text-muted">
            Read-only Google Calendar check against events already in this app.
          </p>
        </div>
        {calendarUrl && (
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg transition"
          >
            Open calendar
          </a>
        )}
      </div>

      {!calendarUrl ? (
        <div className="card-float border border-sky-200 bg-sky-bg/40 p-5">
          <div className="font-bold text-ink mb-1">External calendar not configured</div>
          <p className="text-sm text-muted">
            Set <code className="font-mono">GOOGLE_EVENTS_ICAL_URL</code> or{" "}
            <code className="font-mono">GOOGLE_EVENTS_CALENDAR_URL</code> to compare
            another calendar against events already in this app.
          </p>
        </div>
      ) : errorMessage ? (
        <div className="card-float border border-amber-200 bg-amber-50 p-5">
          <div className="font-bold text-amber-800 mb-1">
            Couldn&apos;t load the external calendar
          </div>
          <p className="text-sm text-amber-800">{errorMessage}</p>
        </div>
      ) : (
        <div className="card-float overflow-hidden">
          <div className="grid gap-2 border-b border-slate-100 px-5 py-4 sm:grid-cols-3">
            <Metric label="Missing" value={missing.length} tone="text-rose-700" />
            <Metric label="Possible matches" value={possible.length} tone="text-amber-700" />
            <Metric label="Already in app" value={already.length} tone="text-emerald-700" />
          </div>

          {missing.length === 0 && possible.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted">
              No missing external events found in the next 180 days.
            </div>
          ) : (
            <div>
              {missing.length > 0 && (
                <PreviewGroup title="Missing from app" previews={missing} />
              )}
              {possible.length > 0 && (
                <PreviewGroup title="Needs a quick look" previews={possible} />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div>
      <div className={`text-2xl font-extrabold ${tone}`}>{value}</div>
      <div className="text-xs font-bold uppercase text-muted">{label}</div>
    </div>
  );
}

function PreviewGroup({
  title,
  previews,
}: {
  title: string;
  previews: ExternalEventPreview[];
}) {
  return (
    <div className="border-t border-slate-100 first:border-t-0">
      <div className="bg-slate-50 px-5 py-2 text-xs font-bold uppercase text-muted">
        {title}
      </div>
      {previews.map((preview) => (
        <div
          key={preview.event.uid}
          className="border-t border-slate-100 px-5 py-4 first:border-t-0"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{preview.event.title}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    preview.status === "missing"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {statusLabel[preview.status]}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{formatDate(preview.event.startsAt)}</span>
                <span>{preview.event.location ?? "No location listed"}</span>
              </div>
            </div>
          </div>

          {preview.matches.length > 0 && (
            <div className="mt-3 rounded-lg bg-sky-bg/50 px-3 py-2 text-xs text-muted">
              <div className="font-bold text-ink mb-1">Possible app matches</div>
              <div className="grid gap-1">
                {preview.matches.map((match) => (
                  <div key={match.id} className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <Link
                      href={`/requests/${match.id}`}
                      className="font-semibold text-ink underline"
                    >
                      {match.title}
                    </Link>
                    <span>{formatDate(match.eventStart)}</span>
                    {match.location && <span>{match.location}</span>}
                    {match.pcoEventId && <span>PCO-linked</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
