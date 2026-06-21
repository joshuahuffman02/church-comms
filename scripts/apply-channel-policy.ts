import "dotenv/config";
import { db } from "../src/lib/db";
import { PROMOTABLE_REQUEST_STATUSES } from "../src/lib/status";

/**
 * One-off, idempotent channel-policy migration (run with `npx tsx`):
 *
 *  1. Cap Facebook & Instagram at 6 events/week (frequencyCap = 6) so the feed
 *     stops piling up every eligible event — the weekly curation surfaces the
 *     top 6 by tier + soonest date, the rest are held.
 *  2. Make the Outdoor Banner opt-in only: tierEligibility = [] means the
 *     auto-scheduler never adds it (the same convention the Opportunities Table
 *     uses). Staff add a banner per event via "+ Add output".
 *  3. Let Announcement Video Top 3 auto-fill from tier 2 when tier 1 has fewer
 *     than three approved/promotable candidates.
 *  4. Remove the banner's existing auto-added deliverables (cascades their
 *     touches) — none were ever explicitly chosen, so it's a clean slate.
 *  5. Remove any announcement-video deliverables on non-promotable requests so
 *     draft/submitted imports don't block full planning when later approved.
 *
 * Safe to re-run: the cap set is idempotent, tierEligibility [] is idempotent,
 * and once the banner deliverables are gone the delete is a no-op.
 */
const SOCIAL_CAP = 6;
const VIDEO_TOP3_TIERS = [1, 2];

async function main() {
  const video = await db.channel.findUnique({
    where: { key: "announcement_video" },
    select: { id: true },
  });
  if (!video) {
    console.log("announcement_video: no such channel — skipping tier-2 fill policy");
  } else {
    await db.channel.update({
      where: { id: video.id },
      data: { tierEligibility: VIDEO_TOP3_TIERS, capacity: 3 },
    });
    const stale = await db.deliverable.deleteMany({
      where: {
        channelId: video.id,
        request: { status: { notIn: PROMOTABLE_REQUEST_STATUSES } },
      },
    });
    console.log(
      `announcement_video: tierEligibility = [${VIDEO_TOP3_TIERS.join(",")}], capacity = 3; ` +
        `removed ${stale.count} non-promotable deliverables`,
    );
  }

  for (const key of ["facebook", "instagram"]) {
    const res = await db.channel.updateMany({
      where: { key },
      data: { frequencyCap: SOCIAL_CAP },
    });
    console.log(`${key}: frequencyCap = ${SOCIAL_CAP} (${res.count} row)`);
  }

  const banner = await db.channel.findUnique({
    where: { key: "banner" },
    select: { id: true },
  });
  if (!banner) {
    console.log("banner: no such channel — skipping opt-in/cleanup");
  } else {
    const toRemove = await db.deliverable.count({ where: { channelId: banner.id } });
    // Deliverable → Touch is onDelete: Cascade, so this clears their touches too.
    await db.deliverable.deleteMany({ where: { channelId: banner.id } });
    await db.channel.update({
      where: { id: banner.id },
      data: { tierEligibility: [] },
    });
    console.log(
      `banner: opt-in only (tierEligibility = []); removed ${toRemove} auto-added deliverables`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
