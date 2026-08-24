"use server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { parseDateInput } from "@/lib/engine/dates";
import { generateDeliverablesForRequest } from "@/lib/plan-service";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import type { SessionUser } from "@/lib/authz";

// PUBLIC, unauthenticated endpoint — every field below is untrusted input.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type IntakeFormState = {
  message: string;
  fieldErrors?: Partial<Record<"title" | "requesterEmail" | "eventStart", string>>;
};

type IntakeBasics = {
  title: string;
  requesterEmail: string;
  eventStart: Date | null;
};

// Tier is derived server-side from audience; NEVER accepted from the form.
const tierFor: Record<string, number> = {
  whole_church: 1,
  ministry: 2,
  small_group: 3,
  leadership: 3,
};

/** Escape user-controlled values before placing them in email HTML. */
function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Trim and cap an untrusted string field. */
function str(fd: FormData, key: string, max: number): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

function readBasics(fd: FormData, sessionUser: SessionUser | null): IntakeBasics {
  const title = str(fd, "title", 200);
  const requesterEmail =
    sessionUser?.email?.trim().toLowerCase() ??
    str(fd, "requesterEmail", 320).toLowerCase();
  const eventStartRaw = String(fd.get("eventStart") ?? "").trim();
  // Parse YYYY-MM-DD as church-local midnight (no UTC off-by-one).
  const eventStart = parseDateInput(eventStartRaw);
  return { title, requesterEmail, eventStart };
}

function validateBasics(basics: IntakeBasics): IntakeFormState | null {
  const fieldErrors: NonNullable<IntakeFormState["fieldErrors"]> = {};
  if (!basics.title) fieldErrors.title = "Add a short event title.";
  if (!basics.requesterEmail || !EMAIL_RE.test(basics.requesterEmail)) {
    fieldErrors.requesterEmail = "Enter a valid email address.";
  }
  if (!basics.eventStart) fieldErrors.eventStart = "Choose the event date.";

  if (Object.keys(fieldErrors).length === 0) return null;
  return {
    message: "A few details still need attention. Your draft is still here.",
    fieldErrors,
  };
}

async function createIntake(
  fd: FormData,
  sessionUser: SessionUser | null,
  basics: IntakeBasics,
): Promise<never> {
  const { title, requesterEmail, eventStart } = basics;
  if (!eventStart) throw new Error("Validated intake is missing an event date");
  const whoIsItForRaw = String(fd.get("whoIsItFor") ?? "whole_church");
  const whoIsItFor = whoIsItForRaw in tierFor ? whoIsItForRaw : "ministry";
  const tier = tierFor[whoIsItFor] ?? 2;

  const requesterName = sessionUser?.name ?? str(fd, "requesterName", 200);
  const description = str(fd, "description", 5000);
  const location = str(fd, "location", 500);
  const registrationUrl = str(fd, "registrationUrl", 1000);
  const cost = str(fd, "cost", 200);
  const nextStepText = str(fd, "nextStep", 500);
  const notes = str(fd, "notes", 5000);
  const ministryName = str(fd, "ministry", 200);

  const needsRegistration = String(fd.get("needsRegistration") ?? "") === "on";
  const registrationClosesAt = parseDateInput(String(fd.get("registrationClosesAt") ?? ""));

  // Fold the free-text ministry into notes so the team sees it without
  // accepting an arbitrary ministryId / relation from the public.
  const composedNotes = [
    ministryName ? `Ministry: ${ministryName}` : "",
    notes,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);

  const statusToken = crypto.randomUUID();

  // FORCE status server-side; do NOT accept status/tier/deliverables from form.
  const request = await db.request.create({
    data: {
      title,
      description: description || null,
      whoIsItFor,
      tier,
      eventStart,
      location: location || null,
      needsRegistration,
      registrationUrl: registrationUrl || null,
      cost: cost || null,
      registrationClosesAt,
      nextStepText: nextStepText || null,
      requesterNotes: composedNotes || null,
      requesterName: requesterName || null,
      requesterEmail,
      requesterId: sessionUser?.id ?? null,
      statusToken,
      status: "submitted",
      // The proposed schedule is generated below. Submitted requests stay
      // hidden from production surfaces until staff approves them.
    },
    select: { id: true },
  });
  await generateDeliverablesForRequest(request.id);
  await logRequestActivity(
    {
      requestId: request.id,
      action: "requester_created",
      summary: `${requesterName || "Requester"} submitted ${title}`,
      metadata: {
        source: sessionUser ? "staff_portal" : "public_form",
        tentativeScheduleGenerated: true,
      },
    },
    sessionUser,
  );

  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/status/${encodeURIComponent(statusToken)}`;
  const safeName = esc(requesterName || "there");
  const safeTitle = esc(title);
  await sendEmail({
    to: requesterEmail,
    subject: "Got it — we received your request",
    html: `<p>Hi ${safeName},</p><p>Thanks! We received your communication request <b>${safeTitle}</b>. The comms team reviews new requests Mon &amp; Thu.</p><p><a href="${link}">Track its status here</a>.</p>`,
  });

  if (sessionUser) {
    redirect(`/my-requests/${request.id}?new=1`);
  }
  redirect("/status/" + statusToken + "?new=1");
}

/** Legacy progressive-enhancement entrypoint retained for direct form posts. */
export async function submitIntake(fd: FormData) {
  const sessionUser = await getSessionUser();
  const basics = readBasics(fd, sessionUser);
  if (validateBasics(basics)) redirect("/submit?error=1");
  return createIntake(fd, sessionUser, basics);
}

/**
 * Guided-form entrypoint. Validation returns inline field errors; success still
 * redirects to the new request so no duplicate submission can occur.
 */
export async function submitIntakeWithState(
  _previous: IntakeFormState,
  fd: FormData,
): Promise<IntakeFormState> {
  const sessionUser = await getSessionUser();
  const basics = readBasics(fd, sessionUser);
  const invalid = validateBasics(basics);
  if (invalid) return invalid;
  return createIntake(fd, sessionUser, basics);
}
