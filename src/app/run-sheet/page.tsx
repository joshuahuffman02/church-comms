import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { buildRunSheet, type RunSheetItem } from "@/lib/run-sheet";
import { comingSunday } from "@/lib/week";
import { addDays, atMidnight, parseDateInput } from "@/lib/engine/dates";
import { DELIVERABLE_STATUS_META } from "@/lib/status";
import { ymd } from "@/lib/exports";
import { PrintButton } from "@/components/print-button";
import { RunSheetCheckbox } from "@/components/run-sheet-checkbox";
import { UpdateDoneButton } from "@/components/update-done-button";
import { MinistryDots } from "@/components/ministry-dots";
import { KIND_LABEL } from "@/lib/updates";

// Reflects live DB state — render fresh each request.
export const dynamic = "force-dynamic";

function formatLong(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function formatShort(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function formatRange(start: Date, end: Date): string {
  const s = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const e = end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${s} – ${e}`;
}

function StatusPill({ status }: { status: string }) {
  const meta = DELIVERABLE_STATUS_META[status] ?? { label: status, color: "#94a3b8" };
  return (
    <span
      className="rs-status inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `${meta.color}22`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function ItemRow({ item }: { item: RunSheetItem }) {
  return (
    <li className="rs-row flex items-start gap-2 py-1.5">
      <RunSheetCheckbox touchId={item.touchId} done={item.done} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`font-semibold text-ink ${item.done ? "line-through text-muted" : ""}`}>
            {item.eventTitle}
          </span>
          {item.ministries.length > 0 && (
            <MinistryDots ministries={item.ministries} showNames className="text-xs" />
          )}
          <StatusPill status={item.status} />
          <span className="ml-auto text-xs text-muted">{formatShort(item.date)}</span>
        </div>
        {item.detail !== item.eventTitle && (
          <p className="text-sm text-ink/80 mt-0.5">{item.detail}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            Event <span className="font-medium text-ink/75">{formatShort(item.eventStart)}</span>
          </span>
          {item.registrationClosesAt && (
            <span>
              Registration due{" "}
              <span className="font-medium text-ink/75">
                {formatShort(item.registrationClosesAt)}
              </span>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export default async function RunSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ sunday?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { sunday: sundayParam } = await searchParams;
  const parsed = sundayParam ? parseDateInput(sundayParam) : null;
  // Normalize whatever Sunday we land on to the actual Sunday of its week, so a
  // mid-week ?sunday= value still resolves to one coherent service week.
  const sunday = parsed
    ? comingSunday(parsed)
    : comingSunday(new Date());

  const sheet = await buildRunSheet(sunday);

  const prevSunday = ymd(addDays(sunday, -7));
  const nextSunday = ymd(addDays(sunday, 7));
  const todaySunday = ymd(comingSunday(atMidnight(new Date())));

  const channelsWithItems = sheet.channels.filter((c) => c.items.length > 0);
  const hasLoopChanges = sheet.loopAdd.length > 0 || sheet.loopRemove.length > 0;

  return (
    <div className="rs-page max-w-4xl mx-auto">
      {/* Header + controls (controls hidden on print via .no-print) */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold">Sunday Checklist 🗒️</h1>
          <p className="text-muted mt-0.5">
            Sunday {formatLong(sheet.sunday)}
            <span className="mx-2 text-slate-300">·</span>
            week of {formatRange(sheet.weekStart, sheet.weekEnd)}
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <a
            href={`/run-sheet?sunday=${prevSunday}`}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-muted hover:bg-sky-bg transition"
          >
            ← Prev
          </a>
          <a
            href={`/run-sheet?sunday=${todaySunday}`}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-muted hover:bg-sky-bg transition"
            title="Jump to the coming Sunday"
          >
            This week
          </a>
          <a
            href={`/run-sheet?sunday=${nextSunday}`}
            className="rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-muted hover:bg-sky-bg transition"
          >
            Next →
          </a>
          <PrintButton />
        </div>
      </div>

      {/* Print-only title — the on-screen header chrome is friendlier, but on
          paper we want a clean, unambiguous heading. */}
      <div className="rs-print-title hidden">
        <h1>Sunday Checklist — {formatLong(sheet.sunday)}</h1>
        <p>Week of {formatRange(sheet.weekStart, sheet.weekEnd)}</p>
      </div>

      <div className="rs-body grid gap-4">
        {/* One section per active channel, in sortOrder. */}
        {sheet.channels.map((ch) => (
          <section
            key={ch.channelId}
            className="rs-section card-float p-5"
            style={{ borderLeft: `5px solid ${ch.color}` }}
          >
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h2 className="font-bold text-lg" style={{ color: ch.color }}>
                {ch.name}
              </h2>
              <span className="text-xs text-muted">
                {ch.onSundayOnly ? "on Sunday" : "this week"}
                <span className="mx-1.5 text-slate-300">·</span>
                {ch.items.length} {ch.items.length === 1 ? "item" : "items"}
              </span>
            </div>
            {ch.items.length === 0 ? (
              <p className="text-sm text-muted italic">Nothing this week.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {ch.items.map((it) => (
                  <ItemRow key={it.touchId} item={it} />
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* Loop add/remove for this Sunday. */}
        <section
          className="rs-section card-float p-5"
          style={{ borderLeft: "5px solid #34d399" }}
        >
          <h2 className="font-bold text-lg mb-2" style={{ color: "#34d399" }}>
            Loop changes this Sunday
          </h2>
          {!hasLoopChanges ? (
            <p className="text-sm text-muted italic">No loop additions or removals.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-bold uppercase text-muted mb-1">
                  ➕ Add ({sheet.loopAdd.length})
                </h3>
                {sheet.loopAdd.length === 0 ? (
                  <p className="text-sm text-muted italic">None.</p>
                ) : (
                  <ul>
                    {sheet.loopAdd.map((l) => (
                      <li key={l.touchId} className="rs-row flex items-start gap-2 py-1 text-sm">
                        <RunSheetCheckbox touchId={l.touchId} done={l.done} />
                        <span className={`font-medium text-ink ${l.done ? "line-through text-muted" : ""}`}>{l.title}</span>
                        {l.ministry && <span className="text-muted">· {l.ministry}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase text-muted mb-1">
                  ➖ Remove ({sheet.loopRemove.length})
                </h3>
                {sheet.loopRemove.length === 0 ? (
                  <p className="text-sm text-muted italic">None.</p>
                ) : (
                  <ul>
                    {sheet.loopRemove.map((l) => (
                      <li key={l.touchId} className="rs-row flex items-start gap-2 py-1 text-sm">
                        <RunSheetCheckbox touchId={l.touchId} done={l.done} />
                        <span className={`font-medium text-ink ${l.done ? "line-through text-muted" : ""}`}>{l.title}</span>
                        {l.ministry && <span className="text-muted">· {l.ministry}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Events physically happening this week. */}
        <section
          className="rs-section card-float p-5"
          style={{ borderLeft: "5px solid #a78bfa" }}
        >
          <h2 className="font-bold text-lg mb-2" style={{ color: "#a78bfa" }}>
            Events this week ({sheet.events.length})
          </h2>
          {sheet.events.length === 0 ? (
            <p className="text-sm text-muted italic">No events on the calendar this week.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sheet.events.map((e) => (
                <li key={e.requestId} className="rs-row flex items-start gap-2 py-1.5">
                  <span className="rs-check text-muted mt-0.5" aria-hidden>☐</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-ink">{e.title}</span>
                      {e.ministries.length > 0 && (
                        <MinistryDots ministries={e.ministries} showNames className="text-xs" />
                      )}
                      {e.location && <span className="text-xs text-muted">· {e.location}</span>}
                      <span className="ml-auto text-xs text-muted">{formatShort(e.start)}</span>
                    </div>
                    {e.activePhase && (
                      <p className="text-xs text-sky-700 mt-0.5">
                        📣 now: <span className="font-semibold">{e.activePhase.title}</span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Message-arc updates landing in this week. */}
        <section
          className="rs-section card-float p-5"
          style={{ borderLeft: "5px solid #f472b6" }}
        >
          <h2 className="font-bold text-lg mb-2" style={{ color: "#f472b6" }}>
            📣 Message updates this week ({sheet.updatesThisWeek.length})
          </h2>
          {sheet.updatesThisWeek.length === 0 ? (
            <p className="text-sm text-muted italic">No message updates this week.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sheet.updatesThisWeek.map((u) => (
                <li key={u.id} className="rs-row flex items-start gap-2 py-1.5">
                  <UpdateDoneButton id={u.id} done={u.done} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`font-semibold text-ink ${u.done ? "line-through text-muted" : ""}`}>
                        {u.eventTitle}
                      </span>
                      <span className="text-muted">·</span>
                      <span className={u.done ? "line-through text-muted" : "text-ink"}>{u.title}</span>
                      {u.kind && KIND_LABEL[u.kind] && (
                        <span className="rounded-full bg-sky-bg px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                          {KIND_LABEL[u.kind]}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted">{formatShort(u.scheduledFor)}</span>
                    </div>
                    {u.body && <p className="text-sm text-ink/80 mt-0.5">{u.body}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="no-print text-xs text-muted mt-4">
        {channelsWithItems.length} of {sheet.channels.length} channels have items this week.
      </p>
    </div>
  );
}
