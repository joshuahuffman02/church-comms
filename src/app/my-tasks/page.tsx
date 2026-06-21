import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { myTasks, type MyTask, type MyTasksResult } from "@/lib/tasks";
import { DeliverableStatusButton } from "@/components/deliverable-status-button";
import { ProofActions } from "@/components/proof-actions";

// Reflects live DB state — render fresh each request.
export const dynamic = "force-dynamic";

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "—";

function TaskRow({ t }: { t: MyTask }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5 border-t border-slate-100 text-sm first:border-t-0 flex-wrap"
      style={{ borderLeft: `4px solid ${t.channelColor}`, paddingLeft: "0.75rem" }}
    >
      <div className="min-w-0">
        <Link href={`/requests/${t.requestId}`} className="font-semibold hover:underline">
          {t.requestTitle}
        </Link>
        <span className="ml-2 font-semibold" style={{ color: t.channelColor }}>
          {t.channelName}
        </span>
        {!t.explicitOwner && (
          <span className="ml-2 text-[11px] text-muted">(from event)</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-muted text-xs">make by {fmt(t.productionDueAt)}</span>
        <ProofActions id={t.id} status={t.status} />
        <DeliverableStatusButton id={t.id} status={t.status} />
      </div>
    </div>
  );
}

function Section({
  title,
  emoji,
  color,
  rows,
}: {
  title: string;
  emoji: string;
  color: string;
  rows: MyTask[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="card-float p-5 mb-4" style={{ borderLeft: `5px solid ${color}` }}>
      <div className="font-bold mb-2">
        {emoji} {title} <span className="text-muted font-normal">· {rows.length}</span>
      </div>
      <div>
        {rows.map((t) => (
          <TaskRow key={t.id} t={t} />
        ))}
      </div>
    </div>
  );
}

export default async function MyTasksPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  const tasks: MyTasksResult = await myTasks(me.id, new Date());

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-1">My Tasks ✅</h1>
      <p className="text-muted mb-5">
        Everything assigned to you{me.name ? `, ${me.name}` : ""} — across every event and channel.
      </p>

      {tasks.total === 0 ? (
        <div className="card-float p-8 text-center">
          <div className="text-4xl mb-2">🌤️</div>
          <h2 className="text-lg font-extrabold mb-1">All clear!</h2>
          <p className="text-muted">
            Nothing is assigned to you right now. Claim a deliverable on any event
            to add it here.
          </p>
        </div>
      ) : (
        <>
          <Section title="Overdue" emoji="⚠️" color="#ef4444" rows={tasks.overdue} />
          <Section title="This week" emoji="🗓️" color="#f59e0b" rows={tasks.thisWeek} />
          <Section title="Awaiting proof" emoji="📝" color="#fbbf24" rows={tasks.awaitingProof} />
          <Section title="Upcoming" emoji="📅" color="#38bdf8" rows={tasks.upcoming} />
        </>
      )}
    </div>
  );
}
