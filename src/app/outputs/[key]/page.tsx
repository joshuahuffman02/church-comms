import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DELIVERABLE_STATUS_META } from "@/lib/status";
import {
  curatedTouchesThisWeekForChannel,
  groupCuratedOutputTouchesBySunday,
  upcomingTouchesForChannel,
  type OutputTouch,
} from "@/lib/outputs";
import { TouchRemoveButton } from "@/components/touch-remove-button";
import { TouchContentEditor } from "@/components/touch-content-editor";
import { MinistryDots } from "@/components/ministry-dots";
import { phaseLabel } from "@/lib/labels";

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtSunday = (d: Date) =>
  d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

function StatusChip({ status }: { status: string }) {
  const meta = DELIVERABLE_STATUS_META[status] ?? { label: status, color: "#94a3b8" };
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-semibold shrink-0"
      style={{ background: `${meta.color}22`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function TouchRow({
  t,
  muted,
  channelName,
  editable,
}: {
  t: OutputTouch;
  muted?: boolean;
  channelName?: string;
  editable?: boolean;
}) {
  const req = t.deliverable.request;
  const ministries = req.ministries.map((m) => ({ name: m.name, color: m.color }));
  const phase = phaseLabel(t.purposeLabel);
  return (
    <div className={`py-2.5 border-t border-slate-100 ${muted ? "opacity-80" : ""}`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0">
          <Link href={`/requests/${req.id}`} className="font-semibold hover:underline">
            {req.title}
          </Link>
          <div className="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {ministries.length > 0 && <MinistryDots ministries={ministries} showNames />}
            <span>Event {fmt(req.eventStart)}</span>
            {phase && <span>· {phase}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-muted" title="When it's on this output">on {fmt(t.scheduledAt)}</span>
          <StatusChip status={t.deliverable.status} />
          {channelName && <TouchRemoveButton id={t.id} channelName={channelName} />}
        </div>
      </div>
      {editable && (
        <TouchContentEditor
          id={t.id}
          scheduledAt={t.scheduledAt}
          channelName={channelName ?? t.channel.name}
          content={t.content}
          assetLink={t.assetLink}
          note={t.note}
          collapsible
        />
      )}
    </div>
  );
}

export default async function OutputPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const channel = await db.channel.findUnique({ where: { key } });
  if (!channel || !channel.active) notFound();

  const today = new Date();
  const [week, upcoming] = await Promise.all([
    curatedTouchesThisWeekForChannel(channel, today),
    upcomingTouchesForChannel(channel.id, today),
  ]);
  const { live, held, liveEventCount, cap } = week;
  const upcomingGroups = groupCuratedOutputTouchesBySunday(upcoming, channel);
  const upcomingCount = upcomingGroups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="max-w-3xl">
      <Link href="/outputs" className="text-sm text-muted hover:underline">← All outputs</Link>
      <h1 className="text-2xl font-extrabold mb-1 mt-2" style={{ color: channel.color }}>
        {channel.name}
      </h1>
      <p className="text-muted mb-3 capitalize">{channel.type.replace(/_/g, " ")}</p>

      {channel.productionNotes && (
        <div
          className="card-float p-4 mb-5 text-sm"
          style={{ borderLeft: `5px solid ${channel.color}` }}
        >
          <div className="font-semibold mb-1">🛠️ Production notes</div>
          <p className="whitespace-pre-wrap text-slate-700">{channel.productionNotes}</p>
        </div>
      )}

      <div className="card-float p-5 mb-4" style={{ borderLeft: `5px solid ${channel.color}` }}>
        <div className="font-bold mb-2">
          Live this week{" "}
          <span className="text-muted">
            · {cap != null ? `${liveEventCount} event${liveEventCount === 1 ? "" : "s"}` : live.length}
          </span>
          {cap != null && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-muted">
              weekly cap {cap}
            </span>
          )}
        </div>
        {live.length === 0 ? (
          <div className="text-muted text-sm">Nothing scheduled on this output this week.</div>
        ) : (
          live.map(t => <TouchRow key={t.id} t={t} channelName={channel.name} editable />)
        )}

        {held.length > 0 && (
          <details className="mt-4 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-muted select-none">
              ⏸ Held — over the weekly cap of {cap} ({new Set(held.map((t) => t.deliverable.request.id)).size} event
              {new Set(held.map((t) => t.deliverable.request.id)).size === 1 ? "" : "s"})
            </summary>
            <p className="text-xs text-muted mt-2 mb-1">
              Lower-priority events that didn&apos;t make this week&apos;s cap. They climb
              into the live set as their event date nears — or add one explicitly elsewhere.
            </p>
            {held.map((t) => (
              <TouchRow key={t.id} t={t} muted />
            ))}
          </details>
        )}
      </div>

      <div className="card-float p-5">
        <div className="font-bold mb-2 text-muted">
          Coming up <span>· {upcomingCount}</span>
        </div>
        {upcomingCount === 0 ? (
          <div className="text-muted text-sm">Nothing scheduled in the next few months.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcomingGroups.map((group) => (
              <section key={group.sunday.getTime()} className="py-3 first:pt-0 last:pb-0">
                <div className="mb-1 text-xs font-extrabold text-muted">
                  For {fmtSunday(group.sunday)}
                </div>
                {group.items.map(t => <TouchRow key={t.id} t={t} muted />)}
                {group.held.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-muted select-none">
                      Held — over the cap of {group.cap} ({new Set(group.held.map((t) => t.deliverable.request.id)).size} event
                      {new Set(group.held.map((t) => t.deliverable.request.id)).size === 1 ? "" : "s"})
                    </summary>
                    <div className="mt-1">
                      {group.held.map((t) => (
                        <TouchRow key={t.id} t={t} muted />
                      ))}
                    </div>
                  </details>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
