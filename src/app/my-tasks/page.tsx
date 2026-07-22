import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import {
  focusMyTasks,
  myTasks,
  type MyTask,
} from "@/lib/tasks";
import { atMidnight } from "@/lib/engine/dates";
import { isEditor } from "@/lib/roles";
import { DeliverableStatusButton } from "@/components/deliverable-status-button";
import { ProofActions } from "@/components/proof-actions";
import { channelWorkLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

type TaskGroup = {
  requestId: string;
  requestTitle: string;
  eventStart: Date;
  tasks: MyTask[];
};

const SECTION_STYLE = {
  proof: {
    border: "border-l-amber-400",
    badge: "bg-amber-100 text-amber-800",
    eyebrow: "text-amber-800",
  },
  overdue: {
    border: "border-l-rose-500",
    badge: "bg-rose-100 text-rose-800",
    eyebrow: "text-rose-800",
  },
  week: {
    border: "border-l-violet-500",
    badge: "bg-violet-100 text-violet-800",
    eyebrow: "text-violet-800",
  },
  upcoming: {
    border: "border-l-sky-500",
    badge: "bg-sky-100 text-sky-800",
    eyebrow: "text-sky-800",
  },
  backlog: {
    border: "border-l-slate-400",
    badge: "bg-slate-100 text-slate-700",
    eyebrow: "text-slate-700",
  },
} as const;

function formatDate(date: Date | null): string {
  return date
    ? date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "No make-by date";
}

function calendarDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

function dueLabel(date: Date | null, today: Date): { text: string; className: string } {
  if (!date) return { text: "No make-by date", className: "bg-slate-100 text-slate-700" };
  const days = calendarDayNumber(atMidnight(date)) - calendarDayNumber(atMidnight(today));
  if (days < 0) {
    const late = Math.abs(days);
    return {
      text: `${formatDate(date)} · ${late} ${late === 1 ? "day" : "days"} late`,
      className: "bg-rose-100 text-rose-800",
    };
  }
  if (days === 0) return { text: "Due today", className: "bg-amber-100 text-amber-800" };
  if (days === 1) return { text: "Due tomorrow", className: "bg-violet-100 text-violet-800" };
  return { text: `Due ${formatDate(date)}`, className: "bg-slate-100 text-slate-700" };
}

function groupTasks(rows: MyTask[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  for (const task of rows) {
    const group = groups.get(task.requestId) ?? {
      requestId: task.requestId,
      requestTitle: task.requestTitle,
      eventStart: task.eventStart,
      tasks: [],
    };
    group.tasks.push(task);
    groups.set(task.requestId, group);
  }
  return [...groups.values()];
}

function firstEventGroups(rows: MyTask[], limit: number): MyTask[] {
  const allowed = new Set<string>();
  for (const row of rows) {
    if (allowed.has(row.requestId)) continue;
    if (allowed.size >= limit) break;
    allowed.add(row.requestId);
  }
  return rows.filter((row) => allowed.has(row.requestId));
}

function TaskRow({ task, today, canEdit }: { task: MyTask; today: Date; canEdit: boolean }) {
  const due = dueLabel(task.productionDueAt, today);
  const workLabel = channelWorkLabel(task.channelName);
  return (
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: task.channelColor }} />
          <span className="font-semibold text-ink">{workLabel}</span>
          {!task.explicitOwner && (
            <span
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-muted"
              title="This piece is yours because you own the event"
            >
              From event
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">Channel: {task.channelName.replace(/\s*\(Top 3\)$/i, "")}</p>
        <span className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${due.className}`}>
          {due.text}
        </span>
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <ProofActions
            id={task.id}
            status={task.status}
            workLabel={workLabel}
            eventTitle={task.requestTitle}
          />
          <DeliverableStatusButton
            id={task.id}
            status={task.status}
            workLabel={workLabel}
            eventTitle={task.requestTitle}
          />
        </div>
      )}
    </div>
  );
}

function EventTaskGroup({ group, today, canEdit }: { group: TaskGroup; today: Date; canEdit: boolean }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <Link href={`/requests/${group.requestId}`} className="font-bold text-ink hover:text-sky-700 hover:underline">
          {group.requestTitle}
        </Link>
        <span className="text-xs text-muted">Event {formatDate(group.eventStart)}</span>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-muted">
          {group.tasks.length} {group.tasks.length === 1 ? "piece" : "pieces"}
        </span>
      </header>
      <div className="divide-y divide-slate-100">
        {group.tasks.map((task) => (
          <TaskRow key={task.id} task={task} today={today} canEdit={canEdit} />
        ))}
      </div>
    </article>
  );
}

function TaskSection({
  title,
  description,
  rows,
  tone,
  today,
  canEdit,
  footer,
}: {
  title: string;
  description: string;
  rows: MyTask[];
  tone: keyof typeof SECTION_STYLE;
  today: Date;
  canEdit: boolean;
  footer?: React.ReactNode;
}) {
  if (rows.length === 0) return null;
  const style = SECTION_STYLE[tone];
  const groups = groupTasks(rows);
  return (
    <section className={`card-float border-l-[5px] p-5 ${style.border}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-bold uppercase tracking-wide ${style.eyebrow}`}>Your work</p>
          <h2 className="mt-0.5 text-xl font-extrabold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${style.badge}`}>
          {rows.length} {rows.length === 1 ? "piece" : "pieces"} · {groups.length} {groups.length === 1 ? "event" : "events"}
        </span>
      </div>
      <div className="grid gap-3">
        {groups.map((group) => (
          <EventTaskGroup key={group.requestId} group={group} today={today} canEdit={canEdit} />
        ))}
      </div>
      {footer && <div className="mt-4 border-t border-slate-100 pt-4">{footer}</div>}
    </section>
  );
}

function SummaryCard({ label, value, detail, tone }: {
  label: string;
  value: number;
  detail: string;
  tone: "rose" | "violet" | "amber" | "sky";
}) {
  const toneClass = {
    rose: "bg-rose-50 text-rose-800",
    violet: "bg-violet-50 text-violet-800",
    amber: "bg-amber-50 text-amber-800",
    sky: "bg-sky-50 text-sky-800",
  }[tone];
  return (
    <div className={`rounded-2xl px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
      <p className="text-xs font-medium opacity-80">{detail}</p>
    </div>
  );
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  const [params, tasks] = await Promise.all([
    searchParams,
    myTasks(me.id, new Date()),
  ]);
  const today = atMidnight(new Date());
  const focus = focusMyTasks(tasks, today);
  const canEdit = isEditor(me.roles);
  const backlogView = params.view === "backlog";
  const upcomingPreview = firstEventGroups(focus.nearTerm, 4);
  const upcomingHidden = focus.nearTerm.length - upcomingPreview.length;

  if (backlogView) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/my-tasks" className="text-sm font-semibold text-sky-700 hover:underline">← Back to my focus</Link>
            <h1 className="mt-1 text-2xl font-extrabold">Older assignments</h1>
            <p className="mt-1 text-muted">Past-due work older than two weeks, kept separate from today&apos;s queue.</p>
          </div>
          <Link href="/pipeline" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg">
            Open Production →
          </Link>
        </div>
        {focus.oldBacklog.length > 0 ? (
          <TaskSection
            title="Older backlog"
            description="Review these with the team: finish, reschedule, reassign, or mark them skipped."
            rows={focus.oldBacklog}
            tone="backlog"
            today={today}
            canEdit={canEdit}
          />
        ) : (
          <div className="card-float p-8 text-center"><h2 className="text-lg font-extrabold">No older backlog</h2></div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="card-float mb-5 overflow-hidden p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Personal production queue</p>
            <h1 className="mt-1 text-3xl font-extrabold text-ink">My Tasks</h1>
            <p className="mt-1 max-w-2xl text-muted">
              {focus.actionTotal === 0
                ? `Nothing urgent is assigned to you${me.name ? `, ${me.name}` : ""}.`
                : `${focus.actionTotal} ${focus.actionTotal === 1 ? "piece needs" : "pieces need"} your attention${me.name ? `, ${me.name}` : ""}.`}
              {" "}Finished pieces leave this list automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/this-week" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-ink hover:bg-sky-bg">
              This Week →
            </Link>
            <Link href="/pipeline" className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Open Production →
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Recently overdue" value={focus.recentOverdue.length} detail="Past two weeks" tone="rose" />
          <SummaryCard label="Due this week" value={tasks.thisWeek.length} detail="Through Sunday" tone="violet" />
          <SummaryCard label="Proof review" value={tasks.awaitingProof.length} detail="Waiting for sign-off" tone="amber" />
          <SummaryCard label="Coming next" value={focus.nearTerm.length} detail="Next 30 days" tone="sky" />
        </div>
      </header>

      {tasks.total === 0 ? (
        <div className="card-float p-8 text-center">
          <div className="text-4xl">🌤️</div>
          <h2 className="mt-2 text-lg font-extrabold">All clear</h2>
          <p className="mt-1 text-muted">Nothing is assigned to you right now.</p>
          <Link href="/assign" className="mt-4 inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-bg">
            Find work to claim →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          <TaskSection
            title="Ready for your review"
            description="Approve these proofs or send them back by changing their status."
            rows={tasks.awaitingProof}
            tone="proof"
            today={today}
            canEdit={canEdit}
          />
          <TaskSection
            title="Recently overdue"
            description="Still open and due within the last two weeks—start here after proof review."
            rows={focus.recentOverdue}
            tone="overdue"
            today={today}
            canEdit={canEdit}
          />
          <TaskSection
            title="Due this week"
            description="Your remaining make-by deadlines through Sunday."
            rows={tasks.thisWeek}
            tone="week"
            today={today}
            canEdit={canEdit}
          />
          <TaskSection
            title="Coming next"
            description="A short look ahead at the next 30 days, grouped by event."
            rows={upcomingPreview}
            tone="upcoming"
            today={today}
            canEdit={canEdit}
            footer={upcomingHidden > 0 ? (
              <p className="text-sm text-muted">
                {upcomingHidden} more near-term {upcomingHidden === 1 ? "piece is" : "pieces are"} available in{" "}
                <Link href="/pipeline" className="font-semibold text-sky-700 hover:underline">Production →</Link>
              </p>
            ) : undefined}
          />

          {(focus.oldBacklog.length > 0 || focus.later.length > 0) && (
            <section className="grid gap-3 sm:grid-cols-2">
              {focus.oldBacklog.length > 0 && (
                <Link href="/my-tasks?view=backlog" className="card-float group p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Separated from today</p>
                  <p className="mt-1 text-xl font-extrabold text-ink">{focus.oldBacklog.length} older assignments</p>
                  <p className="mt-1 text-sm text-muted">Past due by more than two weeks. Review backlog →</p>
                </Link>
              )}
              {focus.later.length > 0 && (
                <Link href="/pipeline" className="card-float group p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kept out of the daily queue</p>
                  <p className="mt-1 text-xl font-extrabold text-ink">{focus.later.length} later assignments</p>
                  <p className="mt-1 text-sm text-muted">Due more than 30 days from now. Plan in Production →</p>
                </Link>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
