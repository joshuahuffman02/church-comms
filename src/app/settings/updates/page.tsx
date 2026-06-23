import { UpdateManager } from "@/components/update-manager";
import { SettingsNav } from "@/components/settings-nav";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { getUpdateStatus } from "@/lib/updater";

export const dynamic = "force-dynamic";

export default async function UpdatesSettingsPage() {
  const user = await getSessionUser();

  if (!user || !isAdmin(user.roles)) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h1 className="text-xl font-semibold">Admin access required</h1>
          <p className="mt-2 text-sm">
            Only admins can check and run app updates.
          </p>
        </div>
      </main>
    );
  }

  const status = await getUpdateStatus({ fetch: true });

  return (
    <div className="max-w-4xl space-y-6">
      <SettingsNav />
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Updates ⬆️</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Keep this local church install on the latest approved GitHub code while
          leaving private church data in the local database and env file.
        </p>
      </div>

      <UpdateManager initialStatus={status} />
    </div>
  );
}
