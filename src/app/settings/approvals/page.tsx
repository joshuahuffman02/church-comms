import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import {
  createApprovalRule,
  toggleApprovalRule,
  deleteApprovalRule,
} from "@/actions/approval-rules";
import { APPROVAL_CONDITION_TYPES } from "@/lib/approval-conditions";
import { AdminOnlyCard } from "@/components/admin-only-card";
import { SettingsNav } from "@/components/settings-nav";

const CONDITION_LABEL: Record<string, string> = {
  tier1: "It's for the whole church",
  channel: "It's on a specific channel",
  stage: "It has a stage announcement",
  all_church_email: "It's an all-church email",
  sensitive: "It's flagged sensitive",
};

export default async function ApprovalsSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const me = await getSessionUser();
  if (!me || !isAdmin(me.roles)) {
    return <AdminOnlyCard area="approval routing" />;
  }

  const [rules, users, channels] = await Promise.all([
    db.approvalRule.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.channel.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const userName = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <h1 className="text-2xl font-extrabold mb-1">Approvals ✅</h1>
      <p className="text-muted mb-5">
        Require a sign-off before certain events are approved. Rules ship{" "}
        <b>off</b> by default — with none active, nothing changes.
      </p>

      {/* Add a rule */}
      <div className="card-float p-5 mb-5">
        <h2 className="font-bold mb-3">Add a rule</h2>
        {error && (
          <div className="mb-3 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-2 text-sm text-rose-700">
            Please give the rule a name, pick when it applies, and (for the
            specific-channel rule) a channel.
          </div>
        )}
        <form action={createApprovalRule} className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-muted grid gap-1">
              Name
              <input
                name="name"
                maxLength={120}
                required
                placeholder="e.g. Pastor signs off church-wide"
                className="rounded-2xl border px-3 py-2 text-sm text-ink w-64"
              />
            </label>
            <label className="text-sm text-muted grid gap-1">
              When
              <select
                name="conditionType"
                defaultValue="tier1"
                className="rounded-2xl border px-3 py-2 text-sm text-ink"
              >
                {APPROVAL_CONDITION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONDITION_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-muted grid gap-1">
              Channel (for the “specific channel” rule)
              <select
                name="conditionValue"
                defaultValue=""
                className="rounded-2xl border px-3 py-2 text-sm text-ink w-52"
              >
                <option value="">— pick a channel —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-muted grid gap-1">
              Approver
              <select
                name="approverId"
                defaultValue=""
                className="rounded-2xl border px-3 py-2 text-sm text-ink"
              >
                <option value="">— (no one / record only)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm flex items-center gap-2 pb-2">
              <input type="checkbox" name="active" />
              Active
            </label>
            <button className="rounded-full bg-ink text-white px-5 py-2 text-sm font-semibold ml-auto">
              Add rule
            </button>
          </div>
        </form>
      </div>

      {/* Existing rules */}
      <div className="card-float overflow-hidden">
        <div className="px-5 py-3 text-xs font-bold text-muted border-b border-slate-100">
          Rules
        </div>
        {rules.length === 0 && (
          <div className="px-5 py-6 text-muted text-sm">
            No approval rules yet — approval is dormant.
          </div>
        )}
        {rules.map((r) => {
          const toggle = toggleApprovalRule.bind(null, r.id);
          const remove = deleteApprovalRule.bind(null, r.id);
          return (
            <div
              key={r.id}
              className="flex items-center gap-3 px-5 py-3 border-t border-slate-100 text-sm first:border-t-0 flex-wrap"
            >
              <span className="font-semibold">{r.name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-muted">
                {CONDITION_LABEL[r.conditionType] ?? r.conditionType}
                {r.conditionValue ? ` · ${r.conditionValue}` : ""}
              </span>
              {r.approverId && (
                <span className="text-muted text-xs">
                  → {userName.get(r.approverId) ?? "approver"}
                </span>
              )}
              {r.active ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Active
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-muted">
                  Inactive
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <form action={toggle}>
                  <button className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition">
                    {r.active ? "Deactivate" : "Activate"}
                  </button>
                </form>
                <form action={remove}>
                  <button className="rounded-full border px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
