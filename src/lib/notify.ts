import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { REQUEST_STATUS_META } from "@/lib/status";

const NOTIFY_ON = new Set(["approved", "scheduled", "published", "needs_info", "declined"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Escape user-controlled values before placing them in email HTML. */
function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function notifyRequester(requestId: string, status: string) {
  if (!NOTIFY_ON.has(status)) return;
  const req = await db.request.findUnique({ where: { id: requestId } });
  const to = req?.requesterEmail;
  if (!req || !to || !EMAIL_RE.test(to)) return;
  const label = REQUEST_STATUS_META[status]?.label ?? status;
  const link = req.statusToken
    ? `${process.env.APP_URL ?? "http://localhost:3000"}/status/${encodeURIComponent(req.statusToken)}`
    : "";
  const name = esc(req.requesterName ?? "there");
  const title = esc(req.title);
  await sendEmail({
    to,
    subject: `Your request "${req.title}" is now ${label}`,
    html: `<p>Hi ${name},</p><p>Your communication request <b>${title}</b> is now <b>${esc(label)}</b>.</p>${link ? `<p><a href="${link}">Track it here</a>.</p>` : ""}`,
  });
}

/**
 * Email an approver that a request is waiting on their approval. No-ops unless
 * the approver has a valid email. The link points at the request detail page
 * where they can Approve/Reject.
 */
export async function notifyApprover(
  approverId: string,
  requestId: string,
  ruleName: string
) {
  const [approver, req] = await Promise.all([
    db.user.findUnique({ where: { id: approverId } }),
    db.request.findUnique({ where: { id: requestId } }),
  ]);
  const to = approver?.email;
  if (!approver || !req || !to || !EMAIL_RE.test(to)) return;
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${base}/requests/${encodeURIComponent(req.id)}`;
  const name = esc(approver.name ?? "there");
  const title = esc(req.title);
  await sendEmail({
    to,
    subject: `Approval needed: "${req.title}"`,
    html: `<p>Hi ${name},</p><p>The request <b>${title}</b> needs your approval (rule: <b>${esc(ruleName)}</b>).</p><p><a href="${link}">Review it here</a>.</p>`,
  });
}
