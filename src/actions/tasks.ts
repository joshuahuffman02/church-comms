"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";

/**
 * Task ownership, lightweight proof sign-off, and asset/art attachment.
 *
 * All actions are editor-gated. Ownership is a plain FK set/cleared; "proof"
 * and "ready" reuse the existing Deliverable status vocabulary as a minimal
 * sign-off surface (no new state machine). Assets are LINKS only — a URL plus a
 * label — there's no file-upload infrastructure.
 */

const URL_RE = /^https?:\/\//i;
const LABEL_CAP = 200;

/** Normalize a form field to a trimmed string; empty becomes null. */
function readField(fd: FormData, name: string): string | null {
  const raw = fd.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Revalidate every surface that shows ownership / tasks / assets for a request. */
function revalidateTaskSurfaces(requestId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my-tasks");
  revalidatePath("/this-week");
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/** Assign (or clear, with "") the request-level owner. Cascades as the default
 *  effective owner for every deliverable without its own owner. */
export async function assignRequestOwner(requestId: string, fd: FormData) {
  const user = await requireEditor();
  const userId = readField(fd, "userId"); // "" / missing → unassign
  await db.request.update({ where: { id: requestId }, data: { ownerId: userId } });
  await logRequestActivity(
    {
      requestId,
      action: "request_owner_changed",
      summary: userId ? "Event owner assigned" : "Event owner cleared",
      metadata: { ownerId: userId },
    },
    user,
  );
  revalidateTaskSurfaces(requestId);
}

/** Assign (or clear, with "") the owner of a single deliverable (channel). */
export async function assignDeliverableOwner(deliverableId: string, fd: FormData) {
  const user = await requireEditor();
  const userId = readField(fd, "userId"); // "" / missing → unassign
  const d = await db.deliverable.update({
    where: { id: deliverableId },
    data: { ownerId: userId },
    select: { requestId: true, channel: { select: { name: true } } },
  });
  await logRequestActivity(
    {
      requestId: d.requestId,
      action: "deliverable_owner_changed",
      summary: userId ? `${d.channel.name} owner assigned` : `${d.channel.name} owner cleared`,
      metadata: { deliverableId, channelName: d.channel.name, ownerId: userId },
    },
    user,
  );
  revalidateTaskSurfaces(d.requestId);
}

/** One-click "I'll take this": assign the current user as the deliverable owner. */
export async function claimDeliverable(deliverableId: string) {
  const me = await requireEditor();
  const d = await db.deliverable.update({
    where: { id: deliverableId },
    data: { ownerId: me.id },
    select: { requestId: true, channel: { select: { name: true } } },
  });
  await logRequestActivity(
    {
      requestId: d.requestId,
      action: "deliverable_claimed",
      summary: `${d.channel.name} claimed`,
      metadata: { deliverableId, channelName: d.channel.name, ownerId: me.id },
    },
    me,
  );
  revalidateTaskSurfaces(d.requestId);
}

// ---------------------------------------------------------------------------
// Proof sign-off (reuses the existing Deliverable status vocabulary)
// ---------------------------------------------------------------------------

/** Send a deliverable to proof for review. */
export async function sendToProof(deliverableId: string) {
  const user = await requireEditor();
  const d = await db.deliverable.update({
    where: { id: deliverableId },
    data: { status: "proof" },
    select: { requestId: true, channel: { select: { name: true } } },
  });
  await logRequestActivity(
    {
      requestId: d.requestId,
      action: "deliverable_sent_to_proof",
      summary: `${d.channel.name} sent to proof`,
      metadata: { deliverableId, channelName: d.channel.name },
    },
    user,
  );
  revalidateTaskSurfaces(d.requestId);
}

/** Approve a proofed deliverable → "ready". */
export async function approveProof(deliverableId: string) {
  const user = await requireEditor();
  const d = await db.deliverable.update({
    where: { id: deliverableId },
    data: { status: "ready" },
    select: { requestId: true, channel: { select: { name: true } } },
  });
  await logRequestActivity(
    {
      requestId: d.requestId,
      action: "deliverable_proof_approved",
      summary: `${d.channel.name} proof approved`,
      metadata: { deliverableId, channelName: d.channel.name },
    },
    user,
  );
  revalidateTaskSurfaces(d.requestId);
}

// ---------------------------------------------------------------------------
// Assets / finished art (links only)
// ---------------------------------------------------------------------------

/** Attach a link asset (Canva/Drive/finished art) to a request. */
export async function attachAssetLink(requestId: string, fd: FormData) {
  const user = await requireEditor();
  const url = readField(fd, "url");
  if (!url || !URL_RE.test(url)) {
    throw new Error("Asset link must start with http:// or https://");
  }
  const label = readField(fd, "label")?.slice(0, LABEL_CAP) ?? null;
  const isFinal = fd.get("isFinal") === "on" || fd.get("isFinal") === "true";

  await db.asset.create({
    data: { requestId, kind: "link", url, filename: label, isFinal },
  });
  await logRequestActivity(
    {
      requestId,
      action: "asset_attached",
      summary: label ? `Attached asset: ${label}` : "Attached asset link",
      metadata: { url, label, isFinal },
    },
    user,
  );
  revalidateTaskSurfaces(requestId);
}

/** Remove an asset. */
export async function removeAsset(assetId: string) {
  const user = await requireEditor();
  const a = await db.asset.delete({
    where: { id: assetId },
    select: { requestId: true, filename: true, url: true },
  });
  await logRequestActivity(
    {
      requestId: a.requestId,
      action: "asset_removed",
      summary: a.filename ? `Removed asset: ${a.filename}` : "Removed asset link",
      metadata: { assetId, url: a.url, label: a.filename },
    },
    user,
  );
  revalidateTaskSurfaces(a.requestId);
}

/** Set (or clear, with "") the main art link on a single deliverable. */
export async function setDeliverableAssetLink(deliverableId: string, fd: FormData) {
  const user = await requireEditor();
  const assetLink = readField(fd, "assetLink");
  if (assetLink !== null && !URL_RE.test(assetLink)) {
    throw new Error("Art link must start with http:// or https://");
  }
  const d = await db.deliverable.update({
    where: { id: deliverableId },
    data: { assetLink },
    select: { requestId: true, channel: { select: { name: true } } },
  });
  await logRequestActivity(
    {
      requestId: d.requestId,
      action: "deliverable_asset_link_changed",
      summary: assetLink ? `${d.channel.name} art link set` : `${d.channel.name} art link cleared`,
      metadata: { deliverableId, channelName: d.channel.name, assetLink },
    },
    user,
  );
  revalidateTaskSurfaces(d.requestId);
}
