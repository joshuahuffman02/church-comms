"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import {
  nextRequestStatus,
  REQUEST_STATUSES,
  REQUEST_SIDE_STATUSES,
  DELIVERABLE_STATUSES,
} from "@/lib/status";
import { generateDeliverablesForRequest } from "@/lib/plan-service";
import { notifyRequester, notifyApprover } from "@/lib/notify";
import { requestNeedsApproval } from "@/lib/approvals";
import { logRequestActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";

const VALID_REQUEST_STATUSES = new Set<string>([...REQUEST_STATUSES, ...REQUEST_SIDE_STATUSES]);
const VALID_DELIVERABLE_STATUSES = new Set<string>([...DELIVERABLE_STATUSES]);

export async function setRequestStatus(id: string, status: string) {
  const user = await requireEditor();
  if (!VALID_REQUEST_STATUSES.has(status)) throw new Error("Invalid status");
  const existing = await db.request.findUnique({
    where: { id },
    select: { status: true, title: true },
  });
  if (!existing) throw new Error("Request not found");

  // Approval routing: moving to "approved" first checks configurable rules.
  // With no active rules this is dormant (empty) and behavior is unchanged.
  // We never throw here so a kanban drop just snaps back if approval is needed.
  if (status === "approved") {
    const unmet = await requestNeedsApproval(id);
    if (unmet.length > 0) {
      for (const { rule, approval } of unmet) {
        // Create a pending Approval only if one isn't already outstanding.
        if (!approval || approval.status === "rejected") {
          await db.approval.create({
            data: { requestId: id, ruleId: rule.id, status: "pending" },
          });
        }
        if (rule.approverId) {
          await notifyApprover(rule.approverId, id, rule.name);
        }
      }
      // Do NOT change status or generate deliverables — the detail page now
      // shows the pending approvals; a kanban drop simply snaps back.
      await logRequestActivity(
        {
          requestId: id,
          action: "approval_requested",
          summary: `Approval requested for ${existing.title}`,
          metadata: {
            fromStatus: existing.status,
            attemptedStatus: status,
            rules: unmet.map(({ rule }) => rule.name),
          },
        },
        user,
      );
      revalidatePath(`/requests/${id}`);
      revalidatePath("/requests");
      revalidatePath("/pipeline");
      revalidatePath("/this-week");
      revalidatePath("/guardrails");
      return;
    }
  }

  await db.request.update({ where: { id }, data: { status } });
  const generated = status === "approved" ? await generateDeliverablesForRequest(id) : 0;
  await logRequestActivity(
    {
      requestId: id,
      action: "request_status_changed",
      summary: `Status changed from ${existing.status} to ${status}`,
      metadata: { fromStatus: existing.status, toStatus: status, generatedDeliverables: generated },
    },
    user,
  );
  await notifyRequester(id, status);
  revalidatePath(`/requests/${id}`); revalidatePath("/requests"); revalidatePath("/pipeline"); revalidatePath("/this-week");
}

export async function advanceRequestStatus(id: string) {
  await requireEditor();
  const req = await db.request.findUnique({ where: { id } });
  if (!req) return;
  const next = nextRequestStatus(req.status);
  if (next) await setRequestStatus(id, next);
}

export async function setDeliverableStatus(deliverableId: string, status: string) {
  const user = await requireEditor();
  if (!VALID_DELIVERABLE_STATUSES.has(status)) throw new Error("Invalid status");
  const before = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { status: true, channel: { select: { name: true } }, requestId: true },
  });
  if (!before) throw new Error("Deliverable not found");
  const d = await db.deliverable.update({ where: { id: deliverableId }, data: { status }, select: { requestId: true } });
  await logRequestActivity(
    {
      requestId: d.requestId,
      action: "deliverable_status_changed",
      summary: `${before.channel.name} changed from ${before.status} to ${status}`,
      metadata: { deliverableId, channelName: before.channel.name, fromStatus: before.status, toStatus: status },
    },
    user,
  );
  revalidatePath(`/requests/${d.requestId}`); revalidatePath("/this-week"); revalidatePath("/pipeline");
}
