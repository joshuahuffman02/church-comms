import Link from "next/link";
import {
  channelsWithWeekCounts,
  groupOutputTouchesBySunday,
  upcomingTouchesForActiveChannels,
  type OutputTouch,
} from "@/lib/outputs";
import { MinistryDots } from "@/components/ministry-dots";

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtSunday = (d: Date) =>
  d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

function UpcomingOutputRow({ touch }: { touch: OutputTouch }) {
  const req = touch.deliverable.request;
  const ministries = req.ministries.map((m) => ({ name: m.name, color: m.color }));

  return (
    <div className="border-t border-slate-100 py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/outputs/${touch.channel.key}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold"
            style={{ color: touch.channel.color }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: touch.channel.color }}
            />
            {touch.channel.name}
          </Link>
          <Link href={`/requests/${req.id}`} className="font-semibold text-ink hover:underline">
            {req.title}
          </Link>
        </div>
        <span className="shrink-0 text-muted">{fmt(touch.scheduledAt)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <MinistryDots ministries={ministries} showNames />
        {touch.purposeLabel && <span>· {touch.purposeLabel}</span>}
      </div>
    </div>
  );
}

export default async function OutputsIndex() {
  const today = new Date();
  const [channels, upcoming] = await Promise.all([
    channelsWithWeekCounts(today),
    upcomingTouchesForActiveChannels(today),
  ]);
  const upcomingGroups = groupOutputTouchesBySunday(upcoming);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-extrabold mb-1">Channels 📡</h1>
      <p className="text-muted mb-5">
        Everywhere you post · this week and the next few months
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {channels.map(c => (
          <Link
            key={c.key}
            href={`/outputs/${c.key}`}
            className="card-float p-4 flex items-center gap-3 hover:bg-sky-bg transition"
          >
            <span className="inline-block h-3.5 w-3.5 rounded-full shrink-0" style={{ background: c.color }} />
            <div className="min-w-0">
              <div className="font-semibold truncate" style={{ color: c.color }}>{c.name}</div>
              <div className="text-sm text-muted">
                {c.count} {c.capped ? "events live this week (capped)" : "live this week"}
              </div>
            </div>
          </Link>
        ))}
        {channels.length === 0 && (
          <div className="text-muted text-sm">No active outputs configured.</div>
        )}
      </div>

      <div className="card-float p-5 mt-5">
        <div className="font-bold mb-2">
          Upcoming by Sunday <span className="text-muted">· {upcoming.length}</span>
        </div>
        {upcomingGroups.length === 0 ? (
          <div className="text-muted text-sm">Nothing scheduled in the next few months.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcomingGroups.map((group) => (
              <section key={group.sunday.getTime()} className="py-3 first:pt-0 last:pb-0">
                <div className="mb-1 text-xs font-extrabold text-muted">
                  For {fmtSunday(group.sunday)}
                </div>
                {group.items.map((touch) => (
                  <UpcomingOutputRow key={touch.id} touch={touch} />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
