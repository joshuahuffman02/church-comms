import Link from "next/link";
import { DeliverableStatusButton } from "@/components/deliverable-status-button";
import { UpdateDoneButton } from "@/components/update-done-button";
import { TaskDoneButton } from "@/components/task-done-button";
import { StandingTaskDoneButton } from "@/components/standing-task-done-button";
import { Top3Controls, Top3UnpinButton } from "@/components/top3-controls";
import { KIND_LABEL } from "@/lib/updates";
import { initials } from "@/lib/tasks";
import { titleCase, taskSourceLabel } from "@/lib/labels";
import { DELIVERABLE_STATUS_META } from "@/lib/status";

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

const fmt = (date: Date | null) =>
  date
    ? date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "";
const SECTION_LIMIT = 8;
const truncate = (text: string, length = 140) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

function CardHeading({ id, title, count, hint }: { id: string; title: string; count?: string | number; hint: string }) {
  return (
    <header className="mb-3">
      <h2 id={id} className="font-bold text-ink">
        {title}{count !== undefined && <span className="text-muted"> · {count}</span>}
      </h2>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </header>
  );
}

function OwnerBadge({ name }: { name: string }) {
  return (
    <span
      aria-label={`Owner: ${name}`}
      title={`Owner: ${name}`}
      className="grid h-7 min-w-7 place-items-center rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600"
    >
      {initials(name)}
    </span>
  );
}

