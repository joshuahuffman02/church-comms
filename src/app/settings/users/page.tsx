import Link from "next/link";
import { SettingsNav } from "@/components/settings-nav";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";
import { parseRoles, isAdmin } from "@/lib/roles";
import {
  createUser,
  setUserRoles,
  deactivateUser,
  reactivateUser,
  setUserPassword,
} from "@/actions/users";

// The roles an admin can assign from the UI. Legacy strings
// (triager/designer/publisher/approver) are still honored if already on a
// user, but we don't surface them as new assignable options.
const ASSIGNABLE_ROLES: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full access: users, settings, deletes" },
  { value: "editor", label: "Editor", hint: "Everyday comms work" },
  { value: "viewer", label: "Viewer", hint: "Read-only" },
];

const ROLE_CHIP: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700",
  editor: "bg-sky-100 text-sky-700",
  viewer: "bg-slate-100 text-slate-600",
};

function RoleChip({ role }: { role: string }) {
  const cls = ROLE_CHIP[role] ?? "bg-amber-100 text-amber-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{role}</span>
  );
}

export default async function Users() {
  const me = await getSessionUser();

  // Friendly gate — non-admins see a message instead of a 500/redirect loop.
  if (!me || !isAdmin(me.roles)) {
    return (
      <div className="max-w-lg">
        <div className="card-float p-8 text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-xl font-extrabold mb-1">Admins only</h1>
          <p className="text-muted">
            You need an admin role to manage users. Ask an administrator if you
            think this is a mistake.
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

  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <h1 className="text-2xl font-extrabold mb-1">Team &amp; access 👥</h1>
      <p className="text-muted mb-5 leading-relaxed">
        Add staff, set what they can do, and turn access off when someone leaves
        — no server access required. A user with no password set can&apos;t log
        in until you give them one.
      </p>

      {/* ---- Existing users -------------------------------------------------- */}
      <div className="grid gap-3 mb-6">
        {users.map((u) => {
          const roles = parseRoles(u.roles);
          const deactivate = deactivateUser.bind(null, u.id);
          const reactivate = reactivateUser.bind(null, u.id);
          const noPassword = !u.password;
          return (
            <div key={u.id} className="card-float p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-ink flex items-center gap-2">
                    {u.name}
                    {!u.active && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-600">
                        deactivated
                      </span>
                    )}
                    {u.active && noPassword && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        no password
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted truncate">{u.email}</div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                  {roles.length ? (
                    roles.map((r) => <RoleChip key={r} role={r} />)
                  ) : (
                    <span className="text-xs text-muted">no roles</span>
                  )}
                </div>
                <form action={u.active ? deactivate : reactivate}>
                  <button
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      u.active
                        ? "text-rose-600 border-rose-200 hover:bg-rose-50"
                        : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    }`}
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>

              {/* Per-row role editor */}
              <form action={setUserRoles.bind(null, u.id)} className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                <span className="text-xs font-bold uppercase text-muted">Roles</span>
                {ASSIGNABLE_ROLES.map((r) => (
                  <label key={r.value} className="text-sm text-ink/90 flex items-center gap-1" title={r.hint}>
                    <input type="checkbox" name="roles" value={r.value} defaultChecked={roles.includes(r.value)} />
                    {r.label}
                  </label>
                ))}
                <button className="rounded-full bg-ink text-white px-4 py-1 text-xs font-semibold">
                  Save roles
                </button>
              </form>

              {/* Reset password */}
              <form action={setUserPassword.bind(null, u.id)} className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase text-muted">Password</span>
                <input
                  name="password"
                  type="password"
                  required
                  placeholder={noPassword ? "Set initial password" : "New password"}
                  className="rounded-full border px-3 py-1 text-sm w-56"
                />
                <button className="rounded-full border px-4 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition">
                  {noPassword ? "Set password" : "Reset password"}
                </button>
              </form>
            </div>
          );
        })}
      </div>

      {/* ---- Add a user ------------------------------------------------------ */}
      <details className="card-float p-4">
        <summary className="cursor-pointer font-semibold text-ink select-none">
          ＋ Add a team member
        </summary>
        <form action={createUser} className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold">
              Name
              <input
                name="name"
                required
                placeholder="e.g. Jordan Lee"
                className="ml-2 rounded-full border px-3 py-1 text-sm font-normal"
              />
            </label>
            <label className="text-sm font-semibold">
              Email
              <input
                name="email"
                type="email"
                required
                placeholder="name@church.org"
                className="ml-2 rounded-full border px-3 py-1 text-sm font-normal w-64"
              />
            </label>
          </div>

          <fieldset className="text-sm">
            <legend className="font-semibold mb-1">Roles</legend>
            <div className="flex flex-wrap gap-4 text-ink/90">
              {ASSIGNABLE_ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-1" title={r.hint}>
                  <input
                    type="checkbox"
                    name="roles"
                    value={r.value}
                    defaultChecked={r.value === "editor"}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="text-sm font-semibold">
            Initial password (optional)
            <input
              name="password"
              type="password"
              placeholder="Leave blank to set later"
              className="ml-2 rounded-full border px-3 py-1 text-sm font-normal w-64"
            />
          </label>

          <div>
            <button className="rounded-full bg-ink text-white px-5 py-1.5 text-sm font-semibold">
              Add member
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
