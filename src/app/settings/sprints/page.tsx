import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { atMidnight } from "@/lib/engine/dates";
import { createSprint, endSprint } from "@/actions/campaigns";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { SettingsNav } from "@/components/settings-nav";

const fmt = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default async function Sprints({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const me = await getSessionUser();
  if (!me || !isAdmin(me.roles)) {
    return <AdminOnlyCard area="sprints" />;
  }

  const [campaigns, setting] = await Promise.all([
    db.campaign.findMany({ orderBy: { startsAt: "desc" } }),
    db.setting.findUnique({ where: { id: 1 } }),
  ]);

  const today = atMidnight(new Date()).getTime();
  const isActive = (c: { startsAt: Date; endsAt: Date }) =>
    atMidnight(c.startsAt).getTime() <= today && today <= atMidnight(c.endsAt).getTime();

  const quota = setting?.sprintQuota ?? 4;
  const thisYear = new Date().getFullYear();
  const usedThisYear = campaigns.filter(
    (c) => atMidnight(c.startsAt).getFullYear() === thisYear
  ).length;
  const overQuota = usedThisYear > quota;

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <h1 className="text-2xl font-extrabold mb-1">Big pushes 🏃</h1>
      <p className="text-muted mb-5">
        All-out promotion windows for a big event (Easter, Christmas, VBS) that
        briefly lift the everyday limits. Also called sprints.
      </p>

      {/* Quota line */}
      <div
        className={`card-float p-4 mb-5 flex items-center gap-3 ${
          overQuota ? "bg-amber-50 border border-amber-200" : ""
        }`}
      >
        <span className="text-xl">{overQuota ? "⚠️" : "📊"}</span>
        <div>
          <div className={`font-semibold ${overQuota ? "text-amber-700" : ""}`}>
            Big pushes this year: {usedThisYear} / {quota}
          </div>
          {overQuota && (
            <div className="text-sm text-amber-700">
              You&apos;re over your yearly big-push budget — consider holding off.
            </div>
          )}
        </div>
      </div>

      {/* Start a sprint */}
      <div className="card-float p-5 mb-5">
        <h2 className="font-bold mb-3">Start a big push</h2>
        {error && (
          <div className="mb-3 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">
            Please give it a name and a valid date range (end on or after start).
          </div>
        )}
        <form action={createSprint} className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-muted grid gap-1">
            Name
            <input
              name="name"
              maxLength={120}
              required
              placeholder="e.g. Easter Push"
              className="rounded-2xl border px-3 py-2 text-sm text-ink w-56"
            />
          </label>
          <label className="text-sm text-muted grid gap-1">
            Start date
            <input name="startsAt" type="date" required className="rounded-2xl border px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-sm text-muted grid gap-1">
            End date
            <input name="endsAt" type="date" required className="rounded-2xl border px-3 py-2 text-sm text-ink" />
          </label>
          <button className="rounded-full bg-ink text-white px-5 py-2 text-sm font-semibold">
            Start
          </button>
        </form>
      </div>

      {/* Sprint list */}
      <div className="card-float overflow-hidden">
        <div className="px-5 py-3 text-xs font-bold text-muted border-b border-slate-100">
          All big pushes
        </div>
        {campaigns.length === 0 && (
          <div className="px-5 py-6 text-muted text-sm">No big pushes yet.</div>
        )}
        {campaigns.map((c) => {
          const active = isActive(c);
          const endThis = endSprint.bind(null, c.id);
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 px-5 py-3 border-t border-slate-100 text-sm first:border-t-0"
            >
              <span className="font-semibold">{c.name}</span>
              {active && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Active
                </span>
              )}
              <span className="text-muted">
                {fmt(c.startsAt)} – {fmt(c.endsAt)}
              </span>
              <form action={endThis} className="ml-auto">
                <button className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition">
                  End
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
