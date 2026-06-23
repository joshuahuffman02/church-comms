import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { PlaybookEditor, type TemplateRow } from "@/components/playbook-editor";
import { SettingsNav } from "@/components/settings-nav";

export default async function PlaybooksSettings() {
  const me = await getSessionUser();

  // Friendly gate — non-admins see a message instead of a 500/redirect loop.
  if (!me || !isAdmin(me.roles)) {
    return (
      <div className="max-w-lg">
        <div className="card-float p-8 text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-xl font-extrabold mb-1">Admins only</h1>
          <p className="text-muted">
            You need an admin role to manage playbooks. Ask an administrator if
            you think this is a mistake.
          </p>
          <Link
            href="/this-week"
            className="mt-5 inline-block rounded-full bg-ink text-white px-5 py-2 text-sm font-semibold"
          >
            Back to the board
          </Link>
        </div>
      </div>
    );
  }

  const templates = await db.eventTemplate.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { tasks: { orderBy: { sortOrder: "asc" } } },
  });

  const rows: TemplateRow[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    active: t.active,
    tasks: t.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      notes: task.notes,
      offsetDays: task.offsetDays,
      category: task.category,
      sortOrder: task.sortOrder,
    })),
  }));

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <h1 className="text-2xl font-extrabold mb-2 mt-2">Event checklists 📋</h1>
      <p className="text-muted mb-5 leading-relaxed">
        Reusable, dated checklists. A checklist (e.g.{" "}
        <b className="text-ink">Mission Trip</b>) is a list of tasks, each with{" "}
        <b className="text-ink">days before the event</b> it’s due plus notes /
        tips. Apply a checklist to an event and the tasks land at the right time —
        and show up on{" "}
        <Link href="/this-week" className="underline">
          This Week
        </Link>{" "}
        as their due dates arrive.
      </p>

      <PlaybookEditor templates={rows} />
    </div>
  );
}
