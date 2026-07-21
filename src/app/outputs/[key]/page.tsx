import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DELIVERABLE_STATUS_META, PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import {
  curatedTouchesThisWeekForChannel,
  groupCuratedOutputTouchesBySunday,
  groupOutputTouchesBySunday,
  outputUpcomingRange,
  upcomingTouchesForChannel,
  type CuratedOutputWeekGroup,
  type OutputTouch,
} from "@/lib/outputs";
import { TouchRemoveButton } from "@/components/touch-remove-button";
import { TouchContentEditor } from "@/components/touch-content-editor";
import { ScheduleLockButton } from "@/components/schedule-lock-button";
import { MinistryDots } from "@/components/ministry-dots";
import { OutputLineupAdd } from "@/components/output-lineup-add";
import {
  Top3ManagePanel,
  Top3MoveButtons,
  Top3PinButton,
  Top3UnpinButton,
} from "@/components/top3-controls";
import { phaseLabel } from "@/lib/labels";
import { comingSunday, weekRange } from "@/lib/week";
import {
  announcementLineupRequestIds,
  loadAnnouncementVideoLineup,
  loadAnnouncementVideoLineups,
  type AnnouncementLineupEntry,
  type AnnouncementLineupSource,
  type AnnouncementVideoLineup,
} from "@/lib/announcement-video";
import {
  localDayKey,
  preferredLockedRequestIds,
  scheduleLockKey,
  scheduleLockLookup,
  scheduleLocksForChannelRange,
  type ScheduleLockLite,
} from "@/lib/schedule-locks";
import { addDays } from "@/lib/engine/dates";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";

const fmt = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtSunday = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
const fmtLongDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

const OUTPUT_TYPE_COPY: Record<string, string> = {
  dated_instance: "A dated lineup with one clear set of items for each appearance.",
  windowed: "A campaign-style channel where events can appear across a date window.",
  one_shot: "A one-time channel where each event has a specific appearance date.",
};

const SOURCE_META: Record<AnnouncementLineupSource, { label: string; className: string }> = {
  manual: { label: "Featured", className: "bg-violet-100 text-violet-800" },
  awareness: { label: "Awareness", className: "bg-sky-100 text-sky-800" },
  locked: { label: "Locked choice", className: "bg-emerald-100 text-emerald-800" },
  automatic: { label: "Automatic", className: "bg-slate-100 text-slate-700" },
};

type EventOption = { id: string; label: string };

function StatusChip({ status }: { status: string }) {
  const meta = DELIVERABLE_STATUS_META[status] ?? { label: status, color: "#94a3b8" };
  return (
    <span
      className="shrink-0 rounded-full border px-3 py-1 text-xs font-semibold text-slate-700"
      style={{ background: `${meta.color}18`, borderColor: `${meta.color}55` }}
    >
      {meta.label}
    </span>
  );
}

function SourceChip({ source }: { source: AnnouncementLineupSource }) {
  const meta = SOURCE_META[source];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>{meta.label}</span>;
}

function uniqueIds(ids: readonly string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }
  return output;
}

function preferredLocksByOutputSunday(locks: readonly ScheduleLockLite[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  const seenBySunday = new Map<string, Set<string>>();
  for (const lock of locks) {
    const sunday = localDayKey(weekRange(lock.scheduledAt).end);
    const seen = seenBySunday.get(sunday) ?? new Set<string>();
    if (seen.has(lock.requestId)) continue;
    seen.add(lock.requestId);
    seenBySunday.set(sunday, seen);
    grouped.set(sunday, [...(grouped.get(sunday) ?? []), lock.requestId]);
  }
  return grouped;
}

function pickedPosition(lineup: AnnouncementVideoLineup, entry: AnnouncementLineupEntry) {
  if (!entry.pickId) return null;
  const picked = lineup.entries.filter((item) => item.pickId);
  const index = picked.findIndex((item) => item.pickId === entry.pickId);
  return index < 0 ? null : { canMoveUp: index > 0, canMoveDown: index < picked.length - 1 };
}

function RowActions({
  touch,
  channelName,
  lockId,
  lineup,
  entry,
}: {
  touch: OutputTouch;
  channelName: string;
  lockId: string | null;
  lineup?: AnnouncementVideoLineup;
  entry?: AnnouncementLineupEntry;
}) {
  const request = touch.deliverable.request;
  const position = lineup && entry ? pickedPosition(lineup, entry) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {lineup && entry?.pickId && position && (
        <Top3MoveButtons
          id={entry.pickId}
          title={entry.title}
          canMoveUp={position.canMoveUp}
          canMoveDown={position.canMoveDown}
        />
      )}
      {lineup && entry?.pickId && (
        <Top3UnpinButton id={entry.pickId} title={entry.title} />
      )}
      {lineup && !entry?.pickId && (
        <Top3PinButton
          requestId={request.id}
          title={request.title}
          sundayIso={lineup.sunday.toISOString()}
        />
      )}
      <ScheduleLockButton touchId={touch.id} lockId={lockId} channelName={channelName} />
      <TouchRemoveButton
        id={touch.id}
        channelName={channelName}
        eventTitle={request.title}
        scheduledAt={touch.scheduledAt}
      />
    </div>
  );
}

