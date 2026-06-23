import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { createChannel } from "@/actions/channels";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { SettingsNav } from "@/components/settings-nav";
import { ChannelList } from "@/components/channel-list";
import type { ChannelView } from "@/components/channel-row";
import { tierLabel } from "@/lib/labels";
import { atMidnight, addDays } from "@/lib/engine/dates";

export const dynamic = "force-dynamic";

const WEEKDAYS = [
  { value: 0, label: "Sun" }, { value: 1, label: "Mon" }, { value: 2, label: "Tue" },
  { value: 3, label: "Wed" }, { value: 4, label: "Thu" }, { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date -> "YYYY-MM-DD" key in church-local terms (never via toISOString). */
function toDateKey(d: Date): string {
  const m = atMidnight(d);
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}`;
}

/** Fallback example when there are no upcoming events: the upcoming Sunday. */
function nextSunday(today: Date): Date {
  return addDays(today, (7 - today.getDay()) % 7);
}

type ChannelRecord = Awaited<ReturnType<typeof db.channel.findMany>>[number];

function toView(c: ChannelRecord): ChannelView {
  const cadence = c.cadence as { weekdays?: unknown } | null;
  const weekdays = Array.isArray(cadence?.weekdays)
    ? (cadence!.weekdays as unknown[]).filter((n): n is number => Number.isInteger(n))
    : [];
  const tiers = Array.isArray(c.tierEligibility)
    ? (c.tierEligibility as unknown[]).filter((n): n is number => n === 1 || n === 2 || n === 3)
    : [1, 2, 3];
  return {
    id: c.id, name: c.name, type: c.type, color: c.color, active: c.active,
    offset: c.defaultPublishOffsetDays, lead: c.productionLeadDays, lockLeadDays: c.lockLeadDays,
    weekdays, capacity: c.capacity, frequencyCap: c.frequencyCap, tiers, notes: c.productionNotes ?? "",
  };
}

export default async function Channels() {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.roles)) {
    return <AdminOnlyCard area="outputs and channels" />;
  }

  const channels = await db.channel.findMany({ orderBy: { sortOrder: "asc" } });
  const views = channels.map(toView);

  // Anchor the timing preview to the next real upcoming event (so the dates read
  // true for this church's actual schedule), falling back to the next Sunday when
  // there's nothing on the calendar yet.
  const today = atMidnight(new Date());
  const nextEvent = await db.request.findFirst({
    where: { eventStart: { gte: today } },
    orderBy: { eventStart: "asc" },
    select: { eventStart: true, title: true },
  });
  const exampleEventKey = toDateKey(nextEvent ? nextEvent.eventStart : nextSunday(today));
  const exampleEventLabel = nextEvent?.title ?? null;

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <h1 className="mb-2 text-2xl font-extrabold">Channels ⚙️</h1>
      <p className="mb-5 leading-relaxed text-muted">
        Each channel decides <b className="text-ink">when</b> an event starts showing up and{" "}
        <b className="text-ink">how early</b> the team needs the artwork ready. Tap a channel to
        change its rules — the dates update as you type, and <b className="text-ink">Save</b> turns
        on once you’ve changed something.
      </p>

      <ChannelList channels={views} exampleEventKey={exampleEventKey} exampleEventLabel={exampleEventLabel} />

      {/* ---- Add a new channel (unchanged) -------------------------------- */}
      <details className="card-float mt-6 p-4">
        <summary className="cursor-pointer select-none font-semibold text-ink">＋ Add a channel</summary>
        <form action={createChannel} className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold">Name
              <input name="name" required placeholder="e.g. Instagram" className="ml-2 rounded-full border px-3 py-1 text-sm font-normal" />
            </label>
            <label className="text-sm font-semibold">Type
              <select name="type" defaultValue="windowed" className="ml-2 rounded-full border px-3 py-1 text-sm font-normal">
                <option value="windowed">Runs for a while (over a span of days)</option>
                <option value="dated_instance">Happens once on a date</option>
                <option value="one_shot">Sent once</option>
              </select>
            </label>
            <label className="text-sm font-semibold">Color
              <input name="color" type="color" defaultValue="#93c5fd" className="ml-2 h-8 w-12 rounded border align-middle" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
            <label>Goes out:
              <input name="offset" type="number" defaultValue={14} className="mx-1 w-16 rounded-full border px-2 py-1" /> days before the event
            </label>
            <label>Asset due:
              <input name="lead" type="number" defaultValue={7} className="mx-1 w-16 rounded-full border px-2 py-1" /> days before it goes out
            </label>
            <label>Capacity (optional):
              <input name="capacity" type="number" placeholder="—" className="mx-1 w-16 rounded-full border px-2 py-1" />
            </label>
          </div>
          <fieldset className="text-sm">
            <legend className="mb-1 font-semibold">Who can use it (tiers)</legend>
            <div className="flex gap-4 text-muted">
              {[1, 2, 3].map((t) => (
                <label key={t}><input type="checkbox" name="tier" value={t} defaultChecked className="mr-1" />{tierLabel(t)}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-sm">
            <legend className="mb-1 font-semibold">Which days does it post? (for &ldquo;runs for a while&rdquo; channels)</legend>
            <div className="flex flex-wrap gap-3 text-muted">
              {WEEKDAYS.map((d) => (
                <label key={d.value}><input type="checkbox" name="weekday" value={d.value} defaultChecked={d.value === 0} className="mr-1" />{d.label}</label>
              ))}
            </div>
          </fieldset>
          <div>
            <button className="rounded-full bg-ink px-5 py-1.5 text-sm font-semibold text-white">Add output</button>
          </div>
        </form>
      </details>
    </div>
  );
}
