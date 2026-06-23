import { db } from "@/lib/db";

/**
 * The manual announcement-video "Top 3" picks for one Sunday — the human
 * curation (VideoTop3Item) that is the source of truth for what's FEATURED on
 * that Sunday's video. Shared by the exports, the announcement-video output
 * page, and the Heads-up guardrail so all three agree with the board.
 */
export type SundayTop3Pick = {
  sortOrder: number;
  requestId: string | null;
  label: string | null;
  request: {
    id: string;
    title: string;
    tier: number;
    nextStepText: string | null;
    description: string | null;
  } | null;
};

/** Load a Sunday's Top-3 picks in display (1-2-3) order, with the picked event resolved. */
export async function loadSundayTop3(sunday: Date): Promise<SundayTop3Pick[]> {
  return db.videoTop3Item.findMany({
    where: { sunday },
    orderBy: { sortOrder: "asc" },
    select: {
      sortOrder: true,
      requestId: true,
      label: true,
      request: { select: { id: true, title: true, tier: true, nextStepText: true, description: true } },
    },
  });
}

/** The picked event ids, in pick order (label-only awareness items have no id). */
export function pickedRequestIds(picks: SundayTop3Pick[]): string[] {
  return picks.filter((p): p is SundayTop3Pick & { requestId: string } => !!p.requestId).map((p) => p.requestId);
}
