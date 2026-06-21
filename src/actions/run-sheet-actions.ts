"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { revalidatePath } from "next/cache";

/**
 * Check / uncheck one run-sheet line. A line is a Touch (one weekly appearance
 * on a channel); "done" maps to the touch's own status — published when checked,
 * scheduled when not. This is per-week-per-channel, so checking off the loop
 * slide for one Sunday doesn't affect the same event's other weeks/channels.
 */
export async function setTouchDone(touchId: string, done: boolean) {
  await requireEditor();
  await db.touch.update({
    where: { id: touchId },
    data: { status: done ? "published" : "scheduled" },
  });
  revalidatePath("/run-sheet");
  revalidatePath("/outputs");
}
