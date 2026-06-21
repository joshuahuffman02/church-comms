"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { weekRange } from "@/lib/week";
import { revalidatePath } from "next/cache";

/**
 * Toggle a standing weekly chore's completion for THE CURRENT WEEK. Completion is
 * tracked per (task, weekStart) so the chore resets every Monday. The week is
 * computed server-side from "now" so the client only sends the task id (mirrors
 * `toggleTask` for event tasks). See `src/actions/playbooks.ts`.
 */
export async function toggleStandingTask(taskId: string) {
  await requireEditor();
  const { start } = weekRange(new Date());
  const existing = await db.standingTaskCompletion.findUnique({
    where: { taskId_weekStart: { taskId, weekStart: start } },
  });
  if (existing) {
    await db.standingTaskCompletion.delete({ where: { id: existing.id } });
  } else {
    await db.standingTaskCompletion.create({ data: { taskId, weekStart: start } });
  }
  revalidatePath("/this-week");
}
