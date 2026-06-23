import Link from "next/link";
import { SettingsNav } from "@/components/settings-nav";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { createTagRule, updateTagRule } from "@/actions/tag-rules";
import { TagRuleDeleteButton } from "@/components/tag-rule-delete-button";

const TIERS = [1, 2, 3];

export default async function TagRulesSettings() {
  const me = await getSessionUser();

  // Friendly gate — non-admins see a message instead of a 500/redirect loop.
  if (!me || !isAdmin(me.roles)) {
    return (
      <div className="max-w-lg">
        <div className="card-float p-8 text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-xl font-extrabold mb-1">Admins only</h1>
          <p className="text-muted">
            You need an admin role to manage tag rules. Ask an administrator if
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

  const [rules, ministries, templates] = await Promise.all([
    db.eventTagRule.findMany({
      orderBy: [{ sortOrder: "asc" }, { tag: "asc" }],
      include: { ministry: { select: { name: true, color: true } } },
    }),
    db.ministry.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.eventTemplate.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const inputCls = "rounded-full border px-3 py-1 text-sm";
  const selectCls = "rounded-full border px-3 py-1 text-sm";

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <h1 className="text-2xl font-extrabold mb-2 mt-2">Tag rules 🏷️</h1>
      <p className="text-muted mb-5 leading-relaxed">
        Map a <b className="text-ink">Planning Center tag</b> to a{" "}
        <b className="text-ink">ministry</b> and a suggested{" "}
        <b className="text-ink">tier</b>, plus routing controls. When a tagged
        event syncs in, matching rules classify it automatically — a well-tagged
        event lands already sorted. Matching is case-insensitive. The{" "}
        <b className="text-ink">tier</b> is advisory (the broadest/lowest across
        an event&apos;s tags wins); the comms team still confirms it at triage.{" "}
        <b className="text-ink">No promo</b> (a &ldquo;Room Only&rdquo; tag) keeps
        the event out of the comms queue. A{" "}
        <b className="text-ink">suggested checklist</b> surfaces a one-click
        &ldquo;apply this checklist?&rdquo; hint on a matching event (e.g. a
        &ldquo;Sermon Series&rdquo; tag offers the Sermon Series checklist).
      </p>

      {rules.length === 0 && (
        <div className="card-float p-6 mb-4 text-center text-muted text-sm">
          No tag rules yet — add one below to start sorting tagged events automatically.
        </div>
      )}

      {rules.map((r) => (
        <form
          key={r.id}
          action={updateTagRule.bind(null, r.id)}
          className="card-float p-4 mb-3 flex items-center gap-3 flex-wrap"
        >
          <label className="text-sm font-semibold">
            <span className="sr-only">Tag</span>
            <span className="mr-1">🏷️</span>
            <input
              name="tag"
              defaultValue={r.tag}
              required
              className={`${inputCls} w-44 font-normal`}
            />
          </label>

          <label className="text-sm text-muted">
            Ministry
            <select name="ministryId" defaultValue={r.ministryId ?? ""} className={`${selectCls} ml-1`}>
              <option value="">— none —</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-muted">
            Tier
            <select name="tier" defaultValue={r.tierSuggestion ?? ""} className={`${selectCls} ml-1`}>
              <option value="">— none —</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-muted">
            <input type="checkbox" name="noPromo" defaultChecked={r.noPromo} className="mr-1" />
            No promo
          </label>
          <label className="text-sm text-muted">
            <input type="checkbox" name="missionTrip" defaultChecked={r.missionTrip} className="mr-1" />
            Mission trip
          </label>

          <label className="text-sm text-muted">
            Checklist
            <select
              name="suggestedTemplateId"
              defaultValue={r.suggestedTemplateId ?? ""}
              className={`${selectCls} ml-1`}
            >
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-2">
            <button className="rounded-full bg-ink text-white px-4 py-1 text-sm font-semibold">
              Save
            </button>
            <TagRuleDeleteButton id={r.id} tag={r.tag} />
          </div>
        </form>
      ))}

      {/* ---- Add a new rule ----------------------------------------------- */}
      <details className="card-float p-4 mt-6">
        <summary className="cursor-pointer font-semibold text-ink select-none">
          ＋ Add tag rule
        </summary>
        <form action={createTagRule} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold">
            Tag
            <input
              name="tag"
              required
              placeholder="e.g. Whole-Church"
              className={`${inputCls} ml-2 block mt-1 font-normal`}
            />
          </label>
          <label className="text-sm text-muted">
            Ministry
            <select name="ministryId" defaultValue="" className={`${selectCls} ml-1`}>
              <option value="">— none —</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            Tier
            <select name="tier" defaultValue="" className={`${selectCls} ml-1`}>
              <option value="">— none —</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            <input type="checkbox" name="noPromo" className="mr-1" />
            No promo
          </label>
          <label className="text-sm text-muted">
            <input type="checkbox" name="missionTrip" className="mr-1" />
            Mission trip
          </label>
          <label className="text-sm text-muted">
            Checklist
            <select name="suggestedTemplateId" defaultValue="" className={`${selectCls} ml-1`}>
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-full bg-ink text-white px-5 py-1.5 text-sm font-semibold">
            Add rule
          </button>
        </form>
      </details>
    </div>
  );
}
