import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Megaphone,
  Radio,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { calendarDateKey } from "@/lib/calendar";
import { atMidnight } from "@/lib/engine/dates";
import { DELIVERABLE_STATUS_META, REQUEST_STATUS_META } from "@/lib/status";
import { weekRange } from "@/lib/week";
import { channelWorkLabel } from "@/lib/labels";

export type CalendarView = "overview" | "events" | "advertising" | "deadlines";

export type CalendarChannel = {
  key: string;
  name: string;
  color: string;
};

export type CalendarEventItem = {
  id: string;
  title: string;
  date: Date;
  location: string | null;
  status: string;
  needsRegistration: boolean;
  ownerName: string | null;
  ministries: { name: string; color: string }[];
  copyCount: number;
};

export type CalendarPlacementItem = {
  id: string;
  date: Date;
  requestId: string;
  title: string;
  eventDate: Date;
  phase: string | null;
  channel: CalendarChannel;
};

export type CalendarDeadlineItem = {
  id: string;
  date: Date;
  requestId: string;
  title: string;
  eventDate: Date;
  status: string;
  ownerName: string | null;
  channel: CalendarChannel;
};

type DayBundle = {
  date: Date;
  events: CalendarEventItem[];
  placements: CalendarPlacementItem[];
  deadlines: CalendarDeadlineItem[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "events", label: "Event dates" },
  { value: "advertising", label: "Advertising" },
  { value: "deadlines", label: "Deadlines" },
];

const ATTENTION_EVENT_STATUSES = new Set(["submitted", "triaged", "needs_info"]);
const EVENT_STATUS_RANK = ["submitted", "needs_info", "triaged", "approved", "in_production", "proof", "scheduled", "published"];

function ym(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function calendarHref(
  year: number,
  month: number,
  view: CalendarView,
  channel: string | null,
  overrides: { year?: number; month?: number; view?: CalendarView; channel?: string | null } = {},
): string {
  const nextYear = overrides.year ?? year;
  const nextMonth = overrides.month ?? month;
  const nextView = overrides.view ?? view;
  const nextChannel = overrides.channel === undefined ? channel : overrides.channel;
  const params = new URLSearchParams({ month: ym(nextYear, nextMonth) });
  if (nextView !== "overview") params.set("view", nextView);
  if (nextChannel) params.set("channel", nextChannel);
  return `/calendar?${params.toString()}`;
}

function longDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sameMonth(date: Date, year: number, month: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month;
}

function groupByDay<T extends { date: Date }>(items: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = calendarDateKey(item.date);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function uniqueByRequest<T extends { requestId: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.requestId)) return false;
    seen.add(item.requestId);
    return true;
  });
}

function collapseEventCopies(events: readonly CalendarEventItem[]): CalendarEventItem[] {
  const grouped = new Map<string, CalendarEventItem>();
  for (const event of events) {
    const key = `${calendarDateKey(event.date)}|${event.title.trim().toLowerCase()}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, event);
      continue;
    }
    const existingRank = EVENT_STATUS_RANK.indexOf(existing.status);
    const nextRank = EVENT_STATUS_RANK.indexOf(event.status);
    const preferred = nextRank > existingRank ? event : existing;
    grouped.set(key, { ...preferred, copyCount: existing.copyCount + event.copyCount });
  }
  return [...grouped.values()].sort((a, b) => a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title));
}

function outputHref(channelKey: string, date: Date): string {
  return `/outputs/${channelKey}?week=${calendarDateKey(weekRange(date).end)}`;
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  tone: string;
}) {
  return (
    <div className="card-float p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
          <p className="mt-1 text-3xl font-extrabold text-ink">{value}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${tone}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted">{detail}</p>
    </div>
  );
}

function EventStatus({ status }: { status: string }) {
  const meta = REQUEST_STATUS_META[status] ?? { label: status, color: "#94a3b8" };
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}12` }}
    >
      {meta.label}
    </span>
  );
}

function DeadlineStatus({ status }: { status: string }) {
  const meta = DELIVERABLE_STATUS_META[status] ?? { label: status, color: "#94a3b8" };
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: meta.color, borderColor: `${meta.color}55`, backgroundColor: `${meta.color}12` }}
    >
      {meta.label}
    </span>
  );
}

