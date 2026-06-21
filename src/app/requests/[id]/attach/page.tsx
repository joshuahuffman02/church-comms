import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { AccessRequiredCard } from "@/components/access-required-card";
import { AttachChannel } from "@/components/attach-channel";

/**
 * Manual channel-attach page for an existing event. Auth-gated. Shows the event
 * title, the outputs already on it, and the "+ Add output" form that creates a
 * deliverable+touch on any channel (tier eligibility bypassed).
 */
export default async function AttachOutputPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!isEditor(me.roles)) {
    return (
      <AccessRequiredCard
        title="Editor access required"
        message="You need editor access to add outputs to an event."
      />
    );
  }

  const { id } = await params;
  const request = await db.request.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      deliverables: { select: { channel: { select: { name: true, color: true } } } },
    },
  });
  if (!request) notFound();

  const channels = await db.channel.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  const existing = request.deliverables.map((d) => d.channel);

  return (
    <div className="max-w-2xl">
      <Link
        href={`/requests/${request.id}`}
        className="text-sm text-muted hover:underline"
      >
        ← Back to event
      </Link>

      <div className="card-float p-6 mt-2">
        <h1 className="text-2xl font-extrabold mb-1">Add an output</h1>
        <p className="text-muted mb-1">
          to <span className="font-semibold text-ink">{request.title}</span>
        </p>
        <p className="text-sm text-muted mb-5">
          Manually attach a channel the auto-scheduler didn&apos;t add — e.g. the
          Opportunities Table or an extra Loop week. This bypasses the usual tier
          rules.
        </p>

        {existing.length > 0 && (
          <div className="mb-5">
            <div className="text-xs font-extrabold uppercase text-muted mb-2">
              Already on this event
            </div>
            <div className="flex flex-wrap gap-2">
              {existing.map((c, i) => (
                <span
                  key={`${c.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-muted"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: c.color }}
                  />
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <AttachChannel requestId={request.id} channels={channels} />
      </div>
    </div>
  );
}
