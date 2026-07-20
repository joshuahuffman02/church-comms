import { redirect } from "next/navigation";
import Link from "next/link";
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
import { ScheduleLockButton } from "@/components/schedule-lock-button";
import { KIND_LABEL } from "@/lib/updates";

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
  const e = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${s} – ${e}`;
}

function StatusPill({ status }: { status: string }) {
  const meta = DELIVERABLE_STATUS_META[status] ?? { label: status, color: "#64748b" };
  return (
    <span
      className="rs-status inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-slate-700"
      style={{ background: `${meta.color}18`, borderColor: `${meta.color}55` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
      {meta.label}
    </span>
  );
}

const LINEUP_LABEL = {
  manual: "Featured",
  awareness: "Awareness",
  locked: "Locked",
  automatic: "Auto-filled",
} as const;

function ItemRow({ item, channelName }: { item: RunSheetItem; channelName: string }) {
  const title = item.requestId ? (
    <Link
      href={`/requests/${item.requestId}`}
      className={`font-semibold text-ink hover:text-sky-700 hover:underline ${
        item.done ? "line-through text-muted" : ""
      }`}
    >
      {item.eventTitle}
    </Link>
  ) : (
    <span className="font-semibold text-ink">{item.eventTitle}</span>
  );

  return (
    <li className="rs-row flex items-start gap-3 py-2.5">
      {item.touchId ? (
        <RunSheetCheckbox
          touchId={item.touchId}
          done={item.done}
          label={`${channelName}: ${item.eventTitle}`}
        />
      ) : (
        <span
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
            item.missingTouch ? "bg-red-100 text-red-700" : "bg-violet-100 text-violet-700"
          }`}
          title={item.missingTouch ? "Scheduled slide is missing" : "Reference item"}
          aria-hidden
        >
          {item.missingTouch ? "!" : "•"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {title}
          {item.ministries.length > 0 && (
            <MinistryDots ministries={item.ministries} showNames className="text-xs" />
          )}
          {item.touchId && <StatusPill status={item.status} />}
          {item.lineupSource && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
              {LINEUP_LABEL[item.lineupSource]}
            </span>
          )}
          {item.missingTouch && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
              Slide missing
            </span>
          )}
          <span className="ml-auto text-xs text-muted">{formatShort(item.date)}</span>
        </div>
        {item.detail !== item.eventTitle && (
          <p className="mt-0.5 text-sm text-ink/80">{item.detail}</p>
        )}
        {item.requestId && (
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
        )}
      </div>
      {item.touchId && item.requestId && (
        <div className="no-print shrink-0">
          <ScheduleLockButton
            touchId={item.touchId}
            lockId={item.lockId}
            channelName={channelName}
          />
        </div>
      )}
    </li>
  );
}