function DayCell({
  bundle,
  displayedMonth,
  todayKey,
  showEvents,
  showAdvertising,
  showDeadlines,
}: {
  bundle: DayBundle;
  displayedMonth: number;
  todayKey: string;
  showEvents: boolean;
  showAdvertising: boolean;
  showDeadlines: boolean;
}) {
  const key = calendarDateKey(bundle.date);
  const isToday = key === todayKey;
  const outsideMonth = bundle.date.getMonth() !== displayedMonth;
  const past = key < todayKey;
  // Adjacent-month cells provide date context only. Keeping their content out of
  // the current month prevents next month's campaigns from being previewed early.
  const eventRows = showEvents && !outsideMonth ? bundle.events : [];
  const deadlineRows = showDeadlines && !outsideMonth ? bundle.deadlines : [];
  const placementRows = showAdvertising && !outsideMonth ? bundle.placements : [];
  const promotedRequests = uniqueByRequest(placementRows);
  const totalBlocks = eventRows.length + deadlineRows.length + (placementRows.length > 0 ? 1 : 0);
  let remainingSlots = 3;
  const shownEvents = eventRows.slice(0, Math.min(2, remainingSlots));
  remainingSlots -= shownEvents.length;
  const shownDeadlines = deadlineRows.slice(0, Math.min(1, remainingSlots));
  remainingSlots -= shownDeadlines.length;
  const showAdSummary = placementRows.length > 0 && remainingSlots > 0;
  const shownBlocks = shownEvents.length + shownDeadlines.length + (showAdSummary ? 1 : 0);
  const overflow = Math.max(0, totalBlocks - shownBlocks);
  const agendaTarget = past && !outsideMonth ? "earlier-month" : `day-${key}`;

  return (
    <div
      className={`min-h-36 rounded-3xl border p-2.5 transition ${
        isToday
          ? "border-violet-300 bg-violet-50/90 shadow-sm ring-2 ring-violet-200/60"
          : "border-white/80 bg-white/65"
      } ${outsideMonth ? "opacity-35" : past ? "opacity-65" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <time
          dateTime={key}
          className={`grid h-7 min-w-7 place-items-center rounded-full text-xs font-extrabold ${
            isToday ? "bg-violet-600 text-white" : "text-muted"
          }`}
        >
          {bundle.date.getDate()}
        </time>
        {placementRows.length > 0 && (
          <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
            {placementRows.length} ad{placementRows.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {shownEvents.map((event) => (
          <Link
            key={`event-${event.id}`}
            href={`/requests/${event.id}`}
            className="block rounded-xl border border-violet-100 bg-violet-50/80 px-2 py-1.5 text-[11px] font-bold leading-tight text-violet-900 hover:border-violet-300 hover:underline"
            title={`Event: ${event.title}`}
          >
            <span className="line-clamp-2">{event.title}</span>
          </Link>
        ))}
        {shownDeadlines.map((deadline) => (
          <Link
            key={`deadline-${deadline.id}`}
            href={`/requests/${deadline.requestId}`}
            className="block truncate rounded-xl border border-amber-100 bg-amber-50/80 px-2 py-1.5 text-[11px] font-semibold text-amber-900 hover:border-amber-300 hover:underline"
            title={`${channelWorkLabel(deadline.channel.name)} due for ${deadline.title}`}
          >
            {channelWorkLabel(deadline.channel.name)} due · {deadline.title}
          </Link>
        ))}
        {showAdSummary && (
          <a
            href={`#${agendaTarget}`}
            className="flex items-center gap-1.5 rounded-xl bg-sky-50/80 px-2 py-1.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-100 hover:underline"
          >
            <Megaphone className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {promotedRequests.length} event{promotedRequests.length === 1 ? "" : "s"} promoted
            </span>
          </a>
        )}
        {overflow > 0 && (
          <a href={`#${agendaTarget}`} className="block px-1 text-[11px] font-bold text-sky-700 hover:underline">
            +{overflow} more detail{overflow === 1 ? "" : "s"}
          </a>
        )}
      </div>
    </div>
  );
}

