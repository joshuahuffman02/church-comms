"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { parseDateInput, subDays } from "@/lib/engine/dates";
import {
  parseQuickItemForm,
  quickItemProductionDueAt,
  type QuickItemFormState,
} from "@/lib/quick-items";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
 * ownerId, assetLink, and note. Invalid input returns field errors to the form;
 * a successful write redirects to the chosen channel with a success message.
 */
export async function createQuickItem(
  _previousState: QuickItemFormState,
  fd: FormData,
): Promise<QuickItemFormState> {
  const user = await requireEditor();
  const parsed = parseQuickItemForm(fd);
  if (!parsed.ok) return parsed.state;
  const input = parsed.value;

  const [channel, owner] = await Promise.all([
    db.channel.findFirst({ where: { id: input.channelId, active: true } }),
    input.ownerId
      ? db.user.findFirst({ where: { id: input.ownerId, active: true }, select: { id: true, name: true } })
      : Promise.resolve(null),
  ]);
  if (!channel) {
    return {
      status: "error",
      message: "That channel is no longer available. Choose another channel.",
      fieldErrors: { channelId: "Choose an active channel." },
    };
  }
  if (input.ownerId && !owner) {
    return {
      status: "error",
      message: "That owner is no longer available. Choose someone else.",
      fieldErrors: { ownerId: "Choose an active person or leave this unassigned." },
    };
  }

  const productionDueAt = quickItemProductionDueAt(
    input.date,
    channel.productionLeadDays,
  );
  const placement = placementFor(channel.type, input.date);

  // Quick items are leadership-facing tier-3 standalone things; the human-
  // readable text is the Request title (so it surfaces nicely) and is also
  // mirrored onto the Deliverable.notes + the single Touch's content.
  const request = await db.request.create({
    data: {
      title: input.title,
      status: "approved",
      tier: 3,
      whoIsItFor: "leadership",
      notes: "__quick__",
      eventStart: input.date,
      requesterId: user.id,
      ownerId: owner?.id ?? null,
      deliverables: {
        create: {
          channelId: channel.id,
          status: "to_design",
          productionDueAt,
          instanceDate: placement.instanceDate,
          windowStart: placement.windowStart,
          windowEnd: placement.windowEnd,
          notes: input.title,
          assetLink: input.assetLink,
          ownerId: owner?.id ?? null,
          touches: {
            create: {
              channelId: channel.id,
              scheduledAt: input.date,
              purposeLabel: "quick",
              content: input.title,
              assetLink: input.assetLink,
              note: input.note,
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
      metadata: {
        channelId: channel.id,
        channelName: channel.name,
        date: `${input.date.getFullYear()}-${String(input.date.getMonth() + 1).padStart(2, "0")}-${String(input.date.getDate()).padStart(2, "0")}`,
        assetLink: input.assetLink ?? undefined,
        ownerId: owner?.id ?? undefined,
        ownerName: owner?.name ?? undefined,
      },
    },
    user,
  );

  revalidatePath("/outputs");
  revalidatePath(`/outputs/${channel.key}`);
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/requests");
  revalidatePath("/guardrails");

  redirect(`/outputs/${channel.key}?created=${request.id}`);
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

  // Manual placement is intentionally idempotent. The same event/date/channel
  // can be submitted from the event page, Assign, or the channel page; those
  // paths should converge on one appearance instead of quietly creating
  // duplicate rows.
  const existingTouch = await db.touch.findFirst({
    where: {
      channelId,
      scheduledAt: date,
      deliverable: { requestId },
    },
    select: { id: true },
  });
  if (existingTouch) return;

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
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/guardrails");
  revalidatePath("/assign");
}

/** A neutral purpose label for manually attached touches. */
function phaseHint(): string {
  return "added";
}
