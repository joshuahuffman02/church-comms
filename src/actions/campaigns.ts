"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { parseDateInput } from "@/lib/engine/dates";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const NAME_CAP = 120;

/**
 * Start a Sprint (time-boxed campaign that suspends the volume guardrails).
 * Auth-guarded. Validates name + a valid date range, else bounces back with
 * `?error=1`. Suspends guardrails by default.
 */
export async function createSprint(fd: FormData) {
  await requireAdmin();

  const name = String(fd.get("name") ?? "").trim().slice(0, NAME_CAP);
  const startsAt = parseDateInput(String(fd.get("startsAt") ?? ""));
  const endsAt = parseDateInput(String(fd.get("endsAt") ?? ""));

  if (!name || !startsAt || !endsAt || endsAt < startsAt) {
    redirect("/settings/sprints?error=1");
  }

  await db.campaign.create({
    data: { name, startsAt, endsAt, suspendsGuardrails: true },
  });

  revalidatePath("/settings/sprints");
  redirect("/settings/sprints");
}

/**
 * End (delete) a Sprint so it's no longer active. Deleting is the clearest way
 * to make it stop suspending guardrails and to free up the annual quota line.
 * Auth-guarded.
 */
export async function endSprint(id: string) {
  await requireAdmin();

  await db.campaign.delete({ where: { id } });
  revalidatePath("/settings/sprints");
}