function DayAgenda({ bundle, today }: { bundle: DayBundle; today: Date }) {
  const key = calendarDateKey(bundle.date);
  const isPast = atMidnight(bundle.date) < atMidnight(today);
  const placementRequests = uniqueByRequest(bundle.placements);
  const placementChannels = [...new Map(bundle.placements.map((item) => [item.channel.key, item.channel])).values()];
  const deadlineGroups = [...bundle.deadlines.reduce((groups, deadline) => {
    groups.set(deadline.requestId, [...(groups.get(deadline.requestId) ?? []), deadline]);
    return groups;
  }, new Map<string, CalendarDeadlineItem[]>()).values()];

  return (
    <article
      id={`day-${key}`}
      className={`card-float scroll-mt-6 overflow-hidden ${isPast ? "opacity-70" : ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <time dateTime={key} className="font-extrabold text-ink">
            {longDate(bundle.date)}
          </time>
          {isPast && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted">Past</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted">
          {bundle.events.length > 0 && <span>{bundle.events.length} event{bundle.events.length === 1 ? "" : "s"}</span>}
          {bundle.placements.length > 0 && <span>{bundle.placements.length} ad{bundle.placements.length === 1 ? "" : "s"}</span>}
          {bundle.deadlines.length > 0 && <span>{bundle.deadlines.length} due</span>}
        </div>
      </header>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-3">
        {bundle.events.length > 0 && (
          <section aria-label={`Events on ${longDate(bundle.date)}`}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-violet-700">
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> Event dates
            </h3>
            <div className="space-y-2">
              {bundle.events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-violet-100 bg-violet-50/55 p-3">
                  <Link href={`/requests/${event.id}`} className="font-bold text-ink hover:text-violet-800 hover:underline">
                    {event.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <EventStatus status={event.status} />
                    {event.copyCount > 1 && (
                      <Link
                        href={`/requests?view=focus&q=${encodeURIComponent(event.title)}`}
                        className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 hover:underline"
                      >
                        {event.copyCount} possible copies
                      </Link>
                    )}
                    {event.needsRegistration && (
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-violet-800">Registration</span>
                    )}
                  </div>
                  {(event.location || event.ownerName) && (
                    <div className="mt-2 space-y-1 text-xs text-muted">
                      {event.location && (
                        <p className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{event.location}</span>
                        </p>
                      )}
                      {event.ownerName && (
                        <p className="flex items-center gap-1.5">
                          <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>Event owner: {event.ownerName}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {bundle.deadlines.length > 0 && (
          <section aria-label={`Production deadlines on ${longDate(bundle.date)}`}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-700">
              <Clock3 className="h-4 w-4" aria-hidden="true" /> Production due
            </h3>
            <div className="space-y-2">
              {deadlineGroups.map((group) => {
                const first = group[0];
                return (
                <div key={first.requestId} className="rounded-2xl border border-amber-100 bg-amber-50/55 p-3">
                  <Link href={`/requests/${first.requestId}`} className="font-bold text-ink hover:text-amber-800 hover:underline">
                    {first.title}
                  </Link>
                  <div className="mt-2 grid gap-1.5">
                    {group.map((deadline) => (
                      <div key={deadline.id} className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white px-2 py-1.5 text-[11px]">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: deadline.channel.color }} aria-hidden="true" />
                        <span className="font-semibold text-amber-900">{channelWorkLabel(deadline.channel.name)}</span>
                        <DeadlineStatus status={deadline.status} />
                        {deadline.ownerName && <span className="ml-auto text-muted">Piece owner: {deadline.ownerName}</span>}
                      </div>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          </section>
        )}

        {bundle.placements.length > 0 && (
          <section aria-label={`Advertising placements on ${longDate(bundle.date)}`}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-sky-700">
              <Megaphone className="h-4 w-4" aria-hidden="true" /> Advertising
            </h3>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/55 p-3">
              <p className="text-sm font-semibold text-ink">
                {bundle.placements.length} placement{bundle.placements.length === 1 ? "" : "s"} for {placementRequests.length} event{placementRequests.length === 1 ? "" : "s"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {placementChannels.map((channel) => {
                  const count = bundle.placements.filter((item) => item.channel.key === channel.key).length;
                  return (
                    <Link
                      key={channel.key}
                      href={outputHref(channel.key, bundle.date)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white bg-white px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-sky-300 hover:text-sky-800"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: channel.color }} aria-hidden="true" />
                      {channel.name} · {count}
                    </Link>
                  );
                })}
              </div>
              <div className="mt-3 space-y-1.5 border-t border-sky-100 pt-3">
                {placementRequests.slice(0, 5).map((placement) => (
                  <Link
                    key={placement.requestId}
                    href={`/requests/${placement.requestId}`}
                    className="block truncate text-xs font-semibold text-sky-900 hover:underline"
                  >
                    {placement.title}
                  </Link>
                ))}
                {placementRequests.length > 5 && (
                  <p className="text-xs font-semibold text-muted">+{placementRequests.length - 5} more events</p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

export function MonthCalendar({
  grid,
  events,
  placements,
  deadlines,
  channels,
  year,
  month,
  today,
  view,
  selectedChannel,
}: {
  grid: Date[][];
  events: CalendarEventItem[];
  placements: CalendarPlacementItem[];
  deadlines: CalendarDeadlineItem[];
  channels: CalendarChannel[];
  year: number;
  month: number;
  today: Date;
  view: CalendarView;
  selectedChannel: string | null;
}) {
  const showEvents = view === "overview" || view === "events";
  const showAdvertising = view === "overview" || view === "advertising";
  const showDeadlines = view === "overview" || view === "deadlines";
  const channelPlacements = selectedChannel
    ? placements.filter((item) => item.channel.key === selectedChannel)
    : placements;
  const channelDeadlines = selectedChannel
    ? deadlines.filter((item) => item.channel.key === selectedChannel)
    : deadlines;
  const channelRequestIds = new Set([
    ...channelPlacements.map((item) => item.requestId),
    ...channelDeadlines.map((item) => item.requestId),
  ]);
  const channelEvents = collapseEventCopies(
    selectedChannel ? events.filter((event) => channelRequestIds.has(event.id)) : events,
  );
  const monthEvents = channelEvents.filter((event) => sameMonth(event.date, year, month));
  const monthPlacements = channelPlacements.filter((item) => sameMonth(item.date, year, month));
  const monthDeadlines = channelDeadlines.filter((item) => sameMonth(item.date, year, month));
  const visibleEvents = showEvents ? channelEvents : [];
  const visiblePlacements = showAdvertising ? channelPlacements : [];
  const visibleDeadlines = showDeadlines ? channelDeadlines : [];

  const eventsByDay = groupByDay(visibleEvents);
  const placementsByDay = groupByDay(visiblePlacements);
  const deadlinesByDay = groupByDay(visibleDeadlines);
  const bundles: DayBundle[] = grid.flat().map((date) => {
    const key = calendarDateKey(date);
    return {
      date,
      events: eventsByDay.get(key) ?? [],
      placements: placementsByDay.get(key) ?? [],
      deadlines: deadlinesByDay.get(key) ?? [],
    };
  });
  const monthBundles = bundles.filter((bundle) => sameMonth(bundle.date, year, month));
  const activeMonthBundles = monthBundles.filter(
    (bundle) => bundle.events.length > 0 || bundle.placements.length > 0 || bundle.deadlines.length > 0,
  );

  const activeChannelKeys = new Set(monthPlacements.map((item) => item.channel.key));
  const todayMidnight = atMidnight(today);
  const overdueDeadlines = monthDeadlines.filter((deadline) => atMidnight(deadline.date) < todayMidnight);
  const attentionEvents = monthEvents.filter(
    (event) => ATTENTION_EVENT_STATUSES.has(event.status) && atMidnight(event.date) >= todayMidnight,
  );
  const upcomingEvents = monthEvents
    .filter((event) => atMidnight(event.date) >= todayMidnight)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const upcomingBundles = isCurrentMonth
    ? activeMonthBundles.filter((bundle) => atMidnight(bundle.date) >= todayMidnight)
    : activeMonthBundles;
  const earlierBundles = isCurrentMonth
    ? activeMonthBundles.filter((bundle) => atMidnight(bundle.date) < todayMidnight)
    : [];
  const todayKey = calendarDateKey(today);
  const selectedChannelName = channels.find((channel) => channel.key === selectedChannel)?.name ?? null;

  return (
    <div className="max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-700">Plan the month</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">Calendar</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Event dates, advertising placements, and production deadlines in one planning view.
          </p>
        </div>
        <nav className="flex items-center gap-1 rounded-full border border-white/80 bg-white/70 p-1 shadow-sm" aria-label="Calendar month">
          <Link
            href={calendarHref(year, month, view, selectedChannel, { month: month - 1 })}
            aria-label="Previous month"
            className="grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-sky-bg"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <span className="min-w-36 text-center text-sm font-extrabold text-ink sm:min-w-44">
            {MONTHS[month]} {year}
          </span>
          <Link
            href={calendarHref(year, month, view, selectedChannel, { month: month + 1 })}
            aria-label="Next month"
            className="grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-sky-bg"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Link>
          <Link href="/calendar" className="rounded-full px-3 py-2 text-sm font-bold text-sky-700 hover:bg-sky-bg">
            Today
          </Link>
        </nav>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Month summary">
        <SummaryCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Event dates"
          value={monthEvents.length}
          detail="Events happening during this month"
          tone="bg-violet-100 text-violet-700"
        />
        <SummaryCard
          icon={<Megaphone className="h-5 w-5" />}
          label="Ad placements"
          value={monthPlacements.length}
          detail={`Across ${activeChannelKeys.size} active channel${activeChannelKeys.size === 1 ? "" : "s"}`}
          tone="bg-sky-100 text-sky-700"
        />
        <SummaryCard
          icon={<Clock3 className="h-5 w-5" />}
          label="Production due"
          value={monthDeadlines.length}
          detail="Open production deadlines in this month"
          tone="bg-amber-100 text-amber-700"
        />
        <SummaryCard
          icon={<TriangleAlert className="h-5 w-5" />}
          label="Needs attention"
          value={overdueDeadlines.length + attentionEvents.length}
          detail="Overdue work or upcoming events still being set up"
          tone="bg-rose-100 text-rose-700"
        />
      </section>

      <section className="card-float p-3 sm:p-4" aria-label="Calendar filters">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">Show</span>
          {VIEW_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={calendarHref(year, month, view, selectedChannel, { view: option.value })}
              aria-current={view === option.value ? "page" : undefined}
              className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                view === option.value ? "bg-ink text-white shadow-sm" : "bg-white/70 text-muted hover:bg-white hover:text-ink"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="mr-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">Channel</span>
          <Link
            href={calendarHref(year, month, view, selectedChannel, { channel: null })}
            aria-current={!selectedChannel ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              !selectedChannel ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-white/70 text-muted hover:text-ink"
            }`}
          >
            All channels
          </Link>
          {channels.map((channel) => (
            <Link
              key={channel.key}
              href={calendarHref(year, month, view, selectedChannel, { channel: channel.key })}
              aria-current={selectedChannel === channel.key ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                selectedChannel === channel.key
                  ? "border-sky-300 bg-sky-50 text-sky-800"
                  : "border-slate-200 bg-white/70 text-muted hover:text-ink"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: channel.color }} aria-hidden="true" />
              {channel.name}
            </Link>
          ))}
        </div>
        {selectedChannelName && (
          <p className="mt-3 text-xs text-muted">Showing events and work connected to {selectedChannelName}.</p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card-float hidden overflow-hidden p-4 lg:block" aria-label={`${MONTHS[month]} ${year} month grid`}>
          <div className="mb-2 grid grid-cols-7 gap-2 px-1 text-xs font-bold text-muted">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday}>{weekday}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {bundles.map((bundle) => (
              <DayCell
                key={calendarDateKey(bundle.date)}
                bundle={bundle}
                displayedMonth={month}
                todayKey={todayKey}
                showEvents={showEvents}
                showAdvertising={showAdvertising}
                showDeadlines={showDeadlines}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-violet-100" /> Event date</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-sky-100" /> Advertising</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-100" /> Production due</span>
          </div>
        </section>

        <aside className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1" aria-label="Calendar focus">
          <section className="card-float p-4">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <TriangleAlert className="h-5 w-5 text-rose-600" aria-hidden="true" /> Needs attention
            </h2>
            {overdueDeadlines.length === 0 && attentionEvents.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-muted">Nothing in this month is overdue or waiting for initial setup.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {overdueDeadlines.slice(0, 4).map((deadline) => (
                  <Link key={deadline.id} href={`/requests/${deadline.requestId}`} className="block rounded-2xl bg-rose-50 p-3 hover:bg-rose-100">
                    <span className="block text-xs font-bold text-rose-700">Overdue · {channelWorkLabel(deadline.channel.name)}</span>
                    <span className="mt-1 block text-sm font-bold text-ink">{deadline.title}</span>
                    <span className="mt-1 block text-xs text-muted">Due {shortDate(deadline.date)}</span>
                  </Link>
                ))}
                {attentionEvents.slice(0, Math.max(0, 4 - overdueDeadlines.length)).map((event) => (
                  <Link key={event.id} href={`/requests/${event.id}`} className="block rounded-2xl bg-amber-50 p-3 hover:bg-amber-100">
                    <span className="block text-xs font-bold text-amber-700">Still being set up</span>
                    <span className="mt-1 block text-sm font-bold text-ink">{event.title}</span>
                    <span className="mt-1 block text-xs text-muted">Happens {shortDate(event.date)}</span>
                  </Link>
                ))}
              </div>
            )}
            <Link href="/pipeline" className="mt-4 inline-flex text-sm font-bold text-sky-700 hover:underline">
              Review work in Production →
            </Link>
          </section>

          <section className="card-float p-4">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <Radio className="h-5 w-5 text-violet-600" aria-hidden="true" /> Next event dates
            </h2>
            {upcomingEvents.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-muted">No upcoming event dates remain in this month.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {upcomingEvents.map((event) => (
                  <Link key={event.id} href={`/requests/${event.id}`} className="flex gap-3 py-3 hover:text-violet-800">
                    <span className="min-w-12 text-xs font-extrabold uppercase text-violet-700">{shortDate(event.date)}</span>
                    <span className="min-w-0 text-sm font-bold text-ink hover:underline">{event.title}</span>
                  </Link>
                ))}
              </div>
            )}
            <Link href="/requests/new" className="mt-3 inline-flex text-sm font-bold text-sky-700 hover:underline">
              Add an event →
            </Link>
          </section>
        </aside>
      </div>

      <section aria-labelledby="month-agenda-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-700">Readable on every screen</p>
            <h2 id="month-agenda-title" className="mt-1 text-xl font-extrabold text-ink">
              {isCurrentMonth ? "From today forward" : `${MONTHS[month]} agenda`}
            </h2>
          </div>
          <p className="text-sm text-muted">Open a channel badge to manage that week&apos;s lineup.</p>
        </div>

        {upcomingBundles.length === 0 ? (
          <div className="card-float p-8 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <h3 className="mt-3 font-extrabold text-ink">No matching calendar activity</h3>
            <p className="mt-1 text-sm text-muted">Try Overview, clear the channel filter, or move to another month.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingBundles.map((bundle) => (
              <DayAgenda key={calendarDateKey(bundle.date)} bundle={bundle} today={today} />
            ))}
          </div>
        )}

        {earlierBundles.length > 0 && (
          <details id="earlier-month" className="card-float mt-4 scroll-mt-6 overflow-hidden">
            <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-ink hover:bg-white/40">
              Earlier this month · {earlierBundles.length} active day{earlierBundles.length === 1 ? "" : "s"}
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-3 sm:p-4">
              {earlierBundles.map((bundle) => (
                <DayAgenda key={calendarDateKey(bundle.date)} bundle={bundle} today={today} />
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
