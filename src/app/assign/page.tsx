import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { atMidnight } from "@/lib/engine/dates";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import {
  buildAssignmentOverview,
  type AssignEvent,
  type AssignSchedule,
  type AssignChannel,
  type ProtectedPlacement,
} from "@/lib/assign";
import { AssignBoard } from "@/components/assign-board";

export const dynamic = "force-dynamic";

export default async function AssignPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isEditor(user.roles)) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-extrabold mb-2">Assign to channels</h1>
        <div className="card-float border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Editor access is required.</div>
      </div>
    );
  }

  const today = atMidnight(new Date());
  const [requests, channels] = await Promise.all([
    db.request.findMany({
      where: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false, eventStart: { gte: today } },
      select: { id: true, title: true, eventStart: true, tier: true, noPromo: true,
        deliverables: {
          select: {
            id: true,
            channelId: true,
            status: true,
            touches: {
              where: { NOT: { status: "skipped" } },
              select: { scheduledAt: true },
              orderBy: { scheduledAt: "asc" },
            },
          },
        },
        scheduleLocks: {
          where: { scheduledAt: { gte: today } },
          select: { channelId: true, scheduledAt: true },
        },
        videoTop3: {
          where: { sunday: { gte: today } },
          select: { sunday: true },
        },
      },
      orderBy: { eventStart: "asc" },
    }),
    db.channel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, key: true, name: true, color: true } }),
  ]);

  const events: AssignEvent[] = requests.map((r) => ({ id: r.id, title: r.title, eventStartMs: r.eventStart.getTime(), tier: r.tier, noPromo: r.noPromo }));
  const schedules: AssignSchedule[] = requests.flatMap((request) =>
    request.deliverables.map((deliverable) => ({
      id: deliverable.id,
      requestId: request.id,
      channelId: deliverable.channelId,
      status: deliverable.status,
      publishDatesMs: deliverable.touches.map((touch) => touch.scheduledAt.getTime()),
    })),
  );
  const chans: AssignChannel[] = channels;
  const announcementVideo = channels.find((channel) => channel.key === "announcement_video");
  const protectedPlacements: ProtectedPlacement[] = requests.flatMap((request) => [
    ...request.scheduleLocks.map((lock) => ({
      requestId: request.id,
      channelId: lock.channelId,
      scheduledAtMs: lock.scheduledAt.getTime(),
      kind: "locked" as const,
    })),
    ...(announcementVideo ? request.videoTop3.map((pick) => ({
      requestId: request.id,
      channelId: announcementVideo.id,
      scheduledAtMs: pick.sunday.getTime(),
      kind: "featured" as const,
    })) : []),
  ]);
  const overview = buildAssignmentOverview(events, schedules, chans, protectedPlacements, today.getTime());

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 text-2xl font-extrabold">Assign to channels</h1>
      <p className="mb-5 max-w-3xl text-muted">
        See every upcoming event in one place, fix old channel dates, and add or remove channels without dragging.
      </p>
      <AssignBoard channels={chans} overview={overview} />
    </div>
  );
}