export default async function RunSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ sunday?: string; view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const parsed = params.sunday ? parseDateInput(params.sunday) : null;
  const sunday = parsed ? comingSunday(parsed) : comingSunday(new Date());
  const showAll = params.view === "all";
  const sheet = await buildRunSheet(sunday);

  const prevSunday = ymd(addDays(sunday, -7));
  const nextSunday = ymd(addDays(sunday, 7));
  const todaySunday = ymd(comingSunday(atMidnight(new Date())));
  const viewParam = showAll ? "all" : "open";

  // Loop additions have their own section below, so the ordinary Loop channel
  // is intentionally excluded. This removes the old duplicate checklist rows.
  const actionableChannels = sheet.channels.filter((channel) => channel.key !== "loop");
  const actionableItems = actionableChannels.flatMap((channel) =>
    channel.items.filter((item) => item.touchId),
  );
  const total =
    actionableItems.length +
    sheet.loopAdd.length +
    sheet.loopRemove.length +
    sheet.updatesThisWeek.length;
  const completed =
    actionableItems.filter((item) => item.done).length +
    sheet.loopAdd.filter((item) => item.done).length +
    sheet.loopRemove.filter((item) => item.done).length +
    sheet.updatesThisWeek.filter((item) => item.done).length;
  const remaining = Math.max(0, total - completed);
  const progress = total === 0 ? 100 : Math.round((completed / total) * 100);

  const visibleChannels = actionableChannels
    .map((channel) => ({
      ...channel,
      items: showAll ? channel.items : channel.items.filter((item) => !item.done),
    }))
    .filter((channel) => showAll || channel.items.length > 0 || (channel.issues?.length ?? 0) > 0);
  const loopAdd = showAll ? sheet.loopAdd : sheet.loopAdd.filter((item) => !item.done);
  const loopRemove = showAll ? sheet.loopRemove : sheet.loopRemove.filter((item) => !item.done);
  const updates = showAll
    ? sheet.updatesThisWeek
    : sheet.updatesThisWeek.filter((item) => !item.done);
  const hasVisibleLoop = loopAdd.length > 0 || loopRemove.length > 0;
  const hasVisibleWork = visibleChannels.length > 0 || hasVisibleLoop || updates.length > 0;

  return (
    <div className="rs-page mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Sunday Checklist</h1>
          <p className="mt-0.5 text-muted">
            {formatLong(sheet.sunday)}
            <span className="mx-2 text-slate-300">·</span>
            week of {formatRange(sheet.weekStart, sheet.weekEnd)}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Link
            href={`/run-sheet?sunday=${prevSunday}&view=${viewParam}`}
            className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-sky-bg"
          >
            ← Prev
          </Link>
          <Link
            href={`/run-sheet?sunday=${todaySunday}&view=${viewParam}`}
            className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-sky-bg"
          >
            This week
          </Link>
          <Link
            href={`/run-sheet?sunday=${nextSunday}&view=${viewParam}`}
            className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-sky-bg"
          >
            Next →
          </Link>
          <PrintButton />
        </div>
      </div>

      <div className="rs-print-title hidden">
        <h1>Sunday Checklist — {formatLong(sheet.sunday)}</h1>
        <p>Week of {formatRange(sheet.weekStart, sheet.weekEnd)}</p>
      </div>

      <section className="no-print card-float mb-4 p-5" aria-label="Checklist progress">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Sunday readiness</p>
            <p className="mt-1 text-xl font-extrabold text-ink">
              {remaining === 0 ? "All caught up" : `${remaining} ${remaining === 1 ? "item" : "items"} left`}
            </p>
            <p className="text-sm text-muted">{completed} of {total} completed</p>
          </div>
          <Link
            href={`/run-sheet?sunday=${ymd(sunday)}&view=${showAll ? "open" : "all"}`}
            className="rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {showAll ? "Incomplete only" : "Show completed"}
          </Link>
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-600 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </section>

      <div className="rs-body grid gap-4">
        {!hasVisibleWork && (
          <section className="card-float border-l-4 border-emerald-500 p-6 text-center">
            <p className="text-lg font-bold text-emerald-800">Everything is ready for Sunday.</p>
            <p className="mt-1 text-sm text-muted">Use “Show completed” if you need to review the full list.</p>
          </section>
        )}

        {visibleChannels.map((channel) => (
          <section
            key={channel.channelId}
            className="rs-section card-float p-5"
            style={{ borderLeft: `5px solid ${channel.color}` }}
          >
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold" style={{ color: channel.color }}>
                {channel.name}
              </h2>
              <span className="text-xs text-muted">
                {channel.onSundayOnly ? "on Sunday" : "this week"} · {channel.items.length}{" "}
                {channel.items.length === 1 ? "item" : "items"}
                {channel.capacity ? ` · ${channel.capacity} slots` : ""}
              </span>
            </div>
            {channel.key === "announcement_video" && (
              <p className="mb-2 text-xs text-muted">
                Featured and locked slides stay in place; open slots fill automatically by priority and event date.
                {(channel.heldCount ?? 0) > 0 && ` ${channel.heldCount} eligible event${channel.heldCount === 1 ? " is" : "s are"} held outside the ${channel.capacity ?? 3} slots.`}
              </p>
            )}
            {(channel.issues ?? []).map((issue) => (
              <p key={issue} role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                {issue}
              </p>
            ))}
            {channel.items.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {channel.items.map((item) => (
                  <ItemRow key={item.touchId ?? `${item.lineupSource}:${item.eventTitle}`} item={item} channelName={channel.name} />
                ))}
              </ul>
            )}
          </section>
        ))}

        {(hasVisibleLoop || showAll) && (
          <section className="rs-section card-float border-l-[5px] border-l-emerald-500 p-5">
            <h2 className="mb-2 text-lg font-bold text-emerald-700">Loop changes this Sunday</h2>
            {!hasVisibleLoop ? (
              <p className="text-sm italic text-muted">No loop additions or removals.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-xs font-bold uppercase text-muted">Add ({loopAdd.length})</h3>
                  {loopAdd.length === 0 ? (
                    <p className="text-sm italic text-muted">None.</p>
                  ) : (
                    <ul>
                      {loopAdd.map((item) => (
                        <li key={item.touchId} className="rs-row flex items-start gap-2 py-2 text-sm">
                          <RunSheetCheckbox touchId={item.touchId} done={item.done} label={`Add ${item.title} to Loop`} />
                          <Link href={`/requests/${item.requestId}`} className={`min-w-0 flex-1 font-medium text-ink hover:text-sky-700 hover:underline ${item.done ? "line-through text-muted" : ""}`}>
                            {item.title}
                          </Link>
                          <div className="no-print">
                            <ScheduleLockButton touchId={item.touchId} lockId={item.lockId} channelName="Loop" />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-bold uppercase text-muted">Remove ({loopRemove.length})</h3>
                  {loopRemove.length === 0 ? (
                    <p className="text-sm italic text-muted">None.</p>
                  ) : (
                    <ul>
                      {loopRemove.map((item) => (
                        <li key={item.touchId} className="rs-row flex items-start gap-2 py-2 text-sm">
                          <RunSheetCheckbox touchId={item.touchId} done={item.done} kind="loop-removal" label={`Remove ${item.title} from Loop`} />
                          <Link href={`/requests/${item.requestId}`} className={`font-medium text-ink hover:text-sky-700 hover:underline ${item.done ? "line-through text-muted" : ""}`}>
                            {item.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {(updates.length > 0 || showAll) && (
          <section className="rs-section card-float border-l-[5px] border-l-pink-500 p-5">
            <h2 className="mb-2 text-lg font-bold text-pink-700">Message updates this week ({updates.length})</h2>
            {updates.length === 0 ? (
              <p className="text-sm italic text-muted">No message updates this week.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {updates.map((update) => (
                  <li key={update.id} className="rs-row flex items-start gap-3 py-2.5">
                    <UpdateDoneButton id={update.id} done={update.done} label={`${update.eventTitle}: ${update.title}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/requests/${update.requestId}`} className={`font-semibold text-ink hover:text-sky-700 hover:underline ${update.done ? "line-through text-muted" : ""}`}>
                          {update.eventTitle}
                        </Link>
                        <span className="text-muted">·</span>
                        <span className={update.done ? "line-through text-muted" : "text-ink"}>{update.title}</span>
                        {update.kind && KIND_LABEL[update.kind] && (
                          <span className="rounded-full bg-sky-bg px-2 py-0.5 text-[11px] font-semibold text-sky-800">{KIND_LABEL[update.kind]}</span>
                        )}
                        <span className="ml-auto text-xs text-muted">{formatShort(update.scheduledFor)}</span>
                      </div>
                      {update.body && <p className="mt-0.5 text-sm text-ink/80">{update.body}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <details className="rs-section card-float border-l-[5px] border-l-violet-500 p-5">
          <summary className="cursor-pointer text-lg font-bold text-violet-800">
            Events happening this week ({sheet.events.length})
          </summary>
          <p className="mt-1 text-xs text-muted">Reference only — these are not checklist tasks.</p>
          {sheet.events.length === 0 ? (
            <p className="mt-3 text-sm italic text-muted">No approved events on the calendar this week.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {sheet.events.map((event) => (
                <li key={event.requestId} className="rs-row py-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/requests/${event.requestId}`} className="font-semibold text-ink hover:text-sky-700 hover:underline">
                      {event.title}
                    </Link>
                    {event.ministries.length > 0 && <MinistryDots ministries={event.ministries} showNames className="text-xs" />}
                    {event.location && <span className="text-xs text-muted">· {event.location}</span>}
                    <span className="ml-auto text-xs text-muted">{formatShort(event.start)}</span>
                  </div>
                  {event.activePhase && <p className="mt-0.5 text-xs text-sky-800">Now: <span className="font-semibold">{event.activePhase.title}</span></p>}
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
    </div>
  );
}
