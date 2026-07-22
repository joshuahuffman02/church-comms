import { db } from "@/lib/db";
import { monthGrid, monthGridRange } from "@/lib/calendar";
import {
  MonthCalendar,
  type CalendarDeadlineItem,
  type CalendarEventItem,
  type CalendarPlacementItem,
  type CalendarView,
} from "@/components/month-calendar";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import { DONE_DELIVERABLE_STATUSES } from "@/lib/week";

type SearchParams = Record<string, string | string[] | undefined>;

const CALENDAR_EVENT_STATUSES = [
  "submitted",
  "triaged",
  "approved",
  "in_production",
  "proof",
  "scheduled",
  "published",
  "needs_info",
] as const;

const CALENDAR_VIEWS = new Set<CalendarView>(["overview", "events", "advertising", "deadlines"]);

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function Calendar({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const requestedMonth = /^(\d{4})-(\d{2})$/.exec(firstParam(query.month));
  if (requestedMonth) {
    year = Number(requestedMonth[1]);
    month = Number(requestedMonth[2]) - 1;
  }

  const requestedView = firstParam(query.view) as CalendarView;
  const view = CALENDAR_VIEWS.has(requestedView) ? requestedView : "overview";
  const grid = monthGrid(year, month);
  const { start, endExclusive } = monthGridRange(grid);

  const promotableRequest = {
    status: { in: PROMOTABLE_REQUEST_STATUSES },
    noPromo: false,
  } as const;

  // Every query is bounded to the visible 5- or 6-week grid. The old page read
  // the entire Touch table on every month, which made it slower as history grew.
  const [eventRows, touchRows, deadlineRows, channels] = await Promise.all([
    db.request.findMany({
      where: {
        eventStart: { gte: start, lt: endExclusive },
        status: { in: [...CALENDAR_EVENT_STATUSES] },
        noPromo: false,
      },
      orderBy: [{ eventStart: "asc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        eventStart: true,
        location: true,
        status: true,
        needsRegistration: true,
        owner: { select: { name: true } },
        ministries: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { name: true, color: true },
        },
      },
    }),
    db.touch.findMany({
      where: {
        scheduledAt: { gte: start, lt: endExclusive },
        status: { not: "skipped" },
        deliverable: {
          status: { not: "skipped" },
          request: promotableRequest,
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { deliverable: { request: { title: "asc" } } }],
      select: {
        id: true,
        scheduledAt: true,
        channel: { select: { key: true, name: true, color: true } },
        deliverable: {
          select: {
            phase: true,
            request: { select: { id: true, title: true, eventStart: true } },
          },
        },
      },
    }),
    db.deliverable.findMany({
      where: {
        productionDueAt: { gte: start, lt: endExclusive },
        status: { notIn: [...DONE_DELIVERABLE_STATUSES] },
        request: promotableRequest,
      },
      orderBy: [{ productionDueAt: "asc" }, { request: { title: "asc" } }],
      select: {
        id: true,
        productionDueAt: true,
        status: true,
        channel: { select: { key: true, name: true, color: true } },
        owner: { select: { name: true } },
        request: {
          select: {
            id: true,
            title: true,
            eventStart: true,
            owner: { select: { name: true } },
          },
        },
      },
    }),
    db.channel.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { key: true, name: true, color: true },
    }),
  ]);

  const selectedChannel = channels.some((channel) => channel.key === firstParam(query.channel))
    ? firstParam(query.channel)
    : null;

  const events: CalendarEventItem[] = eventRows.map((event) => ({
    id: event.id,
    title: event.title,
    date: event.eventStart,
    location: event.location,
    status: event.status,
    needsRegistration: event.needsRegistration,
    ownerName: event.owner?.name ?? null,
    ministries: event.ministries,
    copyCount: 1,
  }));
  const placements: CalendarPlacementItem[] = touchRows.map((touch) => ({
    id: touch.id,
    date: touch.scheduledAt,
    requestId: touch.deliverable.request.id,
    title: touch.deliverable.request.title,
    eventDate: touch.deliverable.request.eventStart,
    phase: touch.deliverable.phase,
    channel: touch.channel,
  }));
  const deadlines: CalendarDeadlineItem[] = deadlineRows.map((deliverable) => ({
    id: deliverable.id,
    date: deliverable.productionDueAt!,
    requestId: deliverable.request.id,
    title: deliverable.request.title,
    eventDate: deliverable.request.eventStart,
    status: deliverable.status,
    ownerName: deliverable.owner?.name ?? deliverable.request.owner?.name ?? null,
    channel: deliverable.channel,
  }));

  return (
    <MonthCalendar
      grid={grid}
      events={events}
      placements={placements}
      deadlines={deadlines}
      channels={channels}
      year={year}
      month={month}
      today={now}
      view={view}
      selectedChannel={selectedChannel}
    />
  );
}
