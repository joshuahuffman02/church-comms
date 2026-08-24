"use client";
import { useActionState, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronDown, RotateCcw, Save } from "lucide-react";
import { updateChannel, type ChannelActionState } from "@/actions/channels";
import { useSaveFlash, SavedTick } from "@/components/save-flash";
import { ChannelDeleteButton } from "@/components/channel-delete-button";
import { previewSchedule } from "@/lib/channel-preview";
import { parseDateInput, atMidnight } from "@/lib/engine/dates";
import { tierLabel } from "@/lib/labels";

export interface ChannelView {
  id: string;
  key: string;
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

  function resetChanges() {
    const saved = JSON.parse(baseline) as {
      name: string;
      type: string;
      active: boolean;
      color: string;
      offset: string;
      lead: string;
      weekdays: number[];
      cap: string;
      capacity: string;
      lockLead: string;
      tiers: number[];
      notes: string;
    };
    setName(saved.name);
    setType(saved.type);
    setActive(saved.active);
    setColor(saved.color);
    setOffset(saved.offset);
    setLead(saved.lead);
    setWeekdays(saved.weekdays);
    setCap(saved.cap);
    setCapacity(saved.capacity);
    setLockLead(saved.lockLead);
    setTiers(saved.tiers);
    setNotes(saved.notes);
  }

  const event = parseDateInput(exampleEventKey) ?? atMidnight(new Date());
  const preview = previewSchedule(
    { key: channel.key, type, offset: num(offset), lead: num(lead), lockLeadDays: lockLead.trim() === "" ? null : num(lockLead), weekdays },
    event,
  );
  const gDays = daysBefore(event, preview.goesOut);
  const aDays = daysBefore(event, preview.assetDue);

  const toggleIn = (arr: number[], v: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const weeklyAnnouncementVideo = channel.key === "announcement_video" && type === "dated_instance";
  const summary = preview.goesOut
    ? `${weeklyAnnouncementVideo ? "eligible weekly from" : "goes out"} ${gDays} days before · artwork due ${aDays} days before`
    : "no posting day in the window — check the weekdays";

  const offsetLabel =
    type === "single_weekday" ? "Aim to post"
    : type === "one_shot" ? "Post goes out"
    : "Start promoting";

  return (
    <div className={`card-float overflow-hidden ${open ? "ring-2 ring-sky-200" : ""} ${!channel.active && !open ? "bg-white/65" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        <span className="h-3.5 w-3.5 flex-none rounded-full ring-4 ring-white" style={{ background: color }} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold text-ink">{name}</span>
            <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 md:inline-flex">{TYPE_LABELS[type] ?? type}</span>
            {dirty && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Unsaved</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">{summary}</span>
        </span>
        <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
          active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-muted"
        }`}>{active ? "Active" : "Paused"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <form action={formAction} className="border-t border-slate-100 bg-white/45 px-4 py-5 sm:px-5">
          <input type="hidden" name="id" value={channel.id} />

          <div className="mb-5 flex flex-col gap-2 rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-extrabold text-ink">Editing {name}</p>
              <p className="mt-0.5 text-xs text-muted">Nothing changes in the live schedule until you save.</p>
            </div>
            <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${dirty ? "bg-amber-100 text-amber-800" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
              {dirty ? "Unsaved changes" : "Up to date"}
            </span>
          </div>

          <section className="mb-5">
            <h3 className="mb-1 text-sm font-bold text-ink">Channel identity</h3>
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
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <input type="checkbox" name="active" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-0.5 h-5 w-5 accent-sky-600" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink">Use this channel in the live workflow</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">Active channels create future placements and appear in Channel Plan, weekly handoffs, and Downloads.</span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{active ? "Active" : "Paused"}</span>
            </label>
            {channel.active && !active && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p><b>Saving will pause this channel.</b> Its future placements will be removed when the schedule rebuilds; past history stays intact.</p>
              </div>
            )}
            {!channel.active && active && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p><b>Saving will activate this channel.</b> Eligible upcoming events will be backfilled automatically.</p>
              </div>
            )}
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
                    artwork due <b>{fmt(preview.assetDue)}</b>, {weeklyAnnouncementVideo
                      ? <>first eligible <b>{fmt(preview.goesOut)}</b>, then eligible weekly through the event.</>
                      : <>goes out <b>{fmt(preview.goesOut)}</b>.</>}</>
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

          {(type === "windowed" || type === "single_weekday") && (
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
            <div role="alert" className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{state.error}</div>
          )}

          <div className={`rounded-2xl border px-4 py-4 ${dirty ? "border-amber-200 bg-amber-50/80" : "border-slate-200 bg-white"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div aria-live="polite">
                <p className="text-sm font-bold text-ink">{dirty ? "Ready to update the schedule" : "No unsaved changes"}</p>
                <p className="mt-0.5 text-xs text-muted">Saving recalculates future placements automatically. Past dates are not rewritten.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={resetChanges} disabled={!dirty || pending}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-ink hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> Cancel changes
                </button>
                <button type="submit" disabled={!dirty || pending}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                  <Save className="h-4 w-4" aria-hidden="true" /> {pending ? "Saving and rebuilding…" : "Save and update schedule"}
                </button>
              </div>
            </div>
            <SavedTick show={flash} />
          </div>

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
            <ChannelDeleteButton id={channel.id} />
          </div>
        </form>
      )}
    </div>
  );
}
