"use server";

import { attachChannel } from "@/actions/quick-items";
import { addTop3Item } from "@/actions/video-top3";
import { requireEditor } from "@/lib/authz";
import { db } from "@/lib/db";
import { parseDateInput } from "@/lib/engine/dates";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";

export type OutputLineupActionState = {
  ok: boolean;
  message: string;
} | null;

/** Add one approved event to one channel date from the channel page. */
export async function addEventToOutput(
  _previous: OutputLineupActionState,
  formData: FormData,
): Promise<OutputLineupActionState> {
  await requireEditor();

  const requestId = String(formData.get("requestId") ?? "").trim();
  const channelId = String(formData.get("channelId") ?? "").trim();
  const date = parseDateInput(String(formData.get("date") ?? ""));
  if (!requestId || !channelId || !date) {
    return { ok: false, message: "Choose an event and an appearance date." };
  }

  const [request, channel, existing] = await Promise.all([
    db.request.findUnique({
      where: { id: requestId },
      select: { title: true, status: true, noPromo: true },
    }),
    db.channel.findUnique({ where: { id: channelId }, select: { name: true } }),
    db.touch.findFirst({
      where: { channelId, scheduledAt: date, deliverable: { requestId } },
      select: { id: true },
    }),
  ]);

  if (!request || request.noPromo || !PROMOTABLE_REQUEST_STATUSES.includes(request.status)) {
    return { ok: false, message: "Only approved, promotable events can be added." };
  }
  if (!channel) return { ok: false, message: "That channel is no longer available." };
  if (existing) {
    return { ok: true, message: `${request.title} is already on ${channel.name} for that date.` };
  }

  await attachChannel(requestId, formData);
  return { ok: true, message: `${request.title} was added to ${channel.name}.` };
}

/** Add, feature, and protect one event on a chosen Announcement Video Sunday. */
export async function addEventToAnnouncementVideo(
  _previous: OutputLineupActionState,
  formData: FormData,
): Promise<OutputLineupActionState> {
  await requireEditor();

  const requestId = String(formData.get("requestId") ?? "").trim();
  const sunday = parseDateInput(String(formData.get("date") ?? ""));
  if (!requestId || !sunday) {
    return { ok: false, message: "Choose an event and the Sunday it should air." };
  }
  if (sunday.getDay() !== 0) {
    return { ok: false, message: "Announcement Video lineups must use a Sunday date." };
  }

  const request = await db.request.findUnique({
    where: { id: requestId },
    select: { title: true },
  });
  if (!request) return { ok: false, message: "That event is no longer available." };

  const top3Form = new FormData();
  top3Form.set("requestId", requestId);
  top3Form.set("sunday", sunday.toISOString());
  try {
    await addTop3Item(top3Form);
    return { ok: true, message: `${request.title} was added and protected on that Sunday.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The video lineup could not be updated.",
    };
  }
}
