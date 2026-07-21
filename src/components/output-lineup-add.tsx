"use client";

import { useActionState, useId } from "react";
import {
  addEventToAnnouncementVideo,
  addEventToOutput,
  type OutputLineupActionState,
} from "@/actions/output-lineup";

type EventOption = { id: string; label: string };

export function OutputLineupAdd({
  channelId,
  channelName,
  announcementVideo,
  defaultDate,
  options,
}: {
  channelId: string;
  channelName: string;
  announcementVideo: boolean;
  defaultDate: string;
  options: EventOption[];
}) {
  const eventId = useId();
  const dateId = useId();
  const [state, action, pending] = useActionState<OutputLineupActionState, FormData>(
    announcementVideo ? addEventToAnnouncementVideo : addEventToOutput,
    null,
  );

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="channelId" value={channelId} />
      <div>
        <h2 className="font-bold text-ink">Add an event</h2>
        <p className="mt-1 text-xs text-muted">
          {announcementVideo
            ? "Choose the Sunday it should air. Adding it here also features and protects its slot."
            : `Choose the exact date this event should appear on ${channelName}.`}
        </p>
      </div>
      <label htmlFor={eventId} className="grid gap-1 text-xs font-semibold text-ink">
        Event
        <select
          id={eventId}
          name="requestId"
          required
          defaultValue=""
          className="min-h-11 min-w-0 rounded-2xl border px-3 py-2 text-sm font-normal"
        >
          <option value="" disabled>Choose an upcoming event</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <label htmlFor={dateId} className="grid gap-1 text-xs font-semibold text-ink">
        {announcementVideo ? "Sunday airing" : "Appearance date"}
        <input
          id={dateId}
          name="date"
          type="date"
          required
          defaultValue={defaultDate}
          className="min-h-11 rounded-2xl border px-3 py-2 text-sm font-normal"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || options.length === 0}
          className="btn-primary min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Adding…" : announcementVideo ? "Add to lineup" : "Add to channel"}
        </button>
        {state && (
          <span
            role={state.ok ? "status" : "alert"}
            className={`text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
