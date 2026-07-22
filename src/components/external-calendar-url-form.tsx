"use client";

import { useState } from "react";
import { saveExternalCalendarUrl } from "@/actions/calendar-settings";

type Props = {
  configured: boolean;
  canClear?: boolean;
  className?: string;
  buttonLabel?: string;
};

export function ExternalCalendarUrlForm({
  configured,
  canClear = false,
  className = "",
  buttonLabel = "Save feed address",
}: Props) {
  const [editing, setEditing] = useState(!configured);

  if (configured && !editing) {
    return (
      <div className={`grid gap-3 ${className}`}>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span aria-hidden className="text-emerald-600">●</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-emerald-900">Calendar feed address saved</div>
            <div className="text-xs text-emerald-800">•••••••••••••••• · kept hidden for security</div>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800">
            Replace
          </button>
        </div>
        {canClear && (
          <form action={saveExternalCalendarUrl}>
            <button
              type="submit"
              name="intent"
              value="clear"
              formNoValidate
              onClick={(event) => {
                if (!window.confirm("Disconnect this calendar feed? Imported events will stay in Church Comms.")) event.preventDefault();
              }}
              className="text-xs font-semibold text-rose-700 hover:underline"
            >
              Disconnect feed
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <form action={saveExternalCalendarUrl} className={`grid gap-3 ${className}`}>
      <label className="grid gap-1">
        <span className="text-sm font-semibold text-muted">Secret or public iCal feed address</span>
        <input
          name="externalCalendarUrl"
          type="url"
          inputMode="url"
          autoComplete="off"
          required
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          className="w-full rounded-2xl border px-4 py-2 text-sm"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white">{buttonLabel}</button>
        {configured && <button type="button" onClick={() => setEditing(false)} className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg">Cancel</button>}
      </div>
      <p className="text-xs text-muted">
        Use Google Calendar&apos;s secret iCal address, a public <code className="font-mono">.ics</code> URL, or a <code className="font-mono">webcal://</code> link. The saved address is never displayed again.
      </p>
    </form>
  );
}
