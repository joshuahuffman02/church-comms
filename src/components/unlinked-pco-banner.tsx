import { db } from "@/lib/db";
import { pcoConfigured, fetchApprovedUpcomingPcoEvents } from "@/lib/pco";
import { UnlinkedPcoBannerView } from "@/components/unlinked-pco-banner-view";

/**
 * Streams in above the Events table: how many APPROVED Planning Center events
 * have no local Request behind them yet (i.e. aren't imported/linked). It's the
 * mirror of the per-row "no PCO" badge — that flags local events with no PCO
 * event; this flags PCO events with no local event.
 *
 * Read-only and resilient: when PCO is unconfigured or unreachable, or when
 * everything's already imported, it renders nothing so the Events page is never
 * blocked or broken by a PCO hiccup. Meant to be wrapped in <Suspense> so the
 * table paints immediately and this fills in when the PCO call returns.
 */
export async function UnlinkedPcoBanner() {
  if (!pcoConfigured()) return null;

  let count = 0;
  try {
    const approved = await fetchApprovedUpcomingPcoEvents();
    if (approved.length === 0) return null;

    // Which of those approved PCO ids already have a local Request? Anything not
    // in that set is an approved event we haven't imported yet.
    const ids = approved.map((e) => e.pcoEventId);
    const linked = await db.request.findMany({
      where: { pcoEventId: { in: ids } },
      select: { pcoEventId: true },
    });
    const linkedIds = new Set(linked.map((r) => r.pcoEventId));
    count = approved.filter((e) => !linkedIds.has(e.pcoEventId)).length;
  } catch {
    // PCO unreachable / credential gap — stay quiet, don't disturb the table.
    return null;
  }

  if (count === 0) return null;
  return <UnlinkedPcoBannerView count={count} />;
}
