"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { parseDateInput, subDays } from "@/lib/engine/dates";
import { revalidatePath } from "next/cache";

/** Read a form field as a trimmed string, or undefined when blank. */
function optStr(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

/**
 * Shape the date placement for a deliverable on a channel of a given type.
 * - windowed: the whole window collapses to the single chosen day (start = end
 *   = the publish date), so the one touch lives inside its own window.
 * - dated_instance: the day itself is the instance.
 * - one_shot: no window/instance — just the touch on the day.
 * In every case the single touch is scheduled on `date`, which is what the
 * Outputs/This-Week/calendar views read.
 */
function placementFor(
  type: string,
  date: Date
): { instanceDate: Date | null; windowStart: Date | null; windowEnd: Date | null } {
  if (type === "dated_instance") {
    return { instanceDate: date, windowStart: null, windowEnd: null };
  }
  if (type === "windowed") {
    return { instanceDate: null, windowStart: date, windowEnd: date };
  }
  // one_shot (or anything else): leave the placement columns null.
  return { instanceDate: null, windowStart: null, windowEnd: null };
}

/**
 * Create a "Quick Item" — a standalone channel task that isn't a full event
 * (e.g. "Website: bold Easter service times"). Modeled as its own minimal,
 * already-approved Request marked with a `__quick__` sentinel in notes, carrying
 * exactly one Deliverable on the chosen channel and one Touch on the chosen date.
 * Because it's a normal Deliverable/Touch it flows through the same Outputs,
 * This-Week, and calendar views as everything else.
 *
 * Fields: title (required), channelId (required), date (required), optional
 * assetLink + note.
 */
export async function createQuickItem(fd: FormData) {
  const user = await requireEditor();

  const title = optStr(fd, "title");
  const channelId = optStr(fd, "channelId");
  const date = parseDateInput(String(fd.get("date") ?? ""));
  // Bail without mutating if any required field is missing/invalid.
  if (!title || !channelId || !date) return;

  const assetLink = optStr(fd, "assetLink");
  const note = optStr(fd, "note");

  const channel = await db.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const productionDueAt = subDays(date, channel.productionLeadDays);
  const placement = placementFor(channel.type, date);

  // Quick items are leadership-facing tier-3 standalone things; the human-
  // readable text is the Request title (so it surfaces nicely) and is also
  // mirrored onto the Deliverable.notes + the single Touch's content.
  const request = await db.request.create({
    data: {
      title,
      status: "approved",
      tier: 3,
      whoIsItFor: "leadership",
      notes: "__quick__",
      eventStart: date,
      deliverables: {
        create: {
          channelId,
          status: "to_design",
          productionDueAt,
          instanceDate: placement.instanceDate,
          windowStart: placement.windowStart,
          windowEnd: placement.windowEnd,
          notes: title,
          assetLink: assetLink ?? null,
          touches: {
            create: {
              channelId,
              scheduledAt: date,
              purposeLabel: "quick",
              content: title,
              assetLink: assetLink ?? null,
              note: note ?? null,
            },
          },
        },
      },
    },
    select: { id: true },
  });
  await logRequestActivity(
    {
      requestId: request.id,
      action: "quick_item_created",
      summary: `Quick item created for ${channel.name}`,
      metadata: { channelId, channelName: channel.name, date: date.toISOString(), assetLink },
    },
    user,
  );

  revalidatePath("/outputs");
  revalidatePath(`/outputs/${channel.key}`);
  revalidatePath("/this-week");
  revalidatePath("/calendar");
  revalidatePath("/requests");
}

/**
 * Manually attach a channel/output to an EXISTING event, creating a Deliverable
 * (+ one Touch on the chosen date) even when the auto-scheduler didn't include
 * that channel — e.g. the Opportunities Table (tierEligibility []) or an extra
 * Loop week. Tier eligibility is deliberately bypassed: this is a manual
 * override by staff.
 *
 * Fields: channelId (required), date (required).
 */
export async function attachChannel(requestId: string, fd: FormData) {
  const user = await requireEditor();

  const channelId = optStr(fd, "channelId");
  const date = parseDateInput(String(fd.get("date") ?? ""));
  if (!channelId || !date) return;

  const [request, channel] = await Promise.all([
    db.request.findUnique({ where: { id: requestId }, select: { id: true } }),
    db.channel.findUnique({ where: { id: channelId } }),
  ]);
  if (!request) throw new Error("Request not found");
  if (!channel) throw new Error("Channel not found");

  const productionDueAt = subDays(date, channel.productionLeadDays);
  const placement = placementFor(channel.type, date);

  const deliverable = await db.deliverable.create({
    data: {
      requestId,
      channelId,
      status: "to_design",
      productionDueAt,
      instanceDate: placement.instanceDate,
      windowStart: placement.windowStart,
      windowEnd: placement.windowEnd,
      touches: {
        create: {
          channelId,
          scheduledAt: date,
          purposeLabel: phaseHint(),
        },
      },
    },
    select: { id: true },
  });
  await logRequestActivity(
    {
      requestId,
      action: "deliverable_attached",
      summary: `${channel.name} manually added`,
      metadata: { deliverableId: deliverable.id, channelId, channelName: channel.name, date: date.toISOString() },
    },
    user,
  );

  revalidatePath(`/requests/${requestId}`);
  revalidatePath(`/requests/${requestId}/attach`);
  revalidatePath("/outputs");
  revalidatePath(`/outputs/${channel.key}`);
  revalidatePath("/this-week");
}

/** A neutral purpose label for manually attached touches. */
function phaseHint(): string {
  return "added";
}
