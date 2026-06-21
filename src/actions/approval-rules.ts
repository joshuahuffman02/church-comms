"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { APPROVAL_CONDITION_TYPES } from "@/lib/approval-conditions";

const NAME_CAP = 120;
const VALUE_CAP = 120;

const VALID_TYPES = new Set<string>(APPROVAL_CONDITION_TYPES);

/**
 * Create an ApprovalRule. Only the `channel` condition uses conditionValue (a
 * channel key); for the rest it's stored as null. Bounces back with `?error=1`
 * on a missing name or unknown condition type. Auth-guarded.
 */
export async function createApprovalRule(fd: FormData) {
  await requireAdmin();

  const name = String(fd.get("name") ?? "").trim().slice(0, NAME_CAP);
  const conditionType = String(fd.get("conditionType") ?? "").trim();
  const rawValue = String(fd.get("conditionValue") ?? "").trim().slice(0, VALUE_CAP);
  const approverId = String(fd.get("approverId") ?? "").trim();
  const active = fd.get("active") === "on";

  if (!name || !VALID_TYPES.has(conditionType)) {
    redirect("/settings/approvals?error=1");
  }
  // conditionValue is only meaningful for the channel condition.
  const conditionValue = conditionType === "channel" ? rawValue || null : null;
  if (conditionType === "channel" && !conditionValue) {
    redirect("/settings/approvals?error=1");
  }

  await db.approvalRule.create({
    data: {
      name,
      conditionType,
      conditionValue,
      approverId: approverId || null,
      active,
    },
  });

  revalidatePath("/settings/approvals");
  redirect("/settings/approvals");
}

/** Flip a rule's active flag (the activate/deactivate toggle). Auth-guarded. */
export async function toggleApprovalRule(id: string) {
  await requireAdmin();
  const rule = await db.approvalRule.findUnique({ where: { id } });
  if (!rule) return;
  await db.approvalRule.update({ where: { id }, data: { active: !rule.active } });
  revalidatePath("/settings/approvals");
}

/** Delete a rule. Auth-guarded. */
export async function deleteApprovalRule(id: string) {
  await requireAdmin();
  await db.approvalRule.delete({ where: { id } });
  revalidatePath("/settings/approvals");
}
