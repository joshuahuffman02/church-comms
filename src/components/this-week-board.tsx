import Link from "next/link";
import { DeliverableStatusButton } from "@/components/deliverable-status-button";
import { UpdateDoneButton } from "@/components/update-done-button";
import { TaskDoneButton } from "@/components/task-done-button";
import { StandingTaskDoneButton } from "@/components/standing-task-done-button";
import { addTop3Item, removeTop3Item, replaceTop3Item } from "@/actions/video-top3";
import { KIND_LABEL } from "@/lib/updates";
import { initials } from "@/lib/tasks";
import { titleCase, taskSourceLabel } from "@/lib/labels";

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

// Cap long lists so a backlog (e.g. lots of past-due imported events) doesn't
// become a wall — show the soonest few, then a link to the full board.
const SECTION_LIMIT = 8;

function Section({ title, color, rows, kind, hint }: { title: string; color: string; rows: Row[]; kind: "make" | "video" | "risk"; hint?: string }) {
  const shown = rows.slice(0, SECTION_LIMIT);
  const more = rows.length - shown.length;
  return (
    <div className="card-float p-5 mb-4" style={{ borderLeft: `5px solid ${color}` }}>
      <div className="font-bold mb-1">{title} <span className="text-muted">· {rows.length}</span></div>
      {hint && <div className="text-muted text-xs mb-3">{hint}</div>}
      {!hint && <div className="mb-2" />}
      {rows.length === 0 && <div className="text-muted text-sm">Nothing here this week 🎉</div>}
      {shown.map(r => (
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
            <span className="text-muted">
              {kind === "video"
                ? `due ${fmt(r.productionDueAt)} · airs ${fmt(r.instanceDate)}`
                : `due ${fmt(r.productionDueAt)}`}
            </span>
            {(kind === "make" || kind === "risk") && <DeliverableStatusButton id={r.id} status={r.status} />}
          </div>
        </div>
      ))}
      {more > 0 && (
        <Link
          href="/pipeline"
          className="mt-1 block border-t border-slate-100 pt-3 text-sm font-semibold text-sky-600 hover:underline"
        >
          +{more} more — see all in Production →
        </Link>
      )}
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
      <div className="font-bold mb-1">🔁 Loop changes for Sunday</div>
      <div className="text-muted text-xs mb-3">Slides to add or remove from the pre-service loop.</div>
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
      <UpdateDoneButton id={u.id} done={u.done} label={`${u.eventTitle}: ${u.title}`} />
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
              {titleCase(t.category)}
            </span>
          )}
          {taskSourceLabel(t.source) && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              {taskSourceLabel(t.source)}
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

export type Top3Item = {
  key: string;
  pickId: string | null;
  title: string;
  requestId: string | null;
  source: "manual" | "awareness" | "locked" | "automatic";
  locked: boolean;
  missingTouch: boolean;
};
export type Top3Option = { id: string; title: string; date: Date };

const TOP3_SOURCE_LABEL: Record<Top3Item["source"], string> = {
  manual: "featured",
  awareness: "awareness",
  locked: "locked",
  automatic: "auto-filled",
};

function Top3Section({
  sunday,
  items,
  options,
  capacity,
  heldCount,
  issues,
}: {
  sunday: Date;
  items: Top3Item[];
  options: Top3Option[];
  capacity: number;
  heldCount: number;
  issues: string[];
}) {
  const manualItems = items.filter((item) => item.pickId);
  const manualFull = manualItems.length >= capacity;
  return (
    <div className="card-float p-5 mb-4" style={{ borderLeft: "5px solid #a78bfa" }}>
      <div className="font-bold mb-1">
        ⭐ Announcement video for {fmt(sunday)} <span className="text-muted">· {items.length}/{capacity}</span>
      </div>
      <div className="text-muted text-xs mb-3">
        One final lineup now powers this page, Sunday Checklist, the output page,
        and both exports. Featured and locked items lead; open slots fill automatically.
      </div>
      {issues.map((issue) => (
        <p key={issue} role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {issue}
        </p>
      ))}
      {items.length === 0 && <div className="text-muted text-sm mb-2">No eligible slides for this Sunday.</div>}
      {items.map((it, i) => (
        <div key={it.key} className="flex items-center justify-between gap-3 py-2 border-t border-slate-100 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">{i + 1}</span>
            {it.requestId ? (
              <Link href={`/requests/${it.requestId}`} className="hover:underline truncate"><b>{it.title}</b></Link>
            ) : (
              <span className="truncate"><b>{it.title}</b></span>
            )}
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">
              {TOP3_SOURCE_LABEL[it.source]}
            </span>
            {it.locked && <span title="New events cannot displace this slot" aria-label="locked">🔒</span>}
            {it.missingTouch && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">slide missing</span>}
          </div>
          {it.pickId && (
            <form action={removeTop3Item.bind(null, it.pickId)}>
              <button type="submit" className="text-muted hover:text-red-700 text-xs" aria-label={`Stop featuring ${it.title}`}>remove feature</button>
            </form>
          )}
        </div>
      ))}
      {heldCount > 0 && (
        <p className="mt-2 text-xs text-muted">
          {heldCount} eligible event{heldCount === 1 ? " is" : "s are"} waiting outside the {capacity} available slots.
        </p>
      )}
      {!manualFull && (
        <form action={addTop3Item} className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
          <input type="hidden" name="sunday" value={sunday.toISOString()} />
          <select name="requestId" className="w-full rounded-2xl border px-3 py-1.5 text-sm" defaultValue="">
            <option value="">— pick an upcoming event —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.title} ({fmt(o.date)})</option>
            ))}
          </select>
          <div className="text-muted text-xs">or add an awareness item:</div>
          <div className="flex gap-2">
            <input name="label" placeholder="e.g. Camp Awesome staff needs" className="min-w-0 flex-1 rounded-2xl border px-3 py-1.5 text-sm" />
            <button type="submit" className="btn-primary shrink-0 text-sm">＋ Add</button>
          </div>
        </form>
      )}
      {manualFull && options.length > 0 && (
        <form action={replaceTop3Item} className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
          <div className="text-muted text-xs">All {capacity} manual slots are used — swap one in a single step:</div>
          <div className="flex flex-wrap items-center gap-2">
            <select name="removeId" defaultValue="" required className="min-w-0 flex-1 rounded-2xl border px-3 py-1.5 text-sm">
              <option value="" disabled>— take off —</option>
              {manualItems.map((it) => (
                <option key={it.pickId} value={it.pickId ?? ""}>{it.title}</option>
              ))}
            </select>
            <span className="text-muted text-xs">with</span>
            <select name="requestId" defaultValue="" required className="min-w-0 flex-1 rounded-2xl border px-3 py-1.5 text-sm">
              <option value="" disabled>— add event —</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.title} ({fmt(o.date)})</option>
              ))}
            </select>
            <button type="submit" className="btn-primary shrink-0 text-sm">Swap</button>
          </div>
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
  top3Capacity,
  top3HeldCount,
  top3Issues,
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
  top3Capacity: number;
  top3HeldCount: number;
  top3Issues: string[];
  weekStart: Date;
  weekEnd: Date;
}) {
  // A quiet week shouldn't be eight near-empty cards. Render only the sections
  // that need the user this week; the Top-3 picker always shows (it's the weekly
  // curation action, not a to-do). Most urgent first, planning last.
  const standingLeft = standingTasks.filter((t) => !t.done).length;
  const allCaughtUp =
    atRisk.length === 0 &&
    make.length === 0 &&
    videoLocks.length === 0 &&
    loopAdd.length === 0 &&
    loopRemove.length === 0 &&
    messageUpdates.length === 0 &&
    adminTasks.length === 0 &&
    standingLeft === 0;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-1">This Week ☁️</h1>
      <p className="text-muted mb-5">{fmt(weekStart)} – {fmt(weekEnd)}</p>

      {atRisk.length > 0 && (
        <Section
          title="⚠️ At risk"
          hint="Past their make-by date and not finished yet — bump the date or mark it done."
          color="#ef4444"
          rows={atRisk}
          kind="risk"
        />
      )}
      {make.length > 0 && (
        <Section
          title="🎨 Make this week"
          hint="Assets to finish this week — so they're ready before they go out."
          color="#f59e0b"
          rows={make}
          kind="make"
        />
      )}
      {standingTasks.length > 0 && <StandingTasksSection tasks={standingTasks} />}
      {adminTasks.length > 0 && <AdminTasksSection tasks={adminTasks} />}
      {messageUpdates.length > 0 && <MessageUpdatesSection updates={messageUpdates} />}
      {(loopAdd.length > 0 || loopRemove.length > 0) && (
        <LoopSection add={loopAdd} remove={loopRemove} />
      )}
      <Top3Section
        sunday={top3Sunday}
        items={top3Items}
        options={top3Options}
        capacity={top3Capacity}
        heldCount={top3HeldCount}
        issues={top3Issues}
      />
      {videoLocks.length > 0 && (
        <Section
          title="📺 Announcement video assets due this week"
          hint="Production due now for the Sunday air dates shown on each row."
          color="#a78bfa"
          rows={videoLocks}
          kind="video"
        />
      )}

      {allCaughtUp && (
        <p className="text-muted mt-2 text-center text-sm">
          Nothing else needs you this week ✨
        </p>
      )}
    </div>
  );
}
