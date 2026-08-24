"use server";

import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/authz";
import { normalizeEmail } from "@/lib/pco-auth-profile";
import { logRequestActivity } from "@/lib/activity";
import { parseDateInput, atMidnight } from "@/lib/engine/dates";
import { replanRequest } from "@/lib/plan-service";
import { REQUESTER_EDIT_BLOCKED_STATUSES } from "@/lib/requester-portal";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const TIER_FOR: Record<string, number> = {
  whole_church: 1,
  ministry: 2,
  small_group: 3,
  leadership: 3,
};

function field(fd: FormData, key: string, max: number): string | null {
  const raw = fd.get(key);
  if (typeof raw !== "string") return null;
  const value = raw.trim().slice(0, max);
  return value || null;
}

function safeUrl(fd: FormData, key: string): string | null {
  const value = field(fd, key, 1000);
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

async function ownedRequest(id: string, user: SessionUser) {
  const request = await db.request.findUnique({
    where: { id },
    include: {
      deliverables: {
        select: {
          status: true,
          touches: { select: { status: true } },
        },
      },
    },
  });
  if (!request) throw new Error("Request not found");

  const emailMatch =
    request.requesterId == null &&
    request.requesterEmail != null &&
    request.pcoEventId == null &&
    request.externalCalendarKey == null &&
    user.email != null &&
    normalizeEmail(request.requesterEmail) === normalizeEmail(user.email);
  if (request.requesterId !== user.id && !emailMatch) {
    throw new Error("Forbidden");
  }
  if (emailMatch) {
    await db.request.update({
      where: { id },
      data: { requesterId: user.id },
    });
  }
  return request;
}

function refreshRequestSurfaces(id: string) {
  revalidatePath("/my-requests");
  revalidatePath(`/my-requests/${id}`);
  revalidatePath(`/requests/${id}`);
  revalidatePath("/requests");
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/pipeline");
  revalidatePath("/outputs");
  revalidatePath("/guardrails");
  revalidatePath("/assign");
}

/**
 * Requesters may improve public event facts, but never internal status,
 * assignments, channel selections, locks, or production notes. Schedule inputs
 * replan automatically while work is untouched; once production has started,
 * the existing placements are preserved and a visible review task is created.
 */
export async function updateMyRequest(id: string, fd: FormData) {
  const user = await requireUser();
  const existing = await ownedRequest(id, user);
  if (REQUESTER_EDIT_BLOCKED_STATUSES.has(existing.status)) {
    redirect(`/my-requests/${id}?error=closed`);
  }

  const title = field(fd, "title", 200);
  const eventStart = parseDateInput(String(fd.get("eventStart") ?? ""));
  if (!title || !eventStart) {
    redirect(`/my-requests/${id}/edit?error=required`);
  }

  const whoIsItForRaw = String(fd.get("whoIsItFor") ?? "whole_church");
  const whoIsItFor =
    whoIsItForRaw in TIER_FOR ? whoIsItForRaw : "ministry";
  const tier = TIER_FOR[whoIsItFor] ?? 2;
  const needsRegistration = fd.get("needsRegistration") != null;
  const registrationUrl = needsRegistration
    ? safeUrl(fd, "registrationUrl")
    : null;
  const registrationClosesAt = needsRegistration
    ? parseDateInput(String(fd.get("registrationClosesAt") ?? ""))
    : null;

  const dateChanged =
    existing.eventStart.getTime() !== eventStart.getTime();
  const audienceChanged =
    existing.whoIsItFor !== whoIsItFor || existing.tier !== tier;
  const registrationChanged =
    existing.needsRegistration !== needsRegistration ||
    existing.registrationUrl !== registrationUrl ||
    (existing.registrationClosesAt?.getTime() ?? null) !==
      (registrationClosesAt?.getTime() ?? null);
  const titleChanged = existing.title !== title;
  const scheduleChanged =
    dateChanged || audienceChanged || registrationChanged || titleChanged;

  await db.request.update({
    where: { id },
    data: {
      title,
      description: field(fd, "description", 5000),
      whoIsItFor,
      tier,
      eventStart,
      location: field(fd, "location", 500),
      needsRegistration,
      registrationUrl,
      registrationClosesAt,
      cost: needsRegistration ? field(fd, "cost", 200) : null,
      nextStepText: field(fd, "nextStepText", 500),
      nextStepUrl: safeUrl(fd, "nextStepUrl"),
      requesterNotes: field(fd, "requesterNotes", 5000),
      requesterName: user.name ?? existing.requesterName,
      requesterEmail: user.email ?? existing.requesterEmail,
      requesterId: user.id,
    },
  });

  const productionStarted = existing.deliverables.some(
    (deliverable) =>
      deliverable.status !== "to_design" ||
      deliverable.touches.some((touch) => touch.status !== "scheduled"),
  );
  let needsStaffReview = false;
  if (scheduleChanged && !productionStarted) {
    await replanRequest(id);
  } else if (scheduleChanged) {
    needsStaffReview = true;
    const openTask = await db.eventTask.findFirst({
      where: {
        requestId: id,
        source: "requester_change",
        status: "todo",
      },
      select: { id: true },
    });
    const notes =
      "The requester changed schedule-sensitive event details after production started. Review the event date, audience, registration information, and existing channel placements before marking this done.";
    if (openTask) {
      await db.eventTask.update({
        where: { id: openTask.id },
        data: { notes, dueAt: atMidnight(new Date()) },
      });
    } else {
      await db.eventTask.create({
        data: {
          requestId: id,
          title: "Review requester changes",
          notes,
          dueAt: atMidnight(new Date()),
          source: "requester_change",
          category: "Request update",
          sortOrder: -100,
        },
      });
    }
  }

  await logRequestActivity(
    {
      requestId: id,
      action: "requester_updated",
      summary: needsStaffReview
        ? "Requester updated event details; channel schedule needs review"
        : scheduleChanged
          ? "Requester updated event details and the tentative schedule was refreshed"
          : "Requester improved event details",
      metadata: {
        dateChanged,
        audienceChanged,
        registrationChanged,
        titleChanged,
        scheduleReplanned: scheduleChanged && !productionStarted,
        needsStaffReview,
      },
    },
    user,
  );

  refreshRequestSurfaces(id);
  redirect(
    `/my-requests/${id}?saved=${needsStaffReview ? "review" : "1"}`,
  );
}
