import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { createQuickItem } from "@/actions/quick-items";
import { AccessRequiredCard } from "@/components/access-required-card";

/**
 * "Quick Item" creation page — for standalone channel tasks that aren't a full
 * event. Auth-gated server component posting to the createQuickItem action and
 * redirecting to /outputs on success.
 */
export default async function NewQuickItem() {
  const me = await getSessionUser();
  if (!me || !isEditor(me.roles)) {
    return (
      <AccessRequiredCard
        title="Editor access required"
        message="You need editor access to add standalone communication items."
      />
    );
  }

  const channels = await db.channel.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  async function submit(fd: FormData) {
    "use server";
    await createQuickItem(fd);
    redirect("/outputs");
  }

  return (
    <form action={submit} className="card-float p-6 max-w-xl grid gap-3">
      <h1 className="text-2xl font-extrabold">Quick post ⚡</h1>
      <p className="text-sm text-muted">
        For standalone things that aren&apos;t a full event — e.g. &ldquo;Website:
        bold Easter service times&rdquo;, or &ldquo;App push: parking
        reminder&rdquo;. It shows up on the chosen channel for that week.
      </p>

      <label className="text-sm text-muted">What needs to happen?</label>
      <input
        name="title"
        required
        placeholder="e.g. Website: bold Easter service times on the homepage"
        className="rounded-2xl border px-4 py-2"
      />

      <label className="text-sm text-muted">Which channel?</label>
      <select name="channelId" required className="rounded-2xl border px-4 py-2">
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <label className="text-sm text-muted">When (the day it should be live)</label>
      <input name="date" type="date" required className="rounded-2xl border px-4 py-2" />

      <label className="text-sm text-muted">Asset link (optional)</label>
      <input
        name="assetLink"
        type="url"
        placeholder="https://… (Canva, Drive, etc.)"
        className="rounded-2xl border px-4 py-2"
      />

      <label className="text-sm text-muted">Note (optional)</label>
      <textarea
        name="note"
        placeholder="Anything the designer/publisher should know"
        className="rounded-2xl border px-4 py-2"
      />

      <button className="rounded-full bg-ink text-white py-2 font-semibold">
        Add quick item →
      </button>
    </form>
  );
}
