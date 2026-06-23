import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin, isEditor } from "@/lib/roles";
import { atMidnight } from "@/lib/engine/dates";
import { cadenceSummary, type SeriesLike } from "@/lib/recurrence";
import { tierLabel, tierTitle } from "@/lib/labels";
import { SeriesForm } from "@/components/series-form";
import {
  GenerateNowButton,
  ActiveToggle,
  DeleteSeriesButton,
  MarkFilledButton,
} from "@/components/series-actions";

const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default async function RecurringPage() {
  const today = atMidnight(new Date());
  const [seriesRows, ministries, user] = await Promise.all([
    db.recurringSeries.findMany({
      orderBy: [{ active: "desc" }, { title: "asc" }],
      include: {
        ministry: { select: { name: true, color: true } },
        occurrences: { select: { eventStart: true } },
      },
    }),
    db.ministry.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSessionUser(),
  ]);
  const canDelete = isAdmin(user?.roles ?? []);
  const canEdit = isEditor(user?.roles ?? []);

  const rows = seriesRows.map((s) => {
    const shape: SeriesLike = {
      frequency: s.frequency,
      interval: s.interval,
      weekday: s.weekday,
      dayOfMonth: s.dayOfMonth,
      startDate: s.startDate,
      untilDate: s.untilDate,
    };
    const next = s.occurrences
      .map((o) => atMidnight(o.eventStart))
      .filter((d) => d >= today)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const ongoing = s.untilDate == null;
    return {
      id: s.id,
      title: s.title,
      active: s.active,
      // Open-ended series read as "Every week on Tuesday · No end date — ongoing".
      cadence: ongoing ? `${cadenceSummary(shape)} · No end date — ongoing` : cadenceSummary(shape),
      ongoing,
      untilDate: s.untilDate ? fmtDate(atMidnight(s.untilDate)) : null,
      ministryName: s.ministry?.name ?? null,
      ministryColor: s.ministry?.color ?? null,
      count: s.occurrences.length,
      nextDate: next ? fmtDate(next) : null,
      tier: s.tier,
    };
  });

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-extrabold mb-1">Recurring 🔁</h1>
      <p className="text-muted mb-5">
        Define a standing item once — its individual events generate automatically.
      </p>

      {canEdit ? (
        <section className="card-float p-6 mb-6">
          <h2 className="text-lg font-extrabold mb-1">New recurring series</h2>
          <div className="rounded-2xl bg-sky-bg/60 px-4 py-3 mb-4 text-sm text-muted">
            Use this for things that <b>repeat</b> (Missionary of the Month) OR
            <b> ongoing needs that run until filled</b> (a volunteer request). Leave
            the end date blank for either — it runs until you end it. For things that
            change each time — like which missionary — generate the occurrences, then
            open each one to fill in that month&apos;s details.
          </div>
          <SeriesForm ministries={ministries} />
        </section>
      ) : (
        <div className="card-float p-4 mb-6 text-sm font-semibold text-muted">
          Read-only view. Ask an editor to create or change recurring series.
        </div>
      )}

      <section className="card-float overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="text-xs font-bold text-muted">{rows.length} series</div>
          <div className="text-xs text-muted mt-1">
            Occurrences appear in{" "}
            <Link href="/requests" className="font-semibold text-sky-700 hover:underline">
              Events
            </Link>{" "}
            — open any one to customize that month&apos;s details.
          </div>
        </div>
        {rows.length === 0 && (
          <div className="px-5 py-6 text-muted text-sm">
            No series yet. Create one above and its events will appear on your boards.
          </div>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            className={`grid gap-3 px-5 py-4 border-t border-slate-100 items-center ${
              canEdit ? "sm:grid-cols-[1.6fr_1fr_auto]" : "sm:grid-cols-[1.6fr_1fr]"
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{r.title}</span>
                {!r.active && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted">
                    paused
                  </span>
                )}
                <span
                  title={tierTitle(r.tier)}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted"
                >
                  {tierLabel(r.tier)}
                </span>
              </div>
              <div className="text-sm text-muted mt-0.5">{r.cadence}</div>
              <div className="flex items-center gap-2 text-xs text-muted mt-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: r.ministryColor ?? "#cbd5e1" }}
                />
                {r.ministryName ?? "—"}
              </div>
            </div>

            <div className="text-sm text-muted">
              <div>
                <span className="font-semibold text-ink">{r.count}</span> generated
              </div>
              <div>Next: {r.nextDate ?? "—"}</div>
              <div>Ends: {r.ongoing ? "ongoing" : r.untilDate ?? "—"}</div>
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 justify-start sm:justify-end">
                <GenerateNowButton id={r.id} />
                {r.active && <MarkFilledButton id={r.id} />}
                <ActiveToggle id={r.id} active={r.active} />
                {canDelete && <DeleteSeriesButton id={r.id} />}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
