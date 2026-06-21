import Link from "next/link";
import { DeliverableStatusButton } from "@/components/deliverable-status-button";
import { UpdateDoneButton } from "@/components/update-done-button";
import { TaskDoneButton } from "@/components/task-done-button";
import { StandingTaskDoneButton } from "@/components/standing-task-done-button";
import { addTop3Item, removeTop3Item } from "@/actions/video-top3";
import { KIND_LABEL } from "@/lib/updates";
import { initials } from "@/lib/tasks";

type Row = {
  id: string;
  requestId: string;
  status: string;
  productionDueAt: Date | null;
  request: { title: string };
  channel: { name: string; color: string };
  instanceDate: Date | null;
  ownerName?: string | null;
};
const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";

function Section({ title, color, rows, kind, hint }: { title: string; color: string; rows: Row[]; kind: "make" | "video" | "risk"; hint?: string }) {
  return (
    <div className="card-float p-5 mb-4" style={{ borderLeft: `5px solid ${color}` }}>
      <div className="font-bold mb-1">{title} <span className="text-muted">· {rows.length}</span></div>
      {hint && <div className="text-muted text-xs mb-3">{hint}</div>}
      {!hint && <div className="mb-2" />}
      {rows.length === 0 && <div className="text-muted text-sm">Nothing here this week 🎉</div>}
      {rows.map(r => (
        <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-t border-slate-100 text-sm">
          <Link href={`/requests/${r.requestId}`} className="hover:underline">
            <b>{r.request.title}</b> <span className="text-muted">· {r.channel.name}</span>
          </Link>
          <div className="flex items-center gap-3">
            {r.ownerName && (
              <span
                title={r.ownerName}
                className="grid h-6 min-w-6 place-items-center rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500"
              >
                {initials(r.ownerName)}
              </span>
            )}
            <span className="text-muted">{kind === "video" ? `locks ${fmt(r.productionDueAt)}` : `due ${fmt(r.productionDueAt)}`}</span>
            {kind === "make" && <DeliverableStatusButton id={r.id} status={r.status} />}
          </div>
        </div>
      ))}
    </div>
  );
}

type LoopChange = { id: string; requestId?: string; request: { title: string }; channel: { name: string } };
function LoopRow({ t, label, color }: { t: LoopChange; label: string; color: string }) {
  const body = (
    <>
      <span className="font-bold mr-2" style={{ color }}>{label}</span>
      <b>{t.request.title}</b>
      <span className="text-muted ml-1">· {t.channel.name}</span>
    </>
  );
  return (
    <div className="flex items-center py-2 border-t border-slate-100 text-sm">
      {t.requestId ? (
        <Link href={`/requests/${t.requestId}`} className="flex items-center hover:underline">{body}</Link>
      ) : (
        body
      )}
    </div>
  );
}
function LoopSection({ add, remove }: { add: LoopChange[]; remove: LoopChange[] }) {
  return (
    <div className="card-float p-5 mb-4" style={{ borderLeft: "5px solid #38bdf8" }}>
      <div className="font-bold mb-3">🔁 Loop changes for Sunday</div>
      {add.length === 0 && remove.length === 0 && (
        <div className="text-muted text-sm">No loop changes this Sunday 🎉</div>
      )}
      {add.map(t => <LoopRow key={`add-${t.id}`} t={t} label="＋ Add" color="#16a34a" />)}
      {remove.map(t => <LoopRow key={`rm-${t.id}`} t={t} label="− Remove" color="#dc2626" />)}
    </div>
  );
}

// ── Message-arc updates due this week ───────────────────────────────────────

export type MessageUpdate = {
  id: string;
  requestId: string;
  eventTitle: string;
  title: string;
  kind: string | null;
  body: string | null;
  scheduledFor: Date;
  done: boolean;
};

