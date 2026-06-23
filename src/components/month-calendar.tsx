import Link from "next/link";
type Item = { date: Date; color: string; channel: string; title: string; requestId: string };
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
/** "2026-06" for the ?month= param, wrapping year boundaries cleanly. */
const ym = (y: number, m: number) => {
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const MAX_PER_DAY = 4;

export function MonthCalendar({
  grid,
  items,
  year,
  month,
}: {
  grid: Date[][];
  items: Item[];
  year: number;
  month: number;
}) {
  const byDay = new Map<string, Item[]>();
  for (const it of items) {
    const k = key(it.date);
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }

  // Legend = the channels that actually appear on a visible day, so the colors
  // on screen are always documented (and touch users don't need the hover title).
  const legend = new Map<string, string>();
  for (const week of grid) {
    for (const d of week) {
      for (const it of byDay.get(key(d)) ?? []) legend.set(it.channel, it.color);
    }
  }
  const legendItems = [...legend.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const navBtn =
    "grid h-9 w-9 place-items-center rounded-full text-lg font-bold text-ink hover:bg-sky-bg";

  return (
    <div className="max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Calendar 📅</h1>
        <div className="flex items-center gap-1">
          <Link href={`/calendar?month=${ym(year, month - 1)}`} aria-label="Previous month" className={navBtn}>
            ‹
          </Link>
          <span className="min-w-44 text-center font-bold">{`${MONTHS[month]} ${year}`}</span>
          <Link href={`/calendar?month=${ym(year, month + 1)}`} aria-label="Next month" className={navBtn}>
            ›
          </Link>
          <Link
            href="/calendar"
            className="ml-1 rounded-full px-3 py-1.5 text-sm font-semibold text-muted hover:bg-sky-bg hover:text-ink"
          >
            Today
          </Link>
        </div>
      </div>
      <p className="text-muted mb-3 text-sm">When each request goes out, color-coded by channel.</p>

      {legendItems.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {legendItems.map(([name, color]) => (
            <span key={name} className="inline-flex items-center gap-1.5 text-muted">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="mb-1 grid grid-cols-7 gap-2 text-xs font-bold text-muted">
        {WD.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {grid.flat().map((d, i) => {
          const dayItems = byDay.get(key(d)) ?? [];
          const overflow = dayItems.length - MAX_PER_DAY;
          return (
            <div key={i} className={`card-float min-h-24 p-2 ${d.getMonth() !== month ? "opacity-40" : ""}`}>
              <div className="text-xs font-bold text-muted">{d.getDate()}</div>
              {dayItems.slice(0, MAX_PER_DAY).map((it, j) => (
                <Link
                  key={j}
                  href={`/requests/${it.requestId}`}
                  className="block truncate text-[11px] hover:underline"
                  style={{ color: it.color }}
                  title={`${it.title} · ${it.channel}`}
                >
                  ● {it.title}
                </Link>
              ))}
              {overflow > 0 && (
                <div className="mt-0.5 text-[11px] font-semibold text-muted">+{overflow} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
