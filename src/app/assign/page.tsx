import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { atMidnight } from "@/lib/engine/dates";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";
import { buildBoardModel, type AssignEvent, type AssignDeliverable, type AssignChannel } from "@/lib/assign";
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
        deliverables: { select: { id: true, channelId: true, status: true, touches: { select: { scheduledAt: true }, orderBy: { scheduledAt: "asc" }, take: 1 } } } },
      orderBy: { eventStart: "asc" },
    }),
    db.channel.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, key: true, name: true, color: true } }),
  ]);

  const events: AssignEvent[] = requests.map((r) => ({ id: r.id, title: r.title, eventStartMs: r.eventStart.getTime(), tier: r.tier, noPromo: r.noPromo }));
  const deliverables: AssignDeliverable[] = requests.flatMap((r) =>
    r.deliverables.map((d) => ({ id: d.id, requestId: r.id, channelId: d.channelId, status: d.status, publishMs: d.touches[0]?.scheduledAt.getTime() ?? null })),
  );
  const chans: AssignChannel[] = channels;
  const model = buildBoardModel(events, deliverables, chans);

  return (
    <div className="max-w-full">
      <h1 className="text-2xl font-extrabold mb-1">Assign to channels 🧲</h1>
      <p className="text-muted mb-4">Drag any upcoming event onto the channels it should appear on.</p>
      <AssignBoard channels={chans} model={model} />
    </div>
  );
}
