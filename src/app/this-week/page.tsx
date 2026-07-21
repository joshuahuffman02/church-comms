import { db } from "@/lib/db";
import {
  weekRange,
  bucketForDeliverable,
  comingSunday,
  DONE_DELIVERABLE_STATUSES,
  loopChangesForSunday,
} from "@/lib/week";
import { addDays, atMidnight } from "@/lib/engine/dates";
import { ThisWeekBoard } from "@/components/this-week-board";
import { WelcomeCard } from "@/components/welcome-card";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import { getSessionUser } from "@/lib/authz";
import { isAdmin, isEditor } from "@/lib/roles";
import { loadAnnouncementVideoLineup } from "@/lib/announcement-video";

export default async function ThisWeek() {
  const today = new Date();
  const { start, end } = weekRange(today);
  const endExclusive = addDays(end, 1);
  const sunday = comingSunday(today);
  const recentBacklogStart = addDays(atMidnight(today), -14);
  const previousSunday = addDays(sunday, -7);
  const afterSunday = addDays(sunday, 1);

  const promotableRequest = {
    status: { in: PROMOTABLE_REQUEST_STATUSES },
    noPromo: false,
  } as const;

  const [
    user,
    eventCount,
    deliverables,
    staleAtRiskCount,
    loopTouches,
    updateRows,
    taskRows,
    standingRows,
    videoLineup,
    optionRows,
  ] = await Promise.all([
    getSessionUser(),
    db.request.count(),
    db.deliverable.findMany({
      where: {
        productionDueAt: { gte: recentBacklogStart, lt: endExclusive },
        status: { notIn: [...DONE_DELIVERABLE_STATUSES] },
        request: promotableRequest,
      },
      orderBy: [{ productionDueAt: "asc" }, { request: { title: "asc" } }],
      select: {
        id: true,
        requestId: true,
        status: true,
        productionDueAt: true,
        instanceDate: true,
        request: {
          select: { title: true, owner: { select: { name: true } } },
        },
        channel: { select: { key: true, name: true, color: true } },
        owner: { select: { name: true } },
      },
    }),
    db.deliverable.count({
      where: {
        productionDueAt: { lt: recentBacklogStart },
        status: { notIn: [...DONE_DELIVERABLE_STATUSES] },
        request: promotableRequest,
      },
    }),
    db.touch.findMany({
      where: {
        channel: { key: "loop" },
        scheduledAt: { gte: previousSunday, lt: afterSunday },
        deliverable: { request: promotableRequest },
      },
      orderBy: [{ scheduledAt: "asc" }, { deliverable: { request: { title: "asc" } } }],
      select: {
        id: true,
        scheduledAt: true,
        channel: { select: { name: true } },
        deliverable: {
          select: { request: { select: { id: true, title: true } } },
        },
      },
    }),
    db.eventUpdate.findMany({
      where: {
        scheduledFor: { gte: start, lt: endExclusive },
        status: { not: "done" },
        request: promotableRequest,
      },
      include: { request: { select: { id: true, title: true } } },
      orderBy: [{ scheduledFor: "asc" }, { sortOrder: "asc" }],
    }),
    db.eventTask.findMany({
      where: {
        dueAt: { gte: start, lt: endExclusive },
        status: { not: "done" },
        request: promotableRequest,
      },
      include: { request: { select: { id: true, title: true } } },
      orderBy: [{ dueAt: "asc" }, { sortOrder: "asc" }],
    }),
    db.standingTask.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { completions: { where: { weekStart: start } } },
    }),
    loadAnnouncementVideoLineup(sunday),
    db.request.findMany({
      where: {
        status: { in: PROMOTABLE_REQUEST_STATUSES },
        noPromo: false,
        eventStart: { gte: atMidnight(today) },
      },
      orderBy: [{ eventStart: "asc" }, { title: "asc" }],
      take: 75,
      select: { id: true, title: true, eventStart: true },
    }),
  ]);

  const firstRun = eventCount === 0;
  const withOwner = (deliverable: (typeof deliverables)[number]) => ({
    ...deliverable,
    ownerName: deliverable.owner?.name ?? deliverable.request.owner?.name ?? null,
  });
  const make = deliverables
    .filter(
      (deliverable) =>
        deliverable.channel.key !== "announcement_video" &&
        bucketForDeliverable(deliverable, today) === "make",
    )
    .map(withOwner);
  const atRisk = deliverables
    .filter((deliverable) => bucketForDeliverable(deliverable, today) === "at_risk")
    .map(withOwner);
  const videoLocks = deliverables
    .filter(
      (deliverable) =>
        deliverable.channel.key === "announcement_video" &&
        deliverable.productionDueAt &&
        deliverable.productionDueAt >= start &&
        deliverable.productionDueAt < endExclusive,
    )
    .map(withOwner);

  const loopForSunday = loopTouches.map((touch) => ({
    id: touch.id,
    requestId: touch.deliverable.request.id,
    scheduledAt: touch.scheduledAt,
    request: {
      id: touch.deliverable.request.id,
      title: touch.deliverable.request.title,
    },
    channel: { name: touch.channel.name },
  }));
  const { add, remove } = loopChangesForSunday(loopForSunday, sunday);

  const messageUpdates = updateRows.map((update) => ({
    id: update.id,
    requestId: update.requestId,
    eventTitle: update.request.title,
    title: update.title,
    kind: update.kind,
    body: update.body,
    scheduledFor: update.scheduledFor,
    done: update.status === "done",
  }));
  const adminTasks = taskRows.map((task) => ({
    id: task.id,
    requestId: task.requestId,
    eventTitle: task.request.title,
    title: task.title,
    notes: task.notes,
    category: task.category,
    source: task.source,
    dueAt: task.dueAt,
    done: task.status === "done",
  }));
  const standingTasks = standingRows
    .map((task) => ({
      id: task.id,
      title: task.title,
      notes: task.notes,
      area: task.area,
      done: task.completions.length > 0,
    }))
    .filter((task) => !task.done);

  const top3Items = videoLineup.entries.map((entry) => ({
    key: entry.key,
    pickId: entry.pickId,
    title: entry.title,
    requestId: entry.requestId,
    source: entry.source,
    locked: entry.locked,
    missingTouch: entry.missingTouch,
  }));
  const selectedRequestIds = new Set(
    videoLineup.entries.flatMap((entry) => (entry.requestId ? [entry.requestId] : [])),
  );
  const top3Options = optionRows
    .filter((request) => !selectedRequestIds.has(request.id))
    .map((request) => ({ id: request.id, title: request.title, date: request.eventStart }));

  return (
    <>
      {firstRun && (
        <div className="max-w-7xl">
          <WelcomeCard
            admin={user ? isAdmin(user.roles) : false}
            editor={user ? isEditor(user.roles) : false}
          />
        </div>
      )}
      <ThisWeekBoard
        make={make}
        atRisk={atRisk}
        staleAtRiskCount={staleAtRiskCount}
        videoLocks={videoLocks}
        loopAdd={add}
        loopRemove={remove}
        messageUpdates={messageUpdates}
        adminTasks={adminTasks}
        standingTasks={standingTasks}
        top3Items={top3Items}
        top3Options={top3Options}
        top3Sunday={sunday}
        top3Capacity={videoLineup.capacity}
        top3HeldCount={videoLineup.held.length}
        top3Issues={videoLineup.issues}
        canEdit={user ? isEditor(user.roles) : false}
        weekStart={start}
        weekEnd={end}
      />
    </>
  );
}
