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
  return {
    q: firstParam(params.q),
    status: firstParam(params.status) || "all",
    tier: firstParam(params.tier) || "all",
    ministry: firstParam(params.ministry) || "all",
    pco: firstParam(params.pco) || "all",
    includePast: firstParam(params.past) === "1",
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
  const [requests, hiddenPastCount] = await Promise.all([
    db.request.findMany({
      where: initialFilters.includePast ? undefined : { eventStart: { gte: today } },
      include: {
        // Full ministry set (all equal), ordered for stable dot rendering.
        ministries: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        deliverables: true,
      },
      orderBy: { eventStart: "asc" },
    }),
    db.request.count({ where: { eventStart: { lt: today } } }),
  ]);

  const rows: RequestRow[] = requests.map((r) => {
    const upcomingDue = r.deliverables
      .map((d) => d.productionDueAt)
      .filter((d): d is Date => d !== null && atMidnight(d) >= today)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      tier: r.tier,
      ministries: r.ministries.map((m) => ({ name: m.name, color: m.color })),
      eventStartMs: r.eventStart.getTime(),
      nextProductionDueMs: upcomingDue ? upcomingDue.getTime() : null,
      location: r.location,
      isSeries: r.seriesId !== null,
      pcoLinked: r.pcoEventId !== null,
      hasTags: Array.isArray(r.pcoTags) && r.pcoTags.length > 0,
      noPromo: r.noPromo,
    };
  });

  return (
    <>
      {/* Streams in once the live PCO check returns; renders nothing when PCO
          is unconfigured/unreachable or everything's already imported. Width-
          matched to the table below. */}
      <div className="max-w-5xl">
        <Suspense fallback={null}>
          <UnlinkedPcoBanner />
        </Suspense>
      </div>
      <RequestsTable
        rows={rows}
        initialFilters={initialFilters}
        hiddenPastCount={hiddenPastCount}
        canEdit={canEdit}
      />
    </>
  );
}
