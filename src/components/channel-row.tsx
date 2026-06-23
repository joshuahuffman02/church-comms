"use client";
import { useActionState, useState } from "react";
import { updateChannel, type ChannelActionState } from "@/actions/channels";
import { useSaveFlash, SavedTick } from "@/components/save-flash";
import { ChannelDeleteButton } from "@/components/channel-delete-button";
import { previewSchedule } from "@/lib/channel-preview";
import { parseDateInput, atMidnight } from "@/lib/engine/dates";
import { tierLabel } from "@/lib/labels";

export interface ChannelView {
  id: string;
  name: string;
  type: string;
  color: string;
  active: boolean;
  offset: number;
  lead: number;
  lockLeadDays: number | null;
  weekdays: number[];
  capacity: number | null;
  frequencyCap: number | null;
  tiers: number[];
  notes: string;
}

const WEEKDAYS = [
  { value: 0, label: "Su" }, { value: 1, label: "Mo" }, { value: 2, label: "Tu" },
  { value: 3, label: "We" }, { value: 4, label: "Th" }, { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
];
const TYPE_LABELS: Record<string, string> = {
  windowed: "Runs over a span of days",
  single_weekday: "Once, on a set weekday",
  dated_instance: "Happens once on a date",
  one_shot: "Sent once",
};
const initialState: ChannelActionState = { ok: false };
const num = (s: string) => (s.trim() === "" ? 0 : Number(s));
const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—";
const daysBefore = (event: Date, d: Date | null) =>
  d ? Math.round((event.getTime() - d.getTime()) / 86400000) : null;

export function ChannelRow({
  channel, exampleEventKey, exampleEventLabel, open, onToggle,
}: {
  channel: ChannelView; exampleEventKey: string; exampleEventLabel: string | null; open: boolean; onToggle: () => void;
}) {
  const { flash, ping } = useSaveFlash();

  const [name, setName] = useState(channel.name);
  const [type, setType] = useState(channel.type);
  const [active, setActive] = useState(channel.active);
  const [color, setColor] = useState(channel.color);
  const [offset, setOffset] = useState(String(channel.offset));
  const [lead, setLead] = useState(String(channel.lead));
  const [weekdays, setWeekdays] = useState<number[]>(channel.weekdays);
  const [cap, setCap] = useState(channel.frequencyCap == null ? "" : String(channel.frequencyCap));
  const [capacity, setCapacity] = useState(channel.capacity == null ? "" : String(channel.capacity));
  const [lockLead, setLockLead] = useState(channel.lockLeadDays == null ? "" : String(channel.lockLeadDays));
  const [tiers, setTiers] = useState<number[]>(channel.tiers);
  const [notes, setNotes] = useState(channel.notes);

  const snapshot = () => JSON.stringify({
    name, type, active, color, offset, lead, weekdays: [...weekdays].sort(),
    cap, capacity, lockLead, tiers: [...tiers].sort(), notes,
  });
  const [baseline, setBaseline] = useState(snapshot());

  // Save via a transition action (not an effect): on success, confirm with the
  // SavedTick and reset the dirty baseline to the just-saved values.
  const [state, formAction, pending] = useActionState(
    async (prev: ChannelActionState, formData: FormData) => {
      const res = await updateChannel(prev, formData);
      if (res.ok) { ping(); setBaseline(snapshot()); }
      return res;
    },
    initialState,
  );

  const dirty = snapshot() !== baseline;

  const event = parseDateInput(exampleEventKey) ?? atMidnight(new Date());
  const preview = previewSchedule(
    { type, offset: num(offset), lead: num(lead), lockLeadDays: lockLead.trim() === "" ? null : num(lockLead), weekdays },
    event,
  );
  const gDays = daysBefore(event, preview.goesOut);
  const aDays = daysBefore(event, preview.assetDue);

  const toggleIn = (arr: number[], v: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const summary = preview.goesOut
    ? `goes out ${gDays} days before · artwork due ${aDays} days before`
    : "no posting day in the window — check the weekdays";

  const offsetLabel =
    type === "single_weekday" ? "Aim to post"
    : type === "one_shot" ? "Post goes out"
    : "Start promoting";

  return (
    <div className={`card-float mb-3 overflow-hidden ${open ? "ring-2 ring-sky-200" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="h-3 w-3 flex-none rounded-full" style={{ background: channel.color }} />
        <span className="font-semibold text-ink">{name}</span>
        <span className="hidden flex-1 text-xs text-muted sm:block">{summary}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-muted"
        }`}>{active ? "On" : "Off"}</span>
        <span className="text-muted">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <form action={formAction} className="border-t border-slate-100 px-4 py-4">
          <input type="hidden" name="id" value={channel.id} />

          <section className="mb-5">
            <h3 className="mb-1 text-sm font-bold text-ink">What this channel is</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <label className="grid gap-1">
                <span className="font-semibold">Name</span>
                <input name="name" value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-2xl border px-3 py-1.5" />
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Type</span>
                <select name="type" value={type} onChange={(e) => setType(e.target.value)}
                  className="rounded-2xl border px-3 py-1.5">
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="font-semibold">Accent colour</span>
                <input type="color" name="color" value={color} onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-12 rounded border align-middle" />
              </label>
              <label className="mt-5 flex items-center gap-2">
                <input type="checkbox" name="active" checked={active} onChange={(e) => setActive(e.target.checked)} />
                <span className="font-semibold">Active</span>
              </label>
            </div>
          </section>

          <section className="mb-5">
            <h3 className="mb-1 text-sm font-bold text-ink">Timing rules</h3>
            <p className="mb-3 text-xs text-muted">
              {type === "single_weekday"
                ? "It posts once, on the day you pick under “Posting” below — on or before this many days out."
                : "How early this channel starts, and how much lead time the team needs."}
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <label className="flex items-center gap-2">
                <span className="w-44 text-ink">{offsetLabel}</span>
                <input name="offset" inputMode="numeric" value={offset} onChange={(e) => setOffset(e.target.value)}
                  className="w-14 rounded-full border px-2 py-1 text-center" />
                <span>days before the event</span>
              </label>
              <label className="flex items-center gap-2">
                <span className="w-44 text-ink">Artwork must be ready</span>
                <input name="lead" inputMode="numeric" value={lead} onChange={(e) => setLead(e.target.value)}
                  className="w-14 rounded-full border px-2 py-1 text-center" />
                <span>days before it goes out</span>
              </label>
            </div>
            <div className="rounded-2xl bg-sky-bg px-4 py-3 text-xs text-ink/80">
              {preview.goesOut
                ? <>{exampleEventLabel
                      ? <>For your next event, <b>{exampleEventLabel}</b> on <b>{fmt(event)}</b> — </>
                      : <>For an example event on <b>{fmt(event)}</b> — </>}
                    artwork due <b>{fmt(preview.assetDue)}</b>, goes out <b>{fmt(preview.goesOut)}</b>.</>
                : <>No posting day falls inside the promotion window — adjust the weekdays or “start promoting”.</>}
              {preview.goesOut && (
                <div className="relative mt-3 h-2">
                  <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-slate-300" />
                  <span className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-amber-500" style={{ left: 0 }} title={`Artwork due ${fmt(preview.assetDue)}`} />
                  <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500"
                    style={{ left: `${aDays ? Math.round(((aDays - (gDays ?? 0)) / aDays) * 100) : 0}%` }} title={`Goes out ${fmt(preview.goesOut)}`} />
                  <span className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-emerald-500" title={`Event ${fmt(event)}`} />
                </div>
              )}
            </div>
          </section>

          {type !== "one_shot" && (
            <section className="mb-5">
              <h3 className="mb-1 text-sm font-bold text-ink">Posting</h3>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="w-24 font-semibold">Posts on</span>
                {WEEKDAYS.map((d) => (
                  <label key={d.value}
                    className={`cursor-pointer rounded-xl border px-2.5 py-1 text-xs font-semibold transition ${
                      weekdays.includes(d.value) ? "border-sky-300 bg-sky-100 text-sky-700" : "text-muted hover:bg-sky-bg"
                    }`}>
                    <input type="checkbox" name="weekday" value={d.value} checked={weekdays.includes(d.value)}
                      onChange={() => setWeekdays((w) => toggleIn(w, d.value))} className="sr-only" />
                    {d.label}
                  </label>
                ))}
              </div>
              {type === "windowed" && (
                <label className="flex items-center gap-2 text-sm text-muted">
                  <span className="w-24 font-semibold">Max per week</span>
                  <input name="cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="—"
                    className="w-14 rounded-full border px-2 py-1 text-center" />
                  <span>times (blank = no limit)</span>
                </label>
              )}
            </section>
          )}

          <details className="mb-4 rounded-2xl border bg-sky-bg/40 px-4 py-3 text-sm">
            <summary className="cursor-pointer select-none font-semibold text-ink">Advanced — who it’s for, capacity{type === "dated_instance" ? ", change cut-off" : ""}, production notes</summary>
            <div className="mt-3 grid gap-3 text-muted">
              <fieldset>
                <legend className="mb-1 font-semibold">Who it’s for</legend>
                <div className="flex gap-4">
                  {[1, 2, 3].map((t) => (
                    <label key={t} className="flex items-center gap-1">
                      <input type="checkbox" name="tier" value={t} checked={tiers.includes(t)}
                        onChange={() => setTiers((ts) => toggleIn(ts, t))} />
                      {tierLabel(t)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2">
                <span className="w-48 font-semibold">How many can share a slot</span>
                <input name="capacity" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="—"
                  className="w-14 rounded-full border px-2 py-1 text-center" />
              </label>
              {type === "dated_instance" && (
                <label className="flex items-center gap-2">
                  <span className="w-48 font-semibold">Stop accepting changes</span>
                  <input name="lockLead" inputMode="numeric" value={lockLead} onChange={(e) => setLockLead(e.target.value)} placeholder="—"
                    className="w-14 rounded-full border px-2 py-1 text-center" />
                  <span>days before it goes out</span>
                </label>
              )}
              <label className="grid gap-1">
                <span className="font-semibold">Production notes</span>
                <textarea name="productionNotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  placeholder="e.g. Banner is 3'x8' vinyl; submit art 3 weeks ahead"
                  className="rounded-2xl border px-3 py-2" />
              </label>
            </div>
          </details>

          {state.error && (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{state.error}</div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" disabled={!dirty || pending}
              className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
              {pending ? "Saving…" : "Save changes"}
            </button>
            <SavedTick show={flash} />
            <span className="ml-auto"><ChannelDeleteButton id={channel.id} /></span>
          </div>
          {!dirty && !flash && <p className="mt-2 text-xs text-muted">Save lights up when you change something.</p>}
        </form>
      )}
    </div>
  );
}
