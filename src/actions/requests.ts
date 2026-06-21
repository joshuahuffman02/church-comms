"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { planEvent, toPrismaDeliverables } from "@/lib/engine/persist";
import { parseDateInput } from "@/lib/engine/dates";
import { ministryCreateData, ministryIdsFromForm } from "@/lib/ministries";
import { activeChannelConfig, planningInputForRequest } from "@/lib/plan-service";
import { redirect } from "next/navigation";

const tierFor: Record<string, number> = { whole_church: 1, ministry: 2, small_group: 3, leadership: 3 };
const TITLE_CAP = 200;
const DESCRIPTION_CAP = 5000;
const NEXT_STEP_CAP = 500;

function readField(fd: FormData, key: string, max: number): string | null {
  const raw = fd.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, max);
  return trimmed ? trimmed : null;
}

export async function createRequest(fd: FormData) {
  const user = await requireEditor();
  const title = readField(fd, "title", TITLE_CAP);
  if (!title) return;
  const whoIsItFor = String(fd.get("whoIsItFor") || "whole_church");
  const tier = tierFor[whoIsItFor] ?? 2;
  const eventStart = parseDateInput(String(fd.get("eventStart") ?? ""));
  if (!eventStart) return;
  const registrationClosesAt = parseDateInput(String(fd.get("registrationClosesAt") ?? ""));
  const needsRegistration = fd.get("needsRegistration") != null;
  const { cfg, idByKey } = await activeChannelConfig();
  const plan = planEvent(
    planningInputForRequest({ eventStart, registrationClosesAt, tier }),
    cfg,
    new Date(),
  );
  // All selected ministries (all equal) → the m-n source of truth; the legacy
  // ministryId is kept in sync (= the first selected) by the shared helper.
  const ministryIds = ministryIdsFromForm(fd);
  const request = await db.request.create({
    data: {
      title,
      description: readField(fd, "description", DESCRIPTION_CAP),
      whoIsItFor, tier, eventStart,
      needsRegistration,
      registrationClosesAt,
      nextStepText: readField(fd, "nextStep", NEXT_STEP_CAP),
      status: "approved",
      ...ministryCreateData(ministryIds),
      deliverables: { create: toPrismaDeliverables(plan, idByKey) },
    },
    select: { id: true },
  });
  await logRequestActivity(
    {
      requestId: request.id,
      action: "request_created",
      summary: `Created and scheduled ${title}`,
      metadata: { tier, deliverables: plan.length, source: "staff" },
    },
    user,
  );
  redirect("/this-week");
}