function TouchRow({
  touch,
  channelName,
  lockId,
  canEdit,
  muted = false,
  slot,
  lineup,
  entry,
}: {
  touch: OutputTouch;
  channelName: string;
  lockId: string | null;
  canEdit: boolean;
  muted?: boolean;
  slot?: number;
  lineup?: AnnouncementVideoLineup;
  entry?: AnnouncementLineupEntry;
}) {
  const request = touch.deliverable.request;
  const ministries = request.ministries.map((ministry) => ({ name: ministry.name, color: ministry.color }));
  const phase = phaseLabel(touch.purposeLabel);

  return (
    <li className={`border-t border-slate-100 py-4 first:border-t-0 ${muted ? "opacity-80" : ""}`}>
      <div className="flex items-start gap-3">
        {slot != null && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-extrabold text-violet-800">
            {slot}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/requests/${request.id}`} className="font-bold text-ink hover:underline">
                  {request.title}
                </Link>
                {entry && <SourceChip source={entry.source} />}
                {muted && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Waiting</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {ministries.length > 0 && <MinistryDots ministries={ministries} showNames />}
                <span>Event {fmt(request.eventStart)}</span>
                {phase && <span>· {phase}</span>}
                {!lineup && <span>· Appears {fmt(touch.scheduledAt)}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <StatusChip status={touch.deliverable.status} />
              {canEdit && (
                <RowActions
                  touch={touch}
                  channelName={channelName}
                  lockId={lockId}
                  lineup={lineup}
                  entry={entry}
                />
              )}
            </div>
          </div>
          {canEdit && (
            <TouchContentEditor
              id={touch.id}
              scheduledAt={touch.scheduledAt}
              channelName={channelName}
              content={touch.content}
              assetLink={touch.assetLink}
              note={touch.note}
              collapsible
            />
          )}
        </div>
      </div>
    </li>
  );
}

function ReferenceRow({
  entry,
  slot,
  lineup,
  canEdit,
}: {
  entry: AnnouncementLineupEntry;
  slot: number;
  lineup: AnnouncementVideoLineup;
  canEdit: boolean;
}) {
  const position = pickedPosition(lineup, entry);
  return (
    <li className="flex items-start gap-3 border-t border-slate-100 py-4 first:border-t-0">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-extrabold text-violet-800">{slot}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {entry.requestId ? (
              <Link href={`/requests/${entry.requestId}`} className="font-bold text-ink hover:underline">{entry.title}</Link>
            ) : (
              <span className="font-bold text-ink">{entry.title}</span>
            )}
            <SourceChip source={entry.source} />
            {entry.missingTouch && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">Slide missing</span>}
          </div>
          <p className="mt-1 text-xs text-muted">
            {entry.missingTouch
              ? "This is featured, but no channel appearance exists for this Sunday."
              : "A short lineup note that does not belong to an event."}
          </p>
        </div>
        {canEdit && entry.pickId && (
          <div className="flex flex-wrap items-center gap-2">
            {position && (
              <Top3MoveButtons
                id={entry.pickId}
                title={entry.title}
                canMoveUp={position.canMoveUp}
                canMoveDown={position.canMoveDown}
              />
            )}
            <Top3UnpinButton
              id={entry.pickId}
              title={entry.title}
              kind={entry.source === "awareness" ? "note" : "event"}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function HeldTouches({
  touches,
  channelName,
  lockIdFor,
  canEdit,
  lineup,
}: {
  touches: OutputTouch[];
  channelName: string;
  lockIdFor: (touch: OutputTouch) => string | null;
  canEdit: boolean;
  lineup?: AnnouncementVideoLineup;
}) {
  if (touches.length === 0) return null;
  const eventCount = new Set(touches.map((touch) => touch.deliverable.request.id)).size;
  return (
    <details className="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/50 px-4 py-3">
      <summary className="cursor-pointer select-none text-sm font-semibold text-amber-900">
        {eventCount} event{eventCount === 1 ? " is" : "s are"} waiting outside this lineup
      </summary>
      <p className="mt-2 text-xs text-amber-900/75">
        These events are still assigned to the channel, but the weekly cap keeps them from appearing. Feature, lock, or remove one here.
      </p>
      <ul className="mt-1">
        {touches.map((touch) => (
          <TouchRow
            key={touch.id}
            touch={touch}
            channelName={channelName}
            lockId={lockIdFor(touch)}
            canEdit={canEdit}
            muted
            lineup={lineup}
          />
        ))}
      </ul>
    </details>
  );
}

function VideoLineupBody({
  lineup,
  touches,
  held,
  channelName,
  lockIdFor,
  canEdit,
  eventOptions,
}: {
  lineup: AnnouncementVideoLineup;
  touches: OutputTouch[];
  held: OutputTouch[];
  channelName: string;
  lockIdFor: (touch: OutputTouch) => string | null;
  canEdit: boolean;
  eventOptions: EventOption[];
}) {
  const touchesById = new Map([...touches, ...held].map((touch) => [touch.id, touch] as const));
  const pickedRequestIds = new Set(
    lineup.entries.flatMap((entry) => entry.pickId && entry.requestId ? [entry.requestId] : []),
  );
  const options = eventOptions.filter((option) => !pickedRequestIds.has(option.id));
  const removable = lineup.entries.flatMap((entry) =>
    entry.pickId ? [{ id: entry.pickId, title: entry.title }] : [],
  );
  const protectedFull = lineup.entries.filter((entry) => entry.source !== "automatic").length >= lineup.capacity;

  return (
    <>
      {lineup.issues.map((issue) => (
        <p key={issue} role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{issue}</p>
      ))}
      {lineup.entries.length === 0 ? (
        <p className="py-3 text-sm text-muted">No events are in this lineup yet.</p>
      ) : (
        <ol>
          {lineup.entries.map((entry, index) => {
            const touch = entry.touchId ? touchesById.get(entry.touchId) : null;
            return touch ? (
              <TouchRow
                key={entry.key}
                touch={touch}
                channelName={channelName}
                lockId={lockIdFor(touch)}
                canEdit={canEdit}
                slot={index + 1}
                lineup={lineup}
                entry={entry}
              />
            ) : (
              <ReferenceRow key={entry.key} entry={entry} slot={index + 1} lineup={lineup} canEdit={canEdit} />
            );
          })}
        </ol>
      )}
      <HeldTouches
        touches={held}
        channelName={channelName}
        lockIdFor={lockIdFor}
        canEdit={canEdit}
        lineup={lineup}
      />
      {canEdit && (
        <Top3ManagePanel
          sundayIso={lineup.sunday.toISOString()}
          options={options}
          removable={removable}
          protectedFull={protectedFull}
          capacity={lineup.capacity}
        />
      )}
    </>
  );
}

function LineupSummary({ lineup }: { lineup: AnnouncementVideoLineup }) {
  const locked = lineup.entries.filter((entry) => entry.locked).length;
  const room = Math.max(0, lineup.capacity - lineup.entries.length);
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-violet-100 px-2.5 py-1 font-bold text-violet-800">
        {lineup.entries.length}/{lineup.capacity} slots
      </span>
      {locked > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">{locked} locked</span>}
      {room > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">{room} open</span>}
      {lineup.issues.length > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-800">Needs attention</span>}
    </span>
  );
}

function GenericWeekBody({
  group,
  channelName,
  lockIdFor,
  canEdit,
}: {
  group: CuratedOutputWeekGroup<OutputTouch>;
  channelName: string;
  lockIdFor: (touch: OutputTouch) => string | null;
  canEdit: boolean;
}) {
  return (
    <>
      {group.items.length === 0 ? (
        <p className="py-3 text-sm text-muted">Nothing scheduled for this week.</p>
      ) : (
        <ul>
          {group.items.map((touch) => (
            <TouchRow
              key={touch.id}
              touch={touch}
              channelName={channelName}
              lockId={lockIdFor(touch)}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
      <HeldTouches
        touches={group.held}
        channelName={channelName}
        lockIdFor={lockIdFor}
        canEdit={canEdit}
      />
    </>
  );
}

export default async function OutputPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [channel, user] = await Promise.all([
    db.channel.findUnique({ where: { key } }),
    getSessionUser(),
  ]);
  if (!channel || !channel.active) notFound();

  const canEdit = user ? isEditor(user.roles) : false;
  const announcementVideo = channel.key === "announcement_video";
  const today = new Date();
  const currentWeek = weekRange(today);
  const currentSunday = comingSunday(today);
  const upcomingRange = outputUpcomingRange(today);
  const [scheduleLocks, currentVideoLineup, upcoming, optionRows, futurePickRows] = await Promise.all([
    scheduleLocksForChannelRange(channel.id, currentWeek.start, upcomingRange.end),
    announcementVideo ? loadAnnouncementVideoLineup(currentSunday) : Promise.resolve(null),
    upcomingTouchesForChannel(channel.id, today),
    db.request.findMany({
      where: {
        status: { in: PROMOTABLE_REQUEST_STATUSES },
        noPromo: false,
        eventStart: { gte: today },
      },
      orderBy: [{ eventStart: "asc" }, { title: "asc" }],
      take: 120,
      select: { id: true, title: true, eventStart: true },
    }),
    announcementVideo
      ? db.videoTop3Item.findMany({
          where: { sunday: { gte: upcomingRange.start, lt: upcomingRange.end } },
          select: { sunday: true },
          orderBy: { sunday: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const currentWeekEndExclusive = addDays(currentWeek.end, 1);
  const currentLocks = scheduleLocks.filter((lock) => lock.scheduledAt < currentWeekEndExclusive);
  const preferred = currentVideoLineup
    ? announcementLineupRequestIds(currentVideoLineup)
    : uniqueIds(preferredLockedRequestIds(currentLocks));
  const week = await curatedTouchesThisWeekForChannel(
    channel,
    today,
    preferred,
    announcementVideo,
  );

  const rawUpcomingGroups = groupOutputTouchesBySunday(upcoming);
  const futureSundayByKey = new Map<string, Date>();
  for (const group of rawUpcomingGroups) futureSundayByKey.set(localDayKey(group.sunday), group.sunday);
  for (const row of futurePickRows) futureSundayByKey.set(localDayKey(row.sunday), row.sunday);
  if (announcementVideo) {
    for (const lock of scheduleLocks) {
      if (lock.scheduledAt < upcomingRange.start) continue;
      const sunday = weekRange(lock.scheduledAt).end;
      futureSundayByKey.set(localDayKey(sunday), sunday);
    }
  }
  const futureSundays = [...futureSundayByKey.values()].sort((a, b) => a.getTime() - b.getTime());
  const upcomingVideoLineups = announcementVideo
    ? await loadAnnouncementVideoLineups(futureSundays)
    : new Map<string, AnnouncementVideoLineup>();
  const preferredBySunday = announcementVideo
    ? new Map(
        [...upcomingVideoLineups.entries()].map(([day, lineup]) => [day, announcementLineupRequestIds(lineup)]),
      )
    : preferredLocksByOutputSunday(
        scheduleLocks.filter((lock) => lock.scheduledAt >= upcomingRange.start),
      );
  const curatedUpcoming = groupCuratedOutputTouchesBySunday(
    upcoming,
    channel,
    preferredBySunday,
    announcementVideo,
  );
  const curatedBySunday = new Map(curatedUpcoming.map((group) => [localDayKey(group.sunday), group]));
  const upcomingPanels = announcementVideo
    ? futureSundays.map((sunday) => {
        const group = curatedBySunday.get(localDayKey(sunday));
        return group ?? {
          sunday,
          items: [],
          held: [],
          liveEventCount: 0,
          cap: currentVideoLineup?.capacity ?? 3,
        };
      })
    : curatedUpcoming;
  const lockIdByPlacement = scheduleLockLookup(scheduleLocks);
  const lockIdFor = (touch: OutputTouch) =>
    lockIdByPlacement.get(
      scheduleLockKey(touch.deliverable.request.id, touch.channelId, touch.scheduledAt),
    ) ?? null;
  const eventOptions = optionRows.map((request) => ({
    id: request.id,
    label: `${request.title} (${fmt(request.eventStart)})`,
  }));
  const currentDisplayCount = currentVideoLineup?.entries.length ?? week.liveEventCount;
  const upcomingDisplayCount = announcementVideo
    ? upcomingPanels.reduce(
        (count, group) => count + (upcomingVideoLineups.get(localDayKey(group.sunday))?.entries.length ?? 0),
        0,
      )
    : upcomingPanels.reduce((count, group) => count + group.items.length, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/outputs" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted hover:underline">← All channels</Link>

      <header className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:items-start">
        <div>
          <div className="flex items-start gap-3">
            <span className="mt-2 h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: channel.color }} />
            <h1 className="text-3xl font-extrabold" style={{ color: channel.color }}>{channel.name}</h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {OUTPUT_TYPE_COPY[channel.type] ?? "Review what is scheduled, adjust the lineup, and prepare the content from one place."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/75 px-3 py-1.5 font-semibold text-ink shadow-sm">{currentDisplayCount} live this week</span>
            <span className="rounded-full bg-white/75 px-3 py-1.5 font-semibold text-ink shadow-sm">{upcomingPanels.length} upcoming week{upcomingPanels.length === 1 ? "" : "s"}</span>
            {week.cap != null && <span className="rounded-full bg-white/75 px-3 py-1.5 font-semibold text-ink shadow-sm">Weekly cap {week.cap}</span>}
            {!canEdit && <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-muted">View only</span>}
          </div>
          {channel.productionNotes && (
            <details className="mt-4 max-w-2xl rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3">
              <summary className="cursor-pointer select-none text-sm font-bold text-ink">Production notes</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{channel.productionNotes}</p>
            </details>
          )}
        </div>
        {canEdit && (
          <aside className="card-float p-4" style={{ borderTop: `4px solid ${channel.color}` }}>
            <OutputLineupAdd
              channelId={channel.id}
              channelName={channel.name}
              announcementVideo={announcementVideo}
              defaultDate={localDayKey(announcementVideo ? currentSunday : today)}
              options={eventOptions}
            />
          </aside>
        )}
      </header>

      <section className="card-float mb-5 p-5" style={{ borderLeft: `5px solid ${channel.color}` }} aria-labelledby="current-lineup-heading">
        <div className="mb-3 flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Current</p>
            <h2 id="current-lineup-heading" className="mt-1 text-xl font-extrabold text-ink">
              {announcementVideo ? `This Sunday · ${fmtLongDate(currentSunday)}` : "Live this week"}
            </h2>
          </div>
          {currentVideoLineup ? (
            <LineupSummary lineup={currentVideoLineup} />
          ) : (
            <span className="self-start rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">{week.liveEventCount} live</span>
          )}
        </div>
        {currentVideoLineup ? (
          <VideoLineupBody
            lineup={currentVideoLineup}
            touches={week.live}
            held={week.held}
            channelName={channel.name}
            lockIdFor={lockIdFor}
            canEdit={canEdit}
            eventOptions={eventOptions}
          />
        ) : (
          <GenericWeekBody
            group={{ sunday: currentWeek.end, items: week.live, held: week.held, liveEventCount: week.liveEventCount, cap: week.cap }}
            channelName={channel.name}
            lockIdFor={lockIdFor}
            canEdit={canEdit}
          />
        )}
      </section>

      <section aria-labelledby="upcoming-lineups-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Plan ahead</p>
            <h2 id="upcoming-lineups-heading" className="mt-1 text-xl font-extrabold text-ink">Upcoming lineups</h2>
          </div>
          <p className="text-sm text-muted">{upcomingDisplayCount} scheduled item{upcomingDisplayCount === 1 ? "" : "s"} · next 16 weeks</p>
        </div>
        {upcomingPanels.length === 0 ? (
          <div className="card-float p-5 text-sm text-muted">Nothing is scheduled in the next few months.</div>
        ) : (
          <div className="grid gap-3">
            {upcomingPanels.map((group, index) => {
              const lineup = upcomingVideoLineups.get(localDayKey(group.sunday));
              return (
                <details key={group.sunday.getTime()} open={index < 2} className="card-float group p-0">
                  <summary className="flex cursor-pointer list-none flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-muted transition group-open:rotate-90">›</span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-muted">{announcementVideo ? "Airs" : "Week ending"}</p>
                        <h3 className="font-extrabold text-ink">{fmtSunday(group.sunday)}</h3>
                      </div>
                    </div>
                    {lineup ? (
                      <LineupSummary lineup={lineup} />
                    ) : (
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">{group.liveEventCount} live</span>
                    )}
                  </summary>
                  <div className="border-t border-slate-100 px-5 pb-5 pt-2">
                    {lineup ? (
                      <VideoLineupBody
                        lineup={lineup}
                        touches={group.items}
                        held={group.held}
                        channelName={channel.name}
                        lockIdFor={lockIdFor}
                        canEdit={canEdit}
                        eventOptions={eventOptions}
                      />
                    ) : (
                      <GenericWeekBody group={group} channelName={channel.name} lockIdFor={lockIdFor} canEdit={canEdit} />
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
