import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { createMinistry, updateMinistry } from "@/actions/ministries";
import { MinistryDeleteButton } from "@/components/ministry-delete-button";

// Reflects live DB state — render fresh each request.
export const dynamic = "force-dynamic";

export default async function MinistriesSettings() {
  // Admin-gated (mirrors the rest of /settings). Server actions re-check too.
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!isAdmin(me.roles)) redirect("/settings/channels");

  const ministries = await db.ministry.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { events: true, requests: true, series: true } },
    },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-2">Ministries 🎨</h1>
      <p className="text-muted mb-4 leading-relaxed">
        Ministries are the colored tags on every event. An event can belong to{" "}
        <b className="text-ink">several at once</b> — they&apos;re all equal.
        Reorder with <b className="text-ink">Sort</b>, hide one with{" "}
        <b className="text-ink">active</b>, and a ministry that&apos;s in use is
        deactivated (not deleted) so existing events keep their tag.
      </p>

      <div className="card-float p-4 mb-4 flex flex-wrap items-center gap-4 text-sm font-semibold">
        <Link href="/settings/channels" className="hover:underline">
          ⚙️ Outputs &amp; channels
        </Link>
        <Link href="/settings/users" className="hover:underline">
          👥 Team &amp; access
        </Link>
        <Link href="/settings/approvals" className="hover:underline">
          ✅ Approvals
        </Link>
      </div>

      {ministries.map((m) => {
        const inUse = m._count.events + m._count.requests + m._count.series > 0;
        return (
          <form
            key={m.id}
            action={updateMinistry.bind(null, m.id)}
            className="card-float p-4 mb-3 flex items-center gap-3 flex-wrap"
          >
            <input
              type="color"
              name="color"
              defaultValue={m.color}
              className="h-8 w-10 rounded border align-middle shrink-0"
              title="Ministry color"
            />
            <input
              name="name"
              defaultValue={m.name}
              className="w-40 rounded-full border px-3 py-1 text-sm font-semibold"
            />
            <label className="text-sm text-muted">
              Sort
              <input
                name="sortOrder"
                type="number"
                defaultValue={m.sortOrder}
                className="w-16 rounded-full border px-2 py-1 mx-1"
              />
            </label>
            <label className="text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={m.active}
                className="mr-1"
              />
              active
            </label>
            <span className="text-xs text-muted">
              {inUse ? `${m._count.events} event${m._count.events === 1 ? "" : "s"}` : "unused"}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button className="rounded-full bg-ink text-white px-4 py-1 text-sm font-semibold">
                Save
              </button>
              <MinistryDeleteButton id={m.id} inUse={inUse} />
            </div>
          </form>
        );
      })}

      {/* ---- Add a new ministry ------------------------------------------- */}
      <details className="card-float p-4 mt-6">
        <summary className="cursor-pointer font-semibold text-ink select-none">
          ＋ Add ministry
        </summary>
        <form action={createMinistry} className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold">
            Color
            <input
              name="color"
              type="color"
              defaultValue="#c7b9ff"
              className="ml-2 h-8 w-12 rounded border align-middle"
            />
          </label>
          <label className="text-sm font-semibold">
            Name
            <input
              name="name"
              required
              placeholder="e.g. Young Adults"
              className="ml-2 rounded-full border px-3 py-1 text-sm font-normal"
            />
          </label>
          <label className="text-sm">
            <input type="checkbox" name="active" defaultChecked className="mr-1" />
            active
          </label>
          <button className="rounded-full bg-ink text-white px-5 py-1.5 text-sm font-semibold">
            Add ministry
          </button>
        </form>
      </details>
    </div>
  );
}
