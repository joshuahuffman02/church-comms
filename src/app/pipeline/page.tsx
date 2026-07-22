import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { atMidnight } from "@/lib/engine/dates";
import { PipelineBoard, type DeliverableCard, type PipelineFilters } from "@/components/pipeline-board";

export const dynamic = "force-dynamic";

/** Enough room for the complete current queue without letting corrupted or
 * unexpectedly huge data create an unbounded client payload. */
const BOARD_CAP = 500;

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function pipelineFiltersFromParams(params: SearchParams): PipelineFilters {
  return {
    q: firstParam(params.q),
    channel: firstParam(params.channel),
    owner: firstParam(params.owner),
    status: firstParam(params.status),
    view: firstParam(params.view),
    group: firstParam(params.group),
  };
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const initialFilters = pipelineFiltersFromParams(await searchParams);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const canEdit = isEditor(user.roles);
  const today = atMidnight(new Date());

  const unfinishedWhere: Prisma.DeliverableWhereInput = {
    status: { notIn: ["published", "skipped"] },
    request: { is: { status: { not: "cancelled" } } },
  };

  // A dated channel is current only while it still has an appearance today or
  // later. Deliverables without touches stay visible as legitimate unscheduled
  // work. This matches the My Tasks expiration rule.
  const currentWhere: Prisma.DeliverableWhereInput = {
    ...unfinishedWhere,
    OR: [
      { touches: { none: {} } },
      { touches: { some: { scheduledAt: { gte: today } } } },
    ],
  };

  const [totalUnfinished, totalCurrent, deliverables, activeUsers] = await Promise.all([
    db.deliverable.count({ where: unfinishedWhere }),
    db.deliverable.count({ where: currentWhere }),
    db.deliverable.findMany({
      where: currentWhere,
      orderBy: [{ productionDueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      take: BOARD_CAP,
      select: {
        id: true,
        status: true,
        productionDueAt: true,
        ownerId: true,
        channel: { select: { key: true, name: true, color: true } },
        owner: { select: { name: true } },
        touches: {
          where: { scheduledAt: { gte: today } },
          orderBy: { scheduledAt: "asc" },
          take: 1,
          select: { scheduledAt: true },
        },
        request: {
          select: {
            id: true,
            title: true,
            tier: true,
            eventStart: true,
            ownerId: true,
            owner: { select: { name: true } },
            ministries: {
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              select: { name: true, color: true },
            },
          },
        },
      },
    }),
    db.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const cards: DeliverableCard[] = deliverables.map((d) => {
    const ownerId = d.ownerId ?? d.request.ownerId;
    const ownerName = d.owner?.name ?? d.request.owner?.name ?? null;
    return {
      id: d.id,
      status: d.status,
      requestId: d.request.id,
      title: d.request.title,
      tier: d.request.tier,
      eventStartMs: d.request.eventStart.getTime(),
      productionDueAtMs: d.productionDueAt ? d.productionDueAt.getTime() : null,
      nextScheduledAtMs: d.touches[0]?.scheduledAt.getTime() ?? null,
      channelName: d.channel.name,
      channelKey: d.channel.key,
      channelColor: d.channel.color,
      ministries: d.request.ministries.map((m) => ({ name: m.name, color: m.color })),
      ownerId,
      ownerName,
      explicitOwner: d.ownerId != null,
      eventOwnerId: d.request.ownerId,
      eventOwnerName: d.request.owner?.name ?? null,
    };
  });

  return (
    <PipelineBoard
      cards={cards}
      totalCurrent={totalCurrent}
      expiredHidden={Math.max(0, totalUnfinished - totalCurrent)}
      cap={BOARD_CAP}
      initialFilters={initialFilters}
      canEdit={canEdit}
      users={activeUsers}
    />
  );
}
