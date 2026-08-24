import Link from "next/link";
import { CalendarClock, Download, ListChecks } from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { SettingsNav } from "@/components/settings-nav";
import { ChannelList } from "@/components/channel-list";
import { ChannelCreateForm } from "@/components/channel-create-form";
import type { ChannelView } from "@/components/channel-row";
import { atMidnight, addDays } from "@/lib/engine/dates";

export const dynamic = "force-dynamic";

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
    id: c.id, key: c.key, name: c.name, type: c.type, color: c.color, active: c.active,
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
  const activeCount = views.filter((channel) => channel.active).length;
  const pausedCount = views.length - activeCount;

  return (
    <div className="mx-auto max-w-5xl">
      <SettingsNav />
      <header className="card-float overflow-hidden p-6 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Scheduling source of truth</p>
            <h1 className="mt-1 text-3xl font-extrabold text-ink">Channels</h1>
            <p className="mt-2 max-w-3xl leading-7 text-muted">
              Decide where events can appear, when promotion begins, and how much production lead time each channel needs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/assign" className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold text-ink hover:bg-sky-bg">
              <ListChecks className="h-4 w-4" aria-hidden="true" /> Channel Plan
            </Link>
            <Link href="/exports" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white hover:opacity-90">
              <Download className="h-4 w-4" aria-hidden="true" /> Downloads
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-inset ring-emerald-100">
            <p className="text-xl font-extrabold text-emerald-900">{activeCount}</p>
            <p className="text-xs font-bold text-emerald-800">active channels</p>
          </div>
          <div className="rounded-2xl bg-slate-100/80 px-4 py-3 ring-1 ring-inset ring-slate-200">
            <p className="text-xl font-extrabold text-slate-800">{pausedCount}</p>
            <p className="text-xs font-bold text-slate-600">paused channels</p>
          </div>
          <div className="rounded-2xl bg-sky-50 px-4 py-3 ring-1 ring-inset ring-sky-100">
            <p className="text-sm font-extrabold text-sky-900">{exampleEventLabel ?? "Upcoming Sunday"}</p>
            <p className="mt-1 text-xs font-semibold text-sky-700">live timing example used in every editor</p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p><b>Saving updates future schedules immediately.</b> New active channels are backfilled automatically, paused channels are removed from future placements, and past history stays intact.</p>
        </div>
      </header>

      <div className="mt-7">
        <ChannelList channels={views} exampleEventKey={exampleEventKey} exampleEventLabel={exampleEventLabel} />
      </div>

      <section className="mt-7" aria-labelledby="add-channel-heading">
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Expand the workflow</p>
          <h2 id="add-channel-heading" className="mt-0.5 text-xl font-extrabold text-ink">Need another channel?</h2>
        </div>
        <ChannelCreateForm />
      </section>
    </div>
  );
}
