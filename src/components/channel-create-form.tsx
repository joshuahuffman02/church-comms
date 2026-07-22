"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2, Plus, Save } from "lucide-react";
import { createChannel, type ChannelActionState } from "@/actions/channels";
import { tierLabel } from "@/lib/labels";

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const initialState: ChannelActionState = { ok: false };

export function ChannelCreateForm() {
  const [state, action, pending] = useActionState(createChannel, initialState);
  const [type, setType] = useState("windowed");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;
    formRef.current?.reset();
    setType("windowed");
  }, [state.ok, state.savedAt]);

  return (
    <details className="card-float group overflow-hidden">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:content-none">
        <span className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-sky-700">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-extrabold text-ink">Add a new channel</span>
            <span className="mt-0.5 block text-xs text-muted">Create another place where events can be promoted.</span>
          </span>
        </span>
        <span className="text-sm font-bold text-sky-700 group-open:hidden">Open form</span>
        <span className="hidden text-sm font-bold text-sky-700 group-open:inline">Close</span>
      </summary>

      <div className="border-t border-slate-100 bg-white/45 px-5 py-5">
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          A new channel starts active. Saving it immediately rebuilds eligible upcoming events so the new channel appears without a manual sync.
        </div>

        <form ref={formRef} action={action} className="grid gap-6">
          <section>
            <h3 className="text-sm font-extrabold text-ink">Channel identity</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_8rem]">
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Name
                <input name="name" required placeholder="e.g. Instagram" className="min-h-11 rounded-2xl border px-3 py-2 font-normal" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                How it appears
                <select name="type" value={type} onChange={(event) => setType(event.target.value)} className="min-h-11 rounded-2xl border px-3 py-2 font-normal">
                  <option value="windowed">Runs over a span of days</option>
                  <option value="single_weekday">Once, on a set weekday</option>
                  <option value="dated_instance">Happens once on a date</option>
                  <option value="one_shot">Sent once</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Color
                <input name="color" type="color" defaultValue="#93c5fd" className="h-11 w-full rounded-2xl border bg-white p-1" />
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-extrabold text-ink">Timing and capacity</h3>
            <p className="mt-1 text-xs text-muted">Set when promotion begins, then how long production has before that first appearance.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Start promoting
                <span className="flex min-h-11 items-center gap-2 rounded-2xl border bg-white px-3">
                  <input name="offset" type="number" min={0} defaultValue={14} className="w-16 bg-transparent font-normal outline-none" />
                  <span className="text-xs font-normal text-muted">days before event</span>
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Production lead time
                <span className="flex min-h-11 items-center gap-2 rounded-2xl border bg-white px-3">
                  <input name="lead" type="number" min={0} defaultValue={7} className="w-16 bg-transparent font-normal outline-none" />
                  <span className="text-xs font-normal text-muted">days before launch</span>
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Capacity
                <input name="capacity" type="number" min={1} placeholder="No limit" className="min-h-11 rounded-2xl border px-3 py-2 font-normal" />
              </label>
            </div>
          </section>

          {(type === "windowed" || type === "single_weekday") && (
            <fieldset>
              <legend className="text-sm font-extrabold text-ink">Posting days</legend>
              <p className="mt-1 text-xs text-muted">Choose the days this channel can use inside its promotion window.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {WEEKDAYS.map((day) => (
                  <label key={day.value} className="cursor-pointer rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-sky-50">
                    <input type="checkbox" name="weekday" value={day.value} defaultChecked={day.value === 0} className="mr-2 accent-sky-600" />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend className="text-sm font-extrabold text-ink">Eligible event sizes</legend>
            <p className="mt-1 text-xs text-muted">All three are included by default; narrow this only when the channel has a specific audience.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {[1, 2, 3].map((tier) => (
                <label key={tier} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" name="tier" value={tier} defaultChecked className="h-4 w-4 accent-sky-600" />
                  {tierLabel(tier)}
                </label>
              ))}
            </div>
          </fieldset>

          {state.error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{state.error}</p>}
          {state.ok && state.savedAt && (
            <p role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Channel added and upcoming schedules updated.
            </p>
          )}

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
              <Save className="h-4 w-4" aria-hidden="true" /> {pending ? "Adding and rebuilding…" : "Add channel and update schedule"}
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}