function WorkSection({
  id,
  title,
  color,
  rows,
  kind,
  hint,
  canEdit,
}: {
  id: string;
  title: string;
  color: string;
  rows: Row[];
  kind: "make" | "video" | "risk";
  hint: string;
  canEdit: boolean;
}) {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) grouped.set(row.requestId, [...(grouped.get(row.requestId) ?? []), row]);
  const groups = [...grouped.values()];
  const shown = groups.slice(0, SECTION_LIMIT);
  const hiddenItemCount = groups.slice(SECTION_LIMIT).reduce((count, group) => count + group.length, 0);

  return (
    <section aria-labelledby={id} className="card-float p-5" style={{ borderLeft: `5px solid ${color}` }}>
      <CardHeading id={id} title={title} count={rows.length} hint={hint} />
      <ul>
        {shown.map((group) => {
          const first = group[0];
          return (
            <li key={first.requestId} className="border-t border-slate-100 py-3 first:border-t-0 first:pt-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Link href={`/requests/${first.requestId}`} className="min-w-0 font-bold hover:underline">
                  {first.request.title}
                </Link>
                {first.ownerName && <OwnerBadge name={first.ownerName} />}
              </div>
              <ul className="grid gap-2">
                {group.map((row) => {
                  const statusMeta = DELIVERABLE_STATUS_META[row.status] ?? { label: titleCase(row.status), color: "#64748b" };
                  const controlLabel = `${row.request.title}, ${row.channel.name}`;
                  return (
                    <li key={row.id} className="flex flex-col gap-2 rounded-xl bg-slate-50/70 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.channel.color }} />
                        <span className="font-medium">{row.channel.name}</span>
                        <span className="text-xs text-muted">
                          {kind === "video"
                            ? `due ${fmt(row.productionDueAt)} · airs ${fmt(row.instanceDate)}`
                            : `due ${fmt(row.productionDueAt)}`}
                        </span>
                      </div>
                      {kind !== "video" && (
                        canEdit ? (
                          <DeliverableStatusButton id={row.id} status={row.status} label={controlLabel} />
                        ) : (
                          <span
                            className="w-fit rounded-full border px-3 py-1 text-xs font-semibold"
                            style={{ background: `${statusMeta.color}22`, borderColor: `${statusMeta.color}66`, color: statusMeta.color }}
                          >
                            {statusMeta.label}
                          </span>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      {hiddenItemCount > 0 && (
        <Link href="/pipeline" className="mt-2 block border-t border-slate-100 pt-3 text-sm font-semibold text-sky-700 hover:underline">
          {hiddenItemCount} more item{hiddenItemCount === 1 ? "" : "s"} in Production →
        </Link>
      )}
    </section>
  );
}

type LoopChange = {
  id: string;
  requestId?: string;
  request: { id: string; title: string };
  channel: { name: string };
};

function LoopRow({ item, action }: { item: LoopChange; action: "add" | "remove" }) {
  const adding = action === "add";
  return (
    <li className="flex items-center gap-2 border-t border-slate-100 py-2.5 text-sm">
      <span className={`rounded-full px-2 py-1 text-xs font-bold ${adding ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
        {adding ? "+ Add" : "− Remove"}
      </span>
      {item.requestId ? (
        <Link href={`/requests/${item.requestId}`} className="min-w-0 font-bold hover:underline">{item.request.title}</Link>
      ) : (
        <b>{item.request.title}</b>
      )}
    </li>
  );
}

function LoopSection({ add, remove, sunday }: { add: LoopChange[]; remove: LoopChange[]; sunday: Date }) {
  return (
    <section aria-labelledby="loop-heading" className="card-float p-5" style={{ borderLeft: "5px solid #38bdf8" }}>
      <CardHeading
        id="loop-heading"
        title={`🔁 Loop changes for ${fmt(sunday)}`}
        count={add.length + remove.length}
        hint="Only true changes are shown. Slides that continue from last Sunday stay off this list."
      />
      <ul>
        {add.map((item) => <LoopRow key={`add-${item.id}`} item={item} action="add" />)}
        {remove.map((item) => <LoopRow key={`remove-${item.id}`} item={item} action="remove" />)}
      </ul>
    </section>
  );
}

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

function MessageUpdatesSection({ updates, canEdit }: { updates: MessageUpdate[]; canEdit: boolean }) {
  return (
    <section aria-labelledby="message-updates-heading" className="card-float p-5" style={{ borderLeft: "5px solid #f472b6" }}>
      <CardHeading id="message-updates-heading" title="📣 Message updates due this week" count={updates.length} hint="Wording changes that need to land in their channels this week." />
      <ul>
        {updates.map((update) => (
          <li key={update.id} className="flex items-start gap-2 border-t border-slate-100 py-2 first:border-t-0 first:pt-0 text-sm">
            {canEdit && <UpdateDoneButton id={update.id} done={update.done} label={`${update.eventTitle}: ${update.title}`} />}
            <div className="min-w-0 flex-1 py-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/requests/${update.requestId}`} className="font-bold hover:underline">{update.eventTitle}</Link>
                <span className="text-muted">·</span>
                <span className="font-semibold">{update.title}</span>
                {update.kind && KIND_LABEL[update.kind] && (
                  <span className="rounded-full bg-sky-bg px-2 py-0.5 text-xs font-semibold text-sky-700">{KIND_LABEL[update.kind]}</span>
                )}
                <span className="ml-auto text-xs text-muted">{fmt(update.scheduledFor)}</span>
              </div>
              {update.body && <p className="mt-0.5 text-xs text-muted">{truncate(update.body)}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

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

function AdminTasksSection({ tasks, canEdit }: { tasks: AdminTask[]; canEdit: boolean }) {
  return (
    <section aria-labelledby="admin-tasks-heading" className="card-float p-5" style={{ borderLeft: "5px solid #8b5cf6" }}>
      <CardHeading id="admin-tasks-heading" title="📋 Event checklist tasks due" count={tasks.length} hint="Playbook and manual checklist work due this week." />
      <ul>
        {tasks.map((task) => {
          const label = `${task.eventTitle}: ${task.title}`;
          return (
            <li key={task.id} className="flex items-start gap-2 border-t border-slate-100 py-2 first:border-t-0 first:pt-0 text-sm">
              {canEdit && <TaskDoneButton id={task.id} done={task.done} label={label} />}
              <div className="min-w-0 flex-1 py-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={`/requests/${task.requestId}`} className="font-bold hover:underline">{task.eventTitle}</Link>
                  <span className="text-muted">·</span>
                  <span className="font-semibold">{task.title}</span>
                  {task.category && <span className="rounded-full bg-sky-bg px-2 py-0.5 text-xs font-semibold text-sky-700">{titleCase(task.category)}</span>}
                  {taskSourceLabel(task.source) && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">{taskSourceLabel(task.source)}</span>}
                  <span className="ml-auto text-xs text-muted">{fmt(task.dueAt)}</span>
                </div>
                {task.notes && <p className="mt-0.5 text-xs text-muted">{truncate(task.notes)}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export type StandingTaskRow = { id: string; title: string; notes: string | null; area: string | null; done: boolean };

function StandingTasksSection({ tasks, canEdit }: { tasks: StandingTaskRow[]; canEdit: boolean }) {
  return (
    <section aria-labelledby="standing-tasks-heading" className="card-float p-5" style={{ borderLeft: "5px solid #14b8a6" }}>
      <CardHeading id="standing-tasks-heading" title="🔁 Standing weekly tasks" count={`${tasks.length} left`} hint="Recurring chores that reset every Monday." />
      <ul>
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-2 border-t border-slate-100 py-2 first:border-t-0 first:pt-0 text-sm">
            {canEdit && <StandingTaskDoneButton id={task.id} done={task.done} label={task.title} />}
            <div className="min-w-0 flex-1 py-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{task.title}</span>
                {task.area && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">{task.area}</span>}
              </div>
              {task.notes && <p className="mt-0.5 text-xs text-muted">{truncate(task.notes)}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
  canEdit,
}: {
  sunday: Date;
  items: Top3Item[];
  options: Top3Option[];
  capacity: number;
  heldCount: number;
  issues: string[];
  canEdit: boolean;
}) {
  const protectedCount = items.filter((item) => item.source !== "automatic").length;
  const protectedFull = protectedCount >= capacity;
  const removable = items.flatMap((item) => item.pickId ? [{ id: item.pickId, title: item.title }] : []);
  const controlOptions = options.map((option) => ({ id: option.id, label: `${option.title} (${fmt(option.date)})` }));

  return (
    <section aria-labelledby="top3-heading" className="card-float p-5" style={{ borderLeft: "5px solid #a78bfa" }}>
      <CardHeading
        id="top3-heading"
        title={`⭐ Announcement video airing ${fmt(sunday)}`}
        count={`${items.length}/${capacity}`}
        hint="This exact lineup is shared by This Week, Sunday Checklist, the output page, and exports. Featured and locked items cannot be displaced by a new event."
      />
      {issues.map((issue) => <p key={issue} role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{issue}</p>)}
      {items.length === 0 && <p className="text-sm text-muted">No eligible slides for this Sunday.</p>}
      <ol>
        {items.map((item, index) => (
          <li key={item.key} className="flex flex-col gap-1 border-t border-slate-100 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">{index + 1}</span>
              {item.requestId ? <Link href={`/requests/${item.requestId}`} className="min-w-0 font-bold hover:underline">{item.title}</Link> : <b>{item.title}</b>}
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">{TOP3_SOURCE_LABEL[item.source]}</span>
              {item.locked && <span title="New events cannot displace this slot" aria-label="Locked slot">🔒</span>}
              {item.missingTouch && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">slide missing</span>}
            </div>
            {canEdit && item.pickId && (
              <Top3UnpinButton
                id={item.pickId}
                title={item.title}
                kind={item.source === "awareness" ? "note" : "event"}
              />
            )}
          </li>
        ))}
      </ol>
      {heldCount > 0 && <p className="mt-2 text-xs text-muted">{heldCount} eligible event{heldCount === 1 ? " is" : "s are"} waiting outside the {capacity} available slots.</p>}
      {canEdit ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <Top3Controls sundayIso={sunday.toISOString()} options={controlOptions} removable={removable} protectedFull={protectedFull} capacity={capacity} />
        </div>
      ) : (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-muted">View only — an editor can change this lineup.</p>
      )}
    </section>
  );
}

function OldBacklogSection({ count }: { count: number }) {
  return (
    <section aria-labelledby="old-backlog-heading" className="rounded-2xl border border-slate-200 bg-white/70 p-4">
      <h2 id="old-backlog-heading" className="font-bold text-ink">🧹 Old backlog <span className="text-muted">· {count}</span></h2>
      <p className="mt-1 text-xs text-muted">Unfinished items more than two weeks past due are kept out of today’s work list.</p>
      <Link href="/pipeline" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-sky-700 hover:underline">Review backlog in Production →</Link>
    </section>
  );
}

function SummaryChip({ label, count, tone }: { label: string; count: number | string; tone: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/75 px-3 py-2 shadow-sm">
      <div className={`text-lg font-extrabold ${tone}`}>{count}</div>
      <div className="text-[11px] font-semibold text-muted">{label}</div>
    </div>
  );
}

export function ThisWeekBoard({
  make,
  atRisk,
  staleAtRiskCount,
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
  canEdit,
  weekStart,
  weekEnd,
}: {
  make: Row[];
  atRisk: Row[];
  staleAtRiskCount: number;
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
  canEdit: boolean;
  weekStart: Date;
  weekEnd: Date;
}) {
  const workCount = atRisk.length + make.length + videoLocks.length + messageUpdates.length + adminTasks.length + standingTasks.length;
  const sundayChangeCount = loopAdd.length + loopRemove.length;
  const allCaughtUp = workCount === 0 && sundayChangeCount === 0;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold text-ink">This Week ☁️</h1>
        <p className="mt-1 text-sm text-muted">{fmt(weekStart)} – {fmt(weekEnd)} · current production on the left, Sunday decisions on the right.</p>
        <div className="mt-4 grid max-w-xl grid-cols-3 gap-2">
          <SummaryChip label="work items" count={workCount} tone={workCount ? "text-amber-700" : "text-emerald-700"} />
          <SummaryChip label="Sunday changes" count={sundayChangeCount} tone="text-sky-700" />
          <SummaryChip label="video lineup" count={`${top3Items.length}/${top3Capacity}`} tone="text-violet-700" />
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div className="grid gap-4">
          {atRisk.length > 0 && <WorkSection id="at-risk-heading" title="⚠️ Recently overdue" hint="Past due within the last two weeks and still unfinished. Older items are separated below." color="#ef4444" rows={atRisk} kind="risk" canEdit={canEdit} />}
          {make.length > 0 && <WorkSection id="make-heading" title="🎨 Make this week" hint="Assets due this week, ordered by make-by date and grouped by event." color="#f59e0b" rows={make} kind="make" canEdit={canEdit} />}
          {standingTasks.length > 0 && <StandingTasksSection tasks={standingTasks} canEdit={canEdit} />}
          {adminTasks.length > 0 && <AdminTasksSection tasks={adminTasks} canEdit={canEdit} />}
          {messageUpdates.length > 0 && <MessageUpdatesSection updates={messageUpdates} canEdit={canEdit} />}
          {staleAtRiskCount > 0 && <OldBacklogSection count={staleAtRiskCount} />}
          {allCaughtUp && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">Nothing else needs you this week ✨</p>}
        </div>

        <div className="grid gap-4">
          {(loopAdd.length > 0 || loopRemove.length > 0) && <LoopSection add={loopAdd} remove={loopRemove} sunday={top3Sunday} />}
          <Top3Section sunday={top3Sunday} items={top3Items} options={top3Options} capacity={top3Capacity} heldCount={top3HeldCount} issues={top3Issues} canEdit={canEdit} />
          {videoLocks.length > 0 && <WorkSection id="video-assets-heading" title="📺 Video assets due this week" hint="These assets are due now for the upcoming Sunday air dates shown below." color="#a78bfa" rows={videoLocks} kind="video" canEdit={canEdit} />}
        </div>
      </div>
    </div>
  );
}
