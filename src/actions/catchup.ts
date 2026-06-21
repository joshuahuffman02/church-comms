"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { replanRequest } from "@/lib/plan-service";
import { revalidatePath } from "next/cache";

/**
 * Refresh every surface that shows scheduled work after a catch-up re-plan.
 * (Re-planning rewrites a request's deliverables + touches, so this touches the
 * same views as an event edit, plus the run sheet and the requests list.)
 */
function revalidateCatchUp() {
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/requests");
  revalidatePath("/outputs");
  revalidatePath("/guardrails");
}

/**
 * Re-plan the given requests in catch-up mode (schedule re-based to start from
 * today instead of being marked "skipped"). Reusable building block — does NOT
 * revalidate or authorize on its own. Returns the count re-planned.
 */
export async function catchUpRequests(ids: string[]): Promise<number> {
  const user = await requireEditor();
  let count = 0;
  for (const id of ids) {
    const generated = await replanRequest(id, { catchUp: true });
    await logRequestActivity(
      {
        requestId: id,
        action: "request_caught_up",
        summary: `Catch-up schedule rebuilt with ${generated} deliverable${generated === 1 ? "" : "s"}`,
        metadata: { generatedDeliverables: generated },
      },
      user,
    );
    count += 1;
  }
  return count;
}

/**
 * Bulk catch-up for events imported from PCO mid-stream. Targets every Request
 * that came from PCO (non-null `pcoEventId`) and currently has at least one
 * "skipped" deliverable — i.e. its promo window already started in the past so
 * the normal plan gave up. Each is re-planned in catch-up mode so its schedule
 * is re-based to start from today. Returns `{ count }` of requests re-planned.
 *
 * The controller runs this after review; it is the only entry point that
 * mutates live data.
 */
export async function catchUpImportedEvents(): Promise<{ count: number }> {
  const user = await requireEditor();

  const requests = await db.request.findMany({
    where: {
      pcoEventId: { not: null },
      deliverables: { some: { status: "skipped" } },
    },
    select: { id: true },
  });

  for (const { id } of requests) {
    const generated = await replanRequest(id, { catchUp: true });
    await logRequestActivity(
      {
        requestId: id,
        action: "request_caught_up",
        summary: `Imported event catch-up rebuilt with ${generated} deliverable${generated === 1 ? "" : "s"}`,
        metadata: { generatedDeliverables: generated },
      },
      user,
    );
  }

  revalidateCatchUp();
  return { count: requests.length };
}
