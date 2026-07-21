import Link from "next/link";
import { GuardrailEventActions } from "@/components/guardrail-event-actions";
import type { Guardrail } from "@/lib/guardrails";
import { prettyChannel, prettyDate } from "@/lib/labels";

const KIND_LABEL: Record<Guardrail["kind"], string> = {
  stage_cap: "Announcement and stage lineups",
  loop_cap: "Sunday Loop capacity",
  promo_density: "Busy channel weeks",
  reach_tier: "Audience and tier",
};

function severityClasses(severity: Guardrail["severity"]): string {
  if (severity === "block") return "border-rose-200 bg-rose-50/55";
  if (severity === "warn") return "border-amber-200 bg-amber-50/55";
  return "border-slate-200 bg-slate-50/65";
}

function SeverityChip({ severity }: { severity: Guardrail["severity"] }) {
  if (severity === "block") {
    return <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">Needs a decision</span>;
  }
  if (severity === "warn") {
    return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Review recommended</span>;
  }
  return <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">For awareness</span>;
}

function longDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function channelName(guardrail: Guardrail): string {
  return guardrail.channelName ?? (guardrail.channelKey ? prettyChannel(guardrail.channelKey) : "This schedule");
}

function decisionTitle(guardrail: Guardrail): string {
  const channel = channelName(guardrail);
  if (guardrail.kind === "reach_tier") return `${guardrail.requests?.[0]?.title ?? "This event"} may be classified too broadly`;
  if (guardrail.kind === "promo_density") return `${channel} has a busier-than-usual week`;
  if (guardrail.whenISO) return `${channel} needs a final lineup for ${longDate(guardrail.whenISO)}`;
  return `${channel} is over capacity`;
}

function decisionCopy(guardrail: Guardrail): string {
  if (guardrail.itemCount != null && guardrail.capacity != null) {
    const extra = Math.max(0, guardrail.itemCount - guardrail.capacity);
    return `${guardrail.itemCount} events want this lineup, but only ${guardrail.capacity} fit. Choose the ${guardrail.capacity} to keep${extra > 0 ? ` and hold ${extra}` : ""}.`;
  }
  return guardrail.message;
}

function resolution(guardrail: Guardrail): { href: string; label: string } | null {
  if (guardrail.kind === "reach_tier" && guardrail.requestIds?.[0]) {
    return { href: `/requests/${guardrail.requestIds[0]}/edit`, label: "Review audience tier" };
  }
  if (guardrail.channelKey) {
    const focused = guardrail.whenISO ? `?week=${guardrail.whenISO}#week-${guardrail.whenISO}` : "";
    return {
      href: `/outputs/${guardrail.channelKey}${focused}`,
      label: guardrail.kind === "promo_density" ? "View channel" : "Review this lineup",
    };
  }
  return null;
}

