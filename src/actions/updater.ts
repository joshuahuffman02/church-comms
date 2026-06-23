"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/authz";
import { getUpdateStatus, runProductionUpdateScript } from "@/lib/updater";

export async function checkForUpdatesAction() {
  await requireAdmin();

  return getUpdateStatus({ fetch: true });
}

export async function runProductionUpdateAction() {
  await requireAdmin();

  const result = await runProductionUpdateScript();
  revalidatePath("/settings/updates");

  return result;
}
