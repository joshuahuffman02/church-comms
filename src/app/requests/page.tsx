import { Suspense } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { atMidnight } from "@/lib/engine/dates";
import { isEditor } from "@/lib/roles";
import { RequestsTable, type RequestFilters, type RequestRow } from "@/components/requests-table";
import { UnlinkedPcoBanner } from "@/components/unlinked-pco-banner";

// The unlinked-PCO banner does live PCO network I/O, so render per request.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function requestFiltersFromParams(params: SearchParams): RequestFilters {
  const legacyPco = firstParam(params.pco);
  const requestedView = firstParam(params.view);
  return {
    q: firstParam(params.q),
    status: firstParam(params.status) || (requestedView === "archive" || firstParam(params.past) === "1" ? "all" : "active"),
    tier: firstParam(params.tier) || "all",
    ministry: firstParam(params.ministry) || "all",
    source: firstParam(params.source) || (legacyPco === "linked" ? "pco" : "all"),
    view: firstParam(params.past) === "1" ? "archive" : requestedView || "focus",
  };
}

export default async function RequestsIndex({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const initialFilters = requestFiltersFromParams(await searchParams);
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const canEdit = isEditor(user.roles);
  const today = atMidnight(new Date());
  const requests = await db.request.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      tier: true,
      eventStart: true,
      location: true,
      pcoEventId: true,
      externalCalendarKey: true,
      noPromo: true,
      needsRegistration: true,
      seriesId: true,
      owner: { select: { name: true } },
      ministries: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { name: true, color: true },
      },
      deliverables: {
        select: {
          channelId: true,
          status: true,
          productionDueAt: true,
          touches: {
            where: { scheduledAt: { gte: today } },
            select: { scheduledAt: true, status: true },
          },
        },
      },
    },
    orderBy: [{ eventStart: "asc" }, { title: "asc" }],
  });

  const rows: RequestRow[] = requests.map((r) => {
    const unfinished = r.deliverables.filter((d) => d.status !== "skipped" && d.status !== "published");
    const nextDue = unfinished
      .map((d) => d.productionDueAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const nextScheduled = r.deliverables
      .flatMap((d) => d.touches)
      .filter((touch) => touch.status !== "skipped")
      .map((touch) => touch.scheduledAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const plannedChannelCount = new Set(
      r.deliverables
        .filter((d) => d.status !== "skipped" && (d.productionDueAt !== null || d.touches.length > 0))
        .map((d) => d.channelId),
    ).size;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      tier: r.tier,
      ministries: r.ministries.map((m) => ({ name: m.name, color: m.color })),
      eventStartMs: r.eventStart.getTime(),
      nextProductionDueMs: nextDue ? nextDue.getTime() : null,
      nextScheduledAtMs: nextScheduled ? nextScheduled.getTime() : null,
      plannedChannelCount,
      location: r.location,
      noPromo: r.noPromo,
      needsRegistration: r.needsRegistration,
      ownerName: r.owner?.name ?? null,
      source: r.externalCalendarKey !== null ? "calendar" : r.pcoEventId !== null ? "pco" : "local",
      seriesId: r.seriesId,
    };
  });

  return (
    <>
      {/* Streams in once the live PCO check returns; renders nothing when PCO
          is unconfigured/unreachable or everything's already imported. Width-
          matched to the table below. */}
      <div className="mb-4 max-w-6xl">
        <Suspense fallback={null}>
          <UnlinkedPcoBanner />
        </Suspense>
      </div>
      <RequestsTable
        rows={rows}
        initialFilters={initialFilters}
        canEdit={canEdit}
      />
    </>
  );
}
