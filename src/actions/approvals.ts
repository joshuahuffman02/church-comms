"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { generateDeliverablesForRequest } from "@/lib/plan-service";
import { notifyRequester } from "@/lib/notify";
import { requestNeedsApproval } from "@/lib/approvals";
import { revalidatePath } from "next/cache";

const NOTE_CAP = 500;

function revalidateApproval(requestId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/pipeline");
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/outputs");
  revalidatePath("/guardrails");
  revalidatePath("/assign");
}

/**
 * Approve a single pending Approval as the current (logged-in) user. In solo
 * mode roles aren't enforced, so any session may decide; when the rule names an
 * approver we record the deciding user's id either way. Once approving closes
 * the last outstanding rule, the request auto-approves (status + deliverables +
 * requester notice). Never throws on the happy path so the UI stays stable.
 */
export async function approveAsApprover(approvalId: string) {
  const user = await requireEditor();
  const userId = user.id;

  const approval = await db.approval.findUnique({
    where: { id: approvalId },
    include: { rule: true },
  });
  if (!approval) return;
  if (approval.status === "approved") return;

  await db.approval.update({
    where: { id: approvalId },
    data: { status: "approved", approverId: userId ?? null, decidedAt: new Date() },
  });

  const requestId = approval.requestId;
  await logRequestActivity(
    {
      requestId,
      action: "approval_approved",
      summary: `Approved ${approval.rule?.name ?? "approval"}`,
      metadata: { approvalId, ruleName: approval.rule?.name ?? null },
    },
    user,
  );

  // If nothing else is outstanding, auto-approve the request now.
  const stillUnmet = await requestNeedsApproval(requestId);
  if (stillUnmet.length === 0) {
    await db.request.update({ where: { id: requestId }, data: { status: "approved" } });
    const generated = await generateDeliverablesForRequest(requestId);
    await notifyRequester(requestId, "approved");
    await logRequestActivity(
      {
        requestId,
        action: "request_status_changed",
        summary: "All approvals cleared; request auto-approved",
        metadata: { toStatus: "approved", generatedDeliverables: generated },
      },
      user,
    );
  }

  revalidateApproval(requestId);
}

/**
 * Reject a pending Approval (records an optional note), bounces the request to
 * `needs_info`, and notifies the requester. Auth-guarded.
 */
export async function rejectApproval(approvalId: string, note?: string) {
  const user = await requireEditor();
  const userId = user.id;

  const approval = await db.approval.findUnique({ where: { id: approvalId } });
  if (!approval) return;

  await db.approval.update({
    where: { id: approvalId },
    data: {
      status: "rejected",
      approverId: userId ?? null,
      decidedAt: new Date(),
      note: note ? note.slice(0, NOTE_CAP) : null,
    },
  });

  const requestId = approval.requestId;
  await db.request.update({ where: { id: requestId }, data: { status: "needs_info" } });
  await notifyRequester(requestId, "needs_info");
  await logRequestActivity(
    {
      requestId,
      action: "approval_rejected",
      summary: "Approval rejected; request moved to needs info",
      metadata: { approvalId, note: note ? note.slice(0, NOTE_CAP) : null },
    },
    user,
  );

  revalidateApproval(requestId);
}
