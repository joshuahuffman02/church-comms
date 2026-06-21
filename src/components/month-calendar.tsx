import Link from "next/link";
type Item = { date: Date; color: string; channel: string; title: string; requestId: string };
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const WD = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export function MonthCalendar({ grid, items, month }: { grid: Date[][]; items: Item[]; month: number }) {
  const byDay = new Map<string, Item[]>();
  for (const it of items) { const k = key(it.date); byDay.set(k, [...(byDay.get(k) ?? []), it]); }
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-extrabold mb-4">Master Calendar 📅</h1>
      <div className="grid grid-cols-7 gap-2 text-xs font-bold text-muted mb-1">{WD.map(d => <div key={d}>{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-2">
        {grid.flat().map((d, i) => (
          <div key={i} className={`card-float p-2 min-h-24 ${d.getMonth() !== month ? "opacity-40" : ""}`}>
            <div className="text-xs font-bold text-muted">{d.getDate()}</div>
            {(byDay.get(key(d)) ?? []).slice(0, 4).map((it, j) => (
              <Link
                key={j}
                href={`/requests/${it.requestId}`}
                className="block text-[11px] truncate hover:underline"
                style={{ color: it.color }}
                title={`${it.title} · ${it.channel}`}
              >
                ● {it.title}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
