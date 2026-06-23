"use server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { parseDateInput } from "@/lib/engine/dates";
import { redirect } from "next/navigation";

// PUBLIC, unauthenticated endpoint — every field below is untrusted input.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export async function submitIntake(fd: FormData) {
  const title = str(fd, "title", 200);
  const requesterEmail = str(fd, "requesterEmail", 320);
  const eventStartRaw = String(fd.get("eventStart") ?? "").trim();
  // Parse YYYY-MM-DD as church-local midnight (no UTC off-by-one).
  const eventStart = parseDateInput(eventStartRaw);

  // Validate untrusted input; on failure bounce back to the form (no raw 500).
  if (
    !title ||
    !requesterEmail ||
    !EMAIL_RE.test(requesterEmail) ||
    !eventStart
  ) {
    redirect("/submit?error=1");
  }

  const whoIsItForRaw = String(fd.get("whoIsItFor") ?? "whole_church");
  const whoIsItFor = whoIsItForRaw in tierFor ? whoIsItForRaw : "ministry";
  const tier = tierFor[whoIsItFor] ?? 2;

  const requesterName = str(fd, "requesterName", 200);
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
  await db.request.create({
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
      notes: composedNotes || null,
      requesterName: requesterName || null,
      requesterEmail,
      statusToken,
      status: "submitted",
      // NO deliverables — planning happens at approval/triage.
    },
  });

  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/status/${encodeURIComponent(statusToken)}`;
  const safeName = esc(requesterName || "there");
  const safeTitle = esc(title);
  await sendEmail({
    to: requesterEmail,
    subject: "Got it — we received your request",
    html: `<p>Hi ${safeName},</p><p>Thanks! We received your communication request <b>${safeTitle}</b>. The comms team reviews new requests Mon &amp; Thu.</p><p><a href="${link}">Track its status here</a>.</p>`,
  });

  redirect("/status/" + statusToken + "?new=1");
}
