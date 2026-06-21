"use server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { parseDateInput } from "@/lib/engine/dates";
import { suggestStarterArc, type ChannelCopyMap, type ChannelCopyEntry } from "@/lib/updates";
import { revalidatePath } from "next/cache";

const TITLE_CAP = 200;
const BODY_CAP = 4000;
const COPY_CAP = 2000;

// The kinds we accept from the form. Anything else is dropped to null so a
// stray value can't poison the data; the UI only ever sends these.
const KINDS = new Set([
  "save_the_date",
  "register",
  "reminder",
  "last_call",
  "day_of",
  "follow_up",
  "logistics",
  "adhoc",
]);

/** Normalize a form field to a trimmed string, treating empty as null. */
function readField(fd: FormData, name: string): string | null {
  const raw = fd.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Revalidate the surfaces that show event updates. */
function revalidateUpdate(requestId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
}

/**
 * Assemble the per-channel copy map from the form. The UI names per-channel
 * inputs `copy_<channelKey>_content` and `copy_<channelKey>_asset`; we discover
 * the keys from a hidden `channelKeys` CSV so we only read channels that were
 * actually rendered. An entry is kept only when it carries content or an asset
 * link; an asset link, when present, must be a URL. Returns null when nothing
 * was set (so the column stays NULL rather than `{}`).
 */
function readChannelCopy(fd: FormData): ChannelCopyMap | null {
  const keysRaw = readField(fd, "channelKeys");
  if (!keysRaw) return null;
  const keys = keysRaw.split(",").map((k) => k.trim()).filter(Boolean);

  const map: ChannelCopyMap = {};
  for (const key of keys) {
    const content = readField(fd, `copy_${key}_content`)?.slice(0, COPY_CAP) ?? undefined;
    const assetLink = readField(fd, `copy_${key}_asset`) ?? undefined;
    if (assetLink !== undefined && !/^https?:\/\//i.test(assetLink)) {
      throw new Error("Per-channel asset link must start with http:// or https://");
    }
    if (content === undefined && assetLink === undefined) continue;
    const entry: ChannelCopyEntry = {};
    if (content !== undefined) entry.content = content;
    if (assetLink !== undefined) entry.assetLink = assetLink;
    map[key] = entry;
  }
  return Object.keys(map).length ? map : null;
}

/** Read + validate the shared fields used by create and update. */
function readUpdateFields(fd: FormData) {
  const dateStr = readField(fd, "scheduledFor");
  const scheduledFor = dateStr ? parseDateInput(dateStr) : null;
  if (!scheduledFor) throw new Error("A valid date is required");

  const title = readField(fd, "title")?.slice(0, TITLE_CAP);
  if (!title) throw new Error("A phase title is required");

  const kindRaw = readField(fd, "kind");
  const kind = kindRaw && KINDS.has(kindRaw) ? kindRaw : null;

  const body = readField(fd, "body")?.slice(0, BODY_CAP) ?? null;
  const channelCopy = readChannelCopy(fd);

  return { scheduledFor, title, kind, body, channelCopy };
}

/**
 * Create a new message-arc phase for an event. `scheduledFor` (date) and
 * `title` are required; `kind`, `body`, and per-channel `channelCopy` are
 * optional. Status defaults to "planned".
 */
export async function createUpdate(requestId: string, fd: FormData) {
  const user = await requireEditor();
  const { scheduledFor, title, kind, body, channelCopy } = readUpdateFields(fd);

  const update = await db.eventUpdate.create({
    data: {
      requestId,
      scheduledFor,
      title,
      kind,
      body,
      channelCopy: channelCopy ?? undefined,
      status: "planned",
    },
    select: { id: true },
  });
  await logRequestActivity(
    {
      requestId,
      action: "message_update_created",
      summary: `Message phase added: ${title}`,
      metadata: { updateId: update.id, scheduledFor: scheduledFor.toISOString(), kind },
    },
    user,
  );

  revalidateUpdate(requestId);
}

/**
 * Edit an existing phase's fields (date, title, kind, body, per-channel copy).
 * Looks up the parent requestId for revalidation. channelCopy is fully
 * replaced from the submitted form (null clears it).
 */
export async function updateUpdate(id: string, fd: FormData) {
  const user = await requireEditor();
  const { scheduledFor, title, kind, body, channelCopy } = readUpdateFields(fd);

  const row = await db.eventUpdate.update({
    where: { id },
    data: {
      scheduledFor,
      title,
      kind,
      body,
      // Prisma needs a JsonNull sentinel (not raw null) to clear a nullable
      // Json column; an object sets it.
      channelCopy: channelCopy ?? Prisma.JsonNull,
    },
    select: { requestId: true },
  });
  await logRequestActivity(
    {
      requestId: row.requestId,
      action: "message_update_updated",
      summary: `Message phase updated: ${title}`,
      metadata: { updateId: id, scheduledFor: scheduledFor.toISOString(), kind },
    },
    user,
  );

  revalidateUpdate(row.requestId);
}

/** Toggle a phase between "planned" and "done". */
export async function setUpdateStatus(id: string, status: string) {
  const user = await requireEditor();
  if (status !== "planned" && status !== "done") {
    throw new Error("Status must be 'planned' or 'done'");
  }
  const row = await db.eventUpdate.update({
    where: { id },
    data: { status },
    select: { requestId: true, title: true },
  });
  await logRequestActivity(
    {
      requestId: row.requestId,
      action: "message_update_status_changed",
      summary: `${row.title} marked ${status}`,
      metadata: { updateId: id, status },
    },
    user,
  );
  revalidateUpdate(row.requestId);
}

/** Delete a phase. */
export async function deleteUpdate(id: string) {
  const user = await requireEditor();
  const row = await db.eventUpdate.delete({
    where: { id },
    select: { requestId: true, title: true },
  });
  await logRequestActivity(
    {
      requestId: row.requestId,
      action: "message_update_deleted",
      summary: `Message phase deleted: ${row.title}`,
      metadata: { updateId: id },
    },
    user,
  );
  revalidateUpdate(row.requestId);
}

/**
 * Pre-fill the standard message arc for an event from its date (and
 * registration close, if any). No-op when the event already has updates, so the
 * button is safe to press more than once. Creates the phases with ascending
 * sortOrder so same-day ties keep their proposed order.
 */
export async function applyStarterArc(requestId: string) {
  const user = await requireEditor();

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      eventStart: true,
      registrationClosesAt: true,
      _count: { select: { updates: true } },
    },
  });
  if (!request) throw new Error("Event not found");
  if (request._count.updates > 0) return; // already has an arc — leave it alone

  const phases = suggestStarterArc(request.eventStart, request.registrationClosesAt);

  await db.eventUpdate.createMany({
    data: phases.map((p, i) => ({
      requestId,
      scheduledFor: p.scheduledFor,
      title: p.title,
      kind: p.kind,
      status: "planned",
      sortOrder: i,
    })),
  });
  await logRequestActivity(
    {
      requestId,
      action: "message_arc_applied",
      summary: `Starter message arc applied with ${phases.length} phase${phases.length === 1 ? "" : "s"}`,
      metadata: { phases: phases.map((p) => ({ title: p.title, kind: p.kind, scheduledFor: p.scheduledFor.toISOString() })) },
    },
    user,
  );

  revalidateUpdate(requestId);
}
