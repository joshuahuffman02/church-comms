"use client";
import { useState } from "react";
import { createSeries } from "@/actions/recurring";

const WEEKDAYS = [
  { v: 0, label: "Sunday" },
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" },
];

/**
 * Create-a-series form. Client component so the weekly (weekday) vs monthly
 * (day-of-month) fields can swap based on the chosen frequency. Submits to the
 * `createSeries` server action, which validates + generates the first batch.
 */
export function SeriesForm({ ministries }: { ministries: { id: string; name: string }[] }) {
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const field = "rounded-2xl border px-4 py-2";

  return (
    <form action={createSeries} className="grid gap-3">
      <input name="title" required placeholder="Series title (e.g. Tuesday Talks)" className={field} />
      <textarea name="description" placeholder="Optional description" className={field} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm text-muted">
          Ministry
          <select name="ministryId" className={field} defaultValue="">
            <option value="">— None —</option>
            {ministries.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-muted">
          Who is it for?
          <select name="whoIsItFor" className={field} defaultValue="whole_church">
            <option value="whole_church">Whole church</option>
            <option value="ministry">A specific ministry</option>
            <option value="small_group">A small group / team</option>
            <option value="leadership">Leadership</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm text-muted">
          Frequency
          <select
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as "weekly" | "monthly")}
            className={field}
          >
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm text-muted">
          Every
          <div className="flex items-center gap-2">
            <input
              name="interval"
              type="number"
              min={1}
              max={52}
              defaultValue={1}
              className={`${field} w-20`}
            />
            <span className="text-sm text-muted">{frequency === "weekly" ? "week(s)" : "month(s)"}</span>
          </div>
        </label>
        {frequency === "weekly" ? (
          <label className="grid gap-1 text-sm text-muted">
            On weekday
            <select name="weekday" className={field} defaultValue="">
              <option value="">(use start date&apos;s day)</option>
              {WEEKDAYS.map((w) => (
                <option key={w.v} value={w.v}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="grid gap-1 text-sm text-muted">
            On day of month
            <input
              name="dayOfMonth"
              type="number"
              min={1}
              max={31}
              placeholder="(use start date)"
              className={field}
            />
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm text-muted">
          Start date
          <input name="startDate" type="date" required className={field} />
        </label>
        <label className="grid gap-1 text-sm text-muted">
          End date (optional)
          <input name="untilDate" type="date" className={field} />
          <span className="text-xs text-muted">
            Leave blank to run until you end it (open-ended).
          </span>
        </label>
      </div>

      <input name="location" placeholder="Location (optional)" className={field} />
      <input name="nextStepText" placeholder="One next step (optional)" className={field} />

      <button className="rounded-full bg-ink text-white py-2 px-6 font-semibold w-fit">
        Create series &amp; generate →
      </button>
    </form>
  );
}
