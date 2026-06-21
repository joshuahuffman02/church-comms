import { createRequest } from "@/actions/requests";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isEditor } from "@/lib/roles";
import { AccessRequiredCard } from "@/components/access-required-card";

export default async function NewRequest() {
  const me = await getSessionUser();
  if (!me || !isEditor(me.roles)) {
    return (
      <AccessRequiredCard
        title="Editor access required"
        message="You need editor access to create and schedule communication requests."
      />
    );
  }

  const ministries = await db.ministry.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return (
    <form action={createRequest} className="card-float p-6 max-w-xl grid gap-3">
      <h1 className="text-2xl font-extrabold">New Request ➕</h1>
      <input name="title" required placeholder="Event title" className="rounded-2xl border px-4 py-2" />
      <textarea name="description" placeholder="What's happening?" className="rounded-2xl border px-4 py-2" />

      <label className="text-sm text-muted">Ministries (pick all that apply — they&apos;re all equal)</label>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border px-4 py-3">
        {ministries.map((m) => (
          <label key={m.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="ministryId" value={m.id} className="h-4 w-4" />
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: m.color }} />
            {m.name}
          </label>
        ))}
      </div>

      <label className="text-sm text-muted">Who is it for?</label>
      <select name="whoIsItFor" className="rounded-2xl border px-4 py-2">
        <option value="whole_church">Whole church</option>
        <option value="ministry">A specific ministry</option>
        <option value="small_group">A small group / team</option>
        <option value="leadership">Leadership</option>
      </select>
      <label className="text-sm text-muted">Event date</label>
      <input name="eventStart" type="date" required className="rounded-2xl border px-4 py-2" />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input name="needsRegistration" type="checkbox" className="h-4 w-4" />
        Needs registration
      </label>
      <label className="text-sm text-muted">Registration closes (optional · schedule runs backward from this)</label>
      <input name="registrationClosesAt" type="date" className="rounded-2xl border px-4 py-2" />
      <input name="nextStep" placeholder="One next step (e.g. Register at church.org/vbs)" className="rounded-2xl border px-4 py-2" />
      <p className="text-xs text-muted">
        Already on the Planning Center calendar? Create it here, then use
        &ldquo;Link to a Planning Center event&rdquo; on the next screen to attach
        it.
      </p>
      <p className="text-xs text-muted">
        Launching a <b className="text-ink">sermon series</b>? Create it like any
        event, then tag it &ldquo;Sermon Series&rdquo; in Planning Center (or set
        it no-promo) — it won&apos;t fan out across ad channels, and the event page
        will offer the Sermon Series brand/asset playbook to apply.
      </p>
      <button className="rounded-full bg-ink text-white py-2 font-semibold">Create &amp; schedule →</button>
    </form>
  );
}
