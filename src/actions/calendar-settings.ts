"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { normalizeExternalCalendarInput } from "@/lib/calendar-settings";

export async function saveExternalCalendarUrl(fd: FormData): Promise<void> {
  await requireAdmin();
  const clearing = fd.get("intent") === "clear";
  const externalCalendarUrl = clearing ? null : normalizeExternalCalendarInput(fd.get("externalCalendarUrl"));
  if (!clearing && !externalCalendarUrl) throw new Error("Enter a calendar feed address.");

  await db.setting.upsert({
    where: { id: 1 },
    update: { externalCalendarUrl },
    create: { id: 1, externalCalendarUrl },
  });

  revalidatePath("/settings/connections");
  revalidatePath("/imports");
  revalidatePath("/import/google");
  revalidatePath("/import/ical");
  revalidatePath("/import/planning-center");
}