const truncate = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function MessageUpdateRow({ u }: { u: MessageUpdate }) {
  return (
    <div className="flex items-start gap-3 py-2 border-t border-slate-100 text-sm">
      <UpdateDoneButton id={u.id} done={u.done} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/requests/${u.requestId}`} className="hover:underline">
            <b className={u.done ? "line-through text-muted" : ""}>{u.eventTitle}</b>
          </Link>
          <span className="text-muted">·</span>
          <span className={`font-semibold ${u.done ? "line-through text-muted" : ""}`}>
            {u.title}
          </span>
          {u.kind && KIND_LABEL[u.kind] && (
            <span className="rounded-full bg-sky-bg px-2 py-0.5 text-xs font-semibold text-sky-700">
              {KIND_LABEL[u.kind]}
            </span>
          )}
          <span className="ml-auto text-muted text-xs">{fmt(u.scheduledFor)}</span>
        </div>
        {u.body && <p className="text-muted text-xs mt-0.5">{truncate(u.body)}</p>}
      </div>
    </div>
  );
}

function MessageUpdatesSection({ updates }: { updates: MessageUpdate[] }) {
  return (
    <div className="card-float p-5 mb-4" style={{ borderLeft: "5px solid #f472b6" }}>
      <div className="font-bold mb-1">
        📣 Message updates this week <span className="text-muted">· {updates.length}</span>
      </div>
      <div className="text-muted text-xs mb-3">
        Planned or on-the-fly message changes landing this week — update the wording where it goes out.
      </div>
      {updates.length === 0 ? (
        <div className="text-muted text-sm">No message updates this week 🎉</div>
      ) : (
        updates.map((u) => <MessageUpdateRow key={u.id} u={u} />)
      )}
    </div>
  );
}

// ── Admin (playbook) tasks due this week ────────────────────────────────────

export type AdminTask = {
  id: string;
  requestId: string;
  eventTitle: string;
  title: string;
  notes: string | null;
  category: string | null;
  source: string | null;
  dueAt: Date | null;
  done: boolean;
};

function AdminTaskRow({ t }: { t: AdminTask }) {
  return (
    <div className="flex items-start gap-3 py-2 border-t border-slate-100 text-sm">
      <TaskDoneButton id={t.id} done={t.done} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/requests/${t.requestId}`} className="hover:underline">
            <b className={t.done ? "line-through text-muted" : ""}>{t.eventTitle}</b>
          </Link>
          <span className="text-muted">·</span>
          <span className={`font-semibold ${t.done ? "line-through text-muted" : ""}`}>
            {t.title}
          </span>
          {t.category && (
            <span className="rounded-full bg-sky-bg px-2 py-0.5 text-xs font-semibold text-sky-700">
              {t.category}
            </span>
          )}
          {t.source && t.source !== "manual" && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              {t.source}
            </span>
          )}
          <span className="ml-auto text-muted text-xs">{fmt(t.dueAt)}</span>
        </div>
        {t.notes && <p className="text-muted text-xs mt-0.5">{truncate(t.notes)}</p>}
      </div>
    </div>
  );
}

function AdminTasksSection({ tasks }: { tasks: AdminTask[] }) {
  return (
    <div className="card-float p-5 mb-4" style={{ borderLeft: "5px solid #8b5cf6" }}>
      <div className="font-bold mb-1">
        📋 Admin tasks this week <span className="text-muted">· {tasks.length}</span>
      </div>
      <div className="text-muted text-xs mb-3">
        Playbook + manual checklist items due this week — get them done so far-out
        events stay on track.
      </div>
      {tasks.length === 0 ? (
        <div className="text-muted text-sm">No admin tasks this week 🎉</div>
      ) : (
        tasks.map((t) => <AdminTaskRow key={t.id} t={t} />)
      )}
    </div>
  );
}

// ── Top 3 for the announcement video (curated per Sunday) ───────────────────

export type Top3Item = { id: string; title: string; isLabel: boolean; requestId: string | null };
export type Top3Option = { id: string; title: string; date: Date };

