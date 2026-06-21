import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { PipelineBoard, type DeliverableCard, type PipelineFilters } from "@/components/pipeline-board";

/** How many deliverables to render at most. The board defaults to the active
 * production work (not published/skipped, request not cancelled), so this cap
 * is a generous ceiling rather than a routine truncation. */
const BOARD_CAP = 200;

function initialsOf(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function pipelineFiltersFromParams(params: SearchParams): PipelineFilters {
  return {
    q: firstParam(params.q),
    channel: firstParam(params.channel),
    owner: firstParam(params.owner),
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
  // ACTIVE production work only: the board is for things still in flight, so we
  // exclude finished (published) and dropped (skipped) deliverables, and any
  // deliverable whose parent request has been cancelled.
  const where = {
    status: { notIn: ["published", "skipped"] },
    request: { is: { status: { not: "cancelled" } } },
  };

  const totalActive = await db.deliverable.count({ where });

  const deliverables = await db.deliverable.findMany({
    where,
    // soonest make-by first; deliverables with no due date sort to the end.
    orderBy: [{ productionDueAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    take: BOARD_CAP,
    select: {
      id: true,
      status: true,
      productionDueAt: true,
      channel: { select: { name: true, color: true } },
      owner: { select: { name: true } },
      request: {
        select: {
          id: true,
          title: true,
          tier: true,
          eventStart: true,
          ministries: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: { name: true, color: true },
          },
        },
      },
    },
  });

  const cards: DeliverableCard[] = deliverables.map((d) => ({
    id: d.id,
    status: d.status,
    requestId: d.request.id,
    title: d.request.title,
    tier: d.request.tier,
    eventStartMs: d.request.eventStart.getTime(),
    productionDueAtMs: d.productionDueAt ? d.productionDueAt.getTime() : null,
    channelName: d.channel.name,
    channelColor: d.channel.color,
    ministries: d.request.ministries.map((m) => ({ name: m.name, color: m.color })),
    ownerName: d.owner?.name ?? null,
    ownerInitials: initialsOf(d.owner?.name),
  }));

  return (
    <PipelineBoard
      cards={cards}
      totalActive={totalActive}
      cap={BOARD_CAP}
      initialFilters={initialFilters}
      canEdit={canEdit}
    />
  );
}
