import { db } from "@/lib/db";
import { weekRange, bucketForDeliverable, comingSunday, loopChangesForSunday } from "@/lib/week";
import { addDays } from "@/lib/engine/dates";
import { ThisWeekBoard } from "@/components/this-week-board";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";

export default async function ThisWeek() {
  const today = new Date();
  const { start, end } = weekRange(today);

  const deliverables = await db.deliverable.findMany({
    where: { request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false } },
    include: {
      request: { include: { owner: { select: { name: true } } } },
      channel: true,
      touches: true,
      owner: { select: { name: true } },
    },
  });

  // Effective owner name for the board's "Make / Design" rows: the deliverable's
  // own owner, else the request's owner. Shown as subtle initials.
  const withOwner = (d: (typeof deliverables)[number]) => ({
    ...d,
    ownerName: d.owner?.name ?? d.request.owner?.name ?? null,
  });

  const make = deliverables.filter(d => bucketForDeliverable(d, today) === "make").map(withOwner);
  const atRisk = deliverables.filter(d => bucketForDeliverable(d, today) === "at_risk").map(withOwner);
  const videoLocks = deliverables.filter(d =>
    d.channel.type === "dated_instance" && d.productionDueAt &&
    d.productionDueAt >= start && d.productionDueAt <= end).map(withOwner);

  // Loop add/remove for the coming Sunday: query the loop channel's touches.
  const sunday = comingSunday(today);
  const loopTouches = await db.touch.findMany({
    where: {
      channel: { key: "loop" },
      deliverable: {
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
    },
    include: { channel: true, deliverable: { include: { request: true } } },
  });
  const loopForSunday = loopTouches.map(t => ({
    id: t.id,
    requestId: t.deliverable.request.id,
    scheduledAt: t.scheduledAt,
    request: { title: t.deliverable.request.title },
    channel: { name: t.channel.name },
  }));
  const { add, remove } = loopChangesForSunday(loopForSunday, sunday);

  // Message-arc updates whose phase date lands in this Mon..Sun week — the
  // "change the message" actions to action now. Half-open upper bound (day after
  // the week's end) so all of Sunday counts.
  const updateRows = await db.eventUpdate.findMany({
    where: { scheduledFor: { gte: start, lt: addDays(end, 1) } },
    include: { request: { select: { id: true, title: true } } },
    orderBy: [{ scheduledFor: "asc" }, { sortOrder: "asc" }],
  });
  const messageUpdates = updateRows.map((u) => ({
    id: u.id,
    requestId: u.requestId,
    eventTitle: u.request.title,
    title: u.title,
    kind: u.kind,
    body: u.body,
    scheduledFor: u.scheduledFor,
    done: u.status === "done",
  }));

  // Admin (playbook) tasks whose due date lands in this Mon..Sun week — the
  // checklist items to action now. Same half-open upper bound as above.
  const taskRows = await db.eventTask.findMany({
    where: { dueAt: { gte: start, lt: addDays(end, 1) } },
    include: { request: { select: { id: true, title: true } } },
    orderBy: [{ dueAt: "asc" }, { sortOrder: "asc" }],
  });
  const adminTasks = taskRows.map((t) => ({
    id: t.id,
    requestId: t.requestId,
    eventTitle: t.request.title,
    title: t.title,
    notes: t.notes,
    category: t.category,
    source: t.source,
    dueAt: t.dueAt,
    done: t.status === "done",
  }));

  // Standing weekly chores (not tied to an event) + whether each is done THIS
  // week (a completion row keyed to this week's Monday). They reset each week.
  const standingRows = await db.standingTask.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { completions: { where: { weekStart: start } } },
  });
  const standingTasks = standingRows.map((t) => ({
    id: t.id,
    title: t.title,
    notes: t.notes,
    area: t.area,
    done: t.completions.length > 0,
  }));

  // Curated "Top 3" for the coming Sunday's announcement video + the upcoming
  // events to choose from (any date forward — events can be featured ahead).
  const top3Rows = await db.videoTop3Item.findMany({
    where: { sunday },
    orderBy: { sortOrder: "asc" },
    include: { request: { select: { id: true, title: true } } },
  });
  const top3Items = top3Rows.map((it) => ({
    id: it.id,
    title: it.request?.title ?? it.label ?? "(untitled)",
    isLabel: !it.requestId,
    requestId: it.requestId ?? null,
  }));
  const optionRows = await db.request.findMany({
    where: { eventStart: { gte: start } },
    orderBy: { eventStart: "asc" },
    take: 50,
    select: { id: true, title: true, eventStart: true },
  });
  const top3Options = optionRows.map((r) => ({ id: r.id, title: r.title, date: r.eventStart }));

  return (
    <ThisWeekBoard
      make={make}
      atRisk={atRisk}
      videoLocks={videoLocks}
      loopAdd={add}
      loopRemove={remove}
      messageUpdates={messageUpdates}
      adminTasks={adminTasks}
      standingTasks={standingTasks}
      top3Items={top3Items}
      top3Options={top3Options}
      top3Sunday={sunday}
      weekStart={start}
      weekEnd={end}
    />
  );
}