function Top3Section({ sunday, items, options }: { sunday: Date; items: Top3Item[]; options: Top3Option[] }) {
  const full = items.length >= 3;
  return (
    <div className="card-float p-5 mb-4" style={{ borderLeft: "5px solid #a78bfa" }}>
      <div className="font-bold mb-1">
        ⭐ Announcement video — Top 3 for {fmt(sunday)} <span className="text-muted">· {items.length}/3</span>
      </div>
      <div className="text-muted text-xs mb-3">
        The 3 things to feature on this Sunday&apos;s video — pick upcoming events (any date) or add an awareness item.
      </div>
      {items.length === 0 && <div className="text-muted text-sm mb-2">No Top 3 picked yet.</div>}
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center justify-between gap-3 py-2 border-t border-slate-100 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">{i + 1}</span>
            {it.requestId ? (
              <Link href={`/requests/${it.requestId}`} className="hover:underline truncate"><b>{it.title}</b></Link>
            ) : (
              <span className="truncate"><b>{it.title}</b> <span className="text-muted">· awareness</span></span>
            )}
          </div>
          <form action={removeTop3Item.bind(null, it.id)}>
            <button type="submit" className="text-muted hover:text-red-600 text-xs" aria-label="Remove from Top 3">remove</button>
          </form>
        </div>
      ))}
      {!full && (
        <form action={addTop3Item} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="sunday" value={sunday.toISOString()} />
          <select name="requestId" className="rounded-2xl border px-3 py-1.5 text-sm" defaultValue="">
            <option value="">— pick an upcoming event —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.title} ({fmt(o.date)})</option>
            ))}
          </select>
          <span className="text-muted text-xs">or</span>
          <input name="label" placeholder="awareness item (e.g. Camp Awesome Staff Needs)" className="rounded-2xl border px-3 py-1.5 text-sm flex-1 min-w-[12rem]" />
          <button type="submit" className="btn-primary text-sm">＋ Add</button>
        </form>
      )}
    </div>
  );
}

// ── Standing weekly chores (not tied to any event) ──────────────────────────

export type StandingTaskRow = { id: string; title: string; notes: string | null; area: string | null; done: boolean };

function StandingTasksSection({ tasks }: { tasks: StandingTaskRow[] }) {
  return (
    <div className="card-float p-5 mb-4" style={{ borderLeft: "5px solid #14b8a6" }}>
      <div className="font-bold mb-1">
        🔁 Standing weekly tasks <span className="text-muted">· {tasks.filter((t) => !t.done).length} left</span>
      </div>
      <div className="text-muted text-xs mb-3">
        Recurring chores not tied to an event — they reset every week.
      </div>
      {tasks.length === 0 ? (
        <div className="text-muted text-sm">No standing tasks set up.</div>
      ) : (
        tasks.map((t) => (
          <div key={t.id} className="flex items-start gap-3 py-2 border-t border-slate-100 text-sm">
            <StandingTaskDoneButton id={t.id} done={t.done} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`font-semibold ${t.done ? "line-through text-muted" : ""}`}>{t.title}</span>
                {t.area && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">{t.area}</span>
                )}
              </div>
              {t.notes && <p className="text-muted text-xs mt-0.5">{truncate(t.notes)}</p>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function ThisWeekBoard({
  make,
  atRisk,
  videoLocks,
  loopAdd,
  loopRemove,
  messageUpdates,
  adminTasks,
  standingTasks,
  top3Items,
  top3Options,
  top3Sunday,
  weekStart,
  weekEnd,
}: {
  make: Row[];
  atRisk: Row[];
  videoLocks: Row[];
  loopAdd: LoopChange[];
  loopRemove: LoopChange[];
  messageUpdates: MessageUpdate[];
  adminTasks: AdminTask[];
  standingTasks: StandingTaskRow[];
  top3Items: Top3Item[];
  top3Options: Top3Option[];
  top3Sunday: Date;
  weekStart: Date;
  weekEnd: Date;
}) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-1">This Week ☁️</h1>
      <p className="text-muted mb-5">{fmt(weekStart)} – {fmt(weekEnd)}</p>
      <Top3Section sunday={top3Sunday} items={top3Items} options={top3Options} />
      <StandingTasksSection tasks={standingTasks} />
      <AdminTasksSection tasks={adminTasks} />
      <MessageUpdatesSection updates={messageUpdates} />
      <Section
        title="🎨 Make / Design this week"
        hint="Assets to finish this week — so they're ready before they go out."
        color="#f59e0b"
        rows={make}
        kind="make"
      />
      <Section title="📺 Announcement video — locking this week" color="#a78bfa" rows={videoLocks} kind="video" />
      <LoopSection add={loopAdd} remove={loopRemove} />
      <Section title="⚠️ At risk" color="#ef4444" rows={atRisk} kind="risk" />
    </div>
  );
}
