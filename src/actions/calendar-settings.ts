"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { normalizeExternalCalendarInput } from "@/lib/calendar-settings";

export async function saveExternalCalendarUrl(fd: FormData): Promise<void> {
  await requireAdmin();
  const externalCalendarUrl =
    fd.get("intent") === "clear" ? null : normalizeExternalCalendarInput(fd.get("externalCalendarUrl"));

  await db.setting.upsert({
    where: { id: 1 },
    update: { externalCalendarUrl },
    create: { id: 1, externalCalendarUrl },
  });

  revalidatePath("/settings/connections");
  revalidatePath("/import/google");
  revalidatePath("/import/ical");
  revalidatePath("/import/planning-center");
}