function GuardrailRow({ guardrail }: { guardrail: Guardrail }) {
  const events: NonNullable<Guardrail["requests"]> = guardrail.requests
    ?? (guardrail.requestIds ?? []).map((id) => ({ id, title: "View event", touchId: undefined }));
  const pickedIds = new Set(guardrail.pickedRequestIds ?? []);
  const action = resolution(guardrail);
  return (
    <article className={`card-float overflow-hidden border ${severityClasses(guardrail.severity)}`}>
      <div className="border-b border-slate-200/70 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={guardrail.severity} />
          {guardrail.channelKey && (
            <span className="rounded-full bg-white/75 px-2.5 py-1 text-xs font-bold text-muted">
              {channelName(guardrail)}
            </span>
          )}
          {guardrail.whenISO && <span className="text-xs font-semibold text-muted">{prettyDate(guardrail.whenISO)}</span>}
          {guardrail.capacity != null && (
            <span className="ml-auto rounded-full bg-white/75 px-2.5 py-1 text-xs font-bold text-ink">
              {guardrail.pickedCount ?? 0}/{guardrail.capacity} featured
            </span>
          )}
        </div>
        <h3 className="mt-3 text-lg font-extrabold leading-snug text-ink">{decisionTitle(guardrail)}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{decisionCopy(guardrail)}</p>
      </div>

      <div className="p-4 sm:p-5">
        {events.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">Events in this check</p>
            {guardrail.kind === "stage_cap" && guardrail.channelKey === "announcement_video" && (
              <p className="mb-3 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-xs leading-relaxed text-slate-700">
                Use the <strong className="text-violet-900">violet star</strong> to feature and protect an event. Leave it eligible for automatic fill, or use the <strong className="text-rose-800">red remove button</strong> if it should not appear that Sunday.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {events.map((event) => {
                const picked = pickedIds.has(event.id);
                const isAnnouncementVideo = guardrail.channelKey === "announcement_video";
                const status = isAnnouncementVideo ? (picked ? "Featured" : "Eligible for auto-fill") : "Scheduled";
                return (
                  <div key={event.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white/80">
                    <Link
                      href={`/requests/${event.id}`}
                      className="block min-h-16 px-3 py-3 pr-20 text-sm font-semibold text-ink transition hover:bg-white"
                    >
                      <span className="block min-w-0 leading-snug">{event.title}</span>
                      <span className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${picked ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}>
                        {status}
                      </span>
                    </Link>
                    {guardrail.whenISO && event.touchId && (guardrail.kind === "stage_cap" || guardrail.kind === "loop_cap") && (
                      <GuardrailEventActions
                        requestId={event.id}
                        title={event.title}
                        channelName={channelName(guardrail)}
                        whenISO={guardrail.whenISO}
                        touchId={event.touchId}
                        featured={picked}
                        canFeature={guardrail.kind === "stage_cap" && isAnnouncementVideo}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {action && (
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-muted">
              Make the decision on the shared channel lineup so This Week, Sunday Checklist, and exports all stay in sync.
            </p>
            <Link
              href={action.href}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-sky-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-sky-800"
            >
              {action.label}
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

export function GuardrailList({ guardrails, grouped = false }: { guardrails: Guardrail[]; grouped?: boolean }) {
  if (guardrails.length === 0) {
    return <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-sm font-semibold text-emerald-800">No decisions are waiting here.</div>;
  }
  if (!grouped) {
    return <div className="grid gap-3">{guardrails.map((guardrail, index) => <GuardrailRow key={`${guardrail.kind}:${guardrail.whenISO ?? index}`} guardrail={guardrail} />)}</div>;
  }

  const order: Guardrail["kind"][] = [];
  const byKind = new Map<Guardrail["kind"], Guardrail[]>();
  for (const guardrail of guardrails) {
    if (!byKind.has(guardrail.kind)) order.push(guardrail.kind);
    byKind.set(guardrail.kind, [...(byKind.get(guardrail.kind) ?? []), guardrail]);
  }
  return (
    <div className="grid gap-6">
      {order.map((kind) => (
        <section key={kind} aria-labelledby={`guardrail-${kind}`}>
          <h2 id={`guardrail-${kind}`} className="mb-2 font-extrabold text-ink">
            {KIND_LABEL[kind]} <span className="font-semibold text-muted">· {byKind.get(kind)?.length ?? 0}</span>
          </h2>
          <div className="grid gap-3">
            {byKind.get(kind)?.map((guardrail, index) => <GuardrailRow key={`${guardrail.whenISO ?? index}`} guardrail={guardrail} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

export function GuardrailInfoSummary({ guardrails }: { guardrails: Guardrail[] }) {
  const grouped = new Map<string, Guardrail[]>();
  for (const guardrail of guardrails) {
    const channel = guardrail.channelKey ?? "other";
    grouped.set(channel, [...(grouped.get(channel) ?? []), guardrail]);
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[...grouped.entries()].map(([channelKey, rows]) => (
        <div key={channelKey} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-ink">{channelKey === "other" ? "Other checks" : channelName(rows[0])}</h3>
              <p className="mt-0.5 text-xs text-muted">{rows.length} informational {rows.length === 1 ? "check" : "checks"}</p>
            </div>
            {channelKey !== "other" && (
              <Link href={`/outputs/${channelKey}`} className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-bg">
                View channel
              </Link>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {rows.map((row, index) => (
              <span key={`${row.whenISO ?? index}`} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-muted">
                {row.whenISO ? prettyDate(row.whenISO) : "No date"}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
