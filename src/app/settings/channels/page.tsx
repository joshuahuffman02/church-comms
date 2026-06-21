import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { updateChannel, createChannel } from "@/actions/channels";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { ChannelDeleteButton } from "@/components/channel-delete-button";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export default async function Channels() {
  const me = await getSessionUser();
  if (!me || !isAdmin(me.roles)) {
    return <AdminOnlyCard area="outputs and channels" />;
  }

  const channels = await db.channel.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-2">Outputs &amp; channels ⚙️</h1>

      <p className="text-muted mb-4 leading-relaxed">
        Each output has two timings. <b className="text-ink">Goes out</b> = how
        many days before the event it starts appearing on that channel.{" "}
        <b className="text-ink">Asset due</b> = how many days before <i>that</i>{" "}
        the finished graphic/video must be ready. The{" "}
        <Link href="/this-week" className="underline">
          Make / Design this week
        </Link>{" "}
        board lists assets whose <i>Asset due</i> date lands this week.
      </p>

      <div className="card-float p-4 mb-4 flex flex-wrap items-center gap-4 text-sm font-semibold">
        <Link href="/settings/ministries" className="hover:underline">
          🎨 Ministries
        </Link>
        <Link href="/settings/users" className="hover:underline">
          👥 Team &amp; access
        </Link>
        <Link href="/settings/sprints" className="hover:underline">
          🏃 Sprints
        </Link>
        <Link href="/settings/approvals" className="hover:underline">
          ✅ Approvals
        </Link>
        <Link href="/settings/video-script" className="hover:underline">
          🎬 Video script
        </Link>
        <Link href="/settings/playbooks" className="hover:underline">
          📋 Playbooks
        </Link>
        <Link href="/settings/tag-rules" className="hover:underline">
          🏷️ Tag rules
        </Link>
        <Link href="/guardrails" className="hover:underline">
          🛡️ Guardrails
        </Link>
      </div>

      {channels.map((c) => (
        <form
          key={c.id}
          action={updateChannel}
          className="card-float p-4 mb-3 flex items-center gap-3 flex-wrap"
        >
          <input type="hidden" name="id" value={c.id} />
          <span className="w-44 font-semibold" style={{ color: c.color }}>
            {c.name}
          </span>
          <label className="text-sm text-muted">
            Goes out:
            <input
              name="offset"
              type="number"
              defaultValue={c.defaultPublishOffsetDays}
              className="w-16 rounded-full border px-2 py-1 mx-1"
            />
            days before the event
          </label>
          <label className="text-sm text-muted">
            Asset due:
            <input
              name="lead"
              type="number"
              defaultValue={c.productionLeadDays}
              className="w-16 rounded-full border px-2 py-1 mx-1"
            />
            days before it goes out
          </label>
          <label className="text-sm text-muted">
            Weekly cap:
            <input
              name="cap"
              type="number"
              min={0}
              defaultValue={c.frequencyCap ?? ""}
              placeholder="—"
              className="w-16 rounded-full border px-2 py-1 mx-1"
            />
            events/week (blank = no cap)
          </label>
          <label className="text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={c.active}
              className="mr-1"
            />
            active
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button className="rounded-full bg-ink text-white px-4 py-1 text-sm font-semibold">
              Save
            </button>
            <ChannelDeleteButton id={c.id} />
          </div>
          <label className="w-full text-sm text-muted">
            <span className="block mb-1 font-semibold text-ink">
              Production notes
            </span>
            <textarea
              name="productionNotes"
              defaultValue={c.productionNotes ?? ""}
              rows={2}
              placeholder="e.g. Banner is 3'x8' vinyl; submit art 3 weeks ahead; order 2 in case of weather"
              className="w-full rounded-2xl border px-3 py-2 font-normal resize-y"
            />
            <span className="block mt-1 text-xs">
              Reference shown on this output’s page header — dimensions, lead
              times, lessons learned.
            </span>
          </label>
        </form>
      ))}

      {/* ---- Add a new output / channel ----------------------------------- */}
      <details className="card-float p-4 mt-6">
        <summary className="cursor-pointer font-semibold text-ink select-none">
          ＋ Add output / channel
        </summary>
        <form action={createChannel} className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold">
              Name
              <input
                name="name"
                required
                placeholder="e.g. Instagram"
                className="ml-2 rounded-full border px-3 py-1 text-sm font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Type
              <select
                name="type"
                defaultValue="windowed"
                className="ml-2 rounded-full border px-3 py-1 text-sm font-normal"
              >
                <option value="windowed">Windowed (runs over a span)</option>
                <option value="dated_instance">Dated instance (one airing)</option>
                <option value="one_shot">One-shot (single send)</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Color
              <input
                name="color"
                type="color"
                defaultValue="#93c5fd"
                className="ml-2 h-8 w-12 rounded border align-middle"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
            <label>
              Goes out:
              <input
                name="offset"
                type="number"
                defaultValue={14}
                className="w-16 rounded-full border px-2 py-1 mx-1"
              />
              days before the event
            </label>
            <label>
              Asset due:
              <input
                name="lead"
                type="number"
                defaultValue={7}
                className="w-16 rounded-full border px-2 py-1 mx-1"
              />
              days before it goes out
            </label>
            <label>
              Capacity (optional):
              <input
                name="capacity"
                type="number"
                placeholder="—"
                className="w-16 rounded-full border px-2 py-1 mx-1"
              />
            </label>
          </div>

          <fieldset className="text-sm">
            <legend className="font-semibold mb-1">Who can use it (tiers)</legend>
            <div className="flex gap-4 text-muted">
              {[1, 2, 3].map((t) => (
                <label key={t}>
                  <input
                    type="checkbox"
                    name="tier"
                    value={t}
                    defaultChecked
                    className="mr-1"
                  />
                  Tier {t}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="text-sm">
            <legend className="font-semibold mb-1">
              Cadence — which weekdays it posts (windowed only)
            </legend>
            <div className="flex flex-wrap gap-3 text-muted">
              {WEEKDAYS.map((d) => (
                <label key={d.value}>
                  <input
                    type="checkbox"
                    name="weekday"
                    value={d.value}
                    defaultChecked={d.value === 0}
                    className="mr-1"
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <button className="rounded-full bg-ink text-white px-5 py-1.5 text-sm font-semibold">
              Add output
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
