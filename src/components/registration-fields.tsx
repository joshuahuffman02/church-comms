"use client";
import { useState } from "react";

/**
 * The intake form's Registration block. Progressive disclosure: the link / cost
 * / closing-date fields stay hidden until the requester says the event needs
 * sign-ups, so most requests see a shorter, calmer form. Field `name`s are
 * unchanged, so submitted data is identical to before.
 */
export function RegistrationFields() {
  const [needs, setNeeds] = useState(false);
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-bold text-muted mb-1">Registration</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          name="needsRegistration"
          type="checkbox"
          checked={needs}
          onChange={(e) => setNeeds(e.target.checked)}
          className="h-4 w-4 rounded"
        />
        <span>This event needs sign-ups</span>
      </label>
      {needs && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-muted">Registration link</span>
              <input
                name="registrationUrl"
                type="url"
                placeholder="https://church.org/vbs"
                className="rounded-2xl border px-4 py-2"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-muted">Cost</span>
              <input
                name="cost"
                placeholder="Free / $10"
                className="rounded-2xl border px-4 py-2"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-sm text-muted">Registration closes</span>
            <input name="registrationClosesAt" type="date" className="rounded-2xl border px-4 py-2" />
          </label>
        </div>
      )}
    </fieldset>
  );
}
