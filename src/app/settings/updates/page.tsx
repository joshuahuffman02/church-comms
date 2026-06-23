import Link from "next/link";

import { UpdateManager } from "@/components/update-manager";
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
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Settings</p>
          <h1 className="text-3xl font-bold text-slate-950">Updates</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Keep this local church install on the latest approved GitHub code
            while leaving private church data in the local database and env file.
          </p>
        </div>
        <Link
          className="text-sm font-medium text-slate-600 hover:text-slate-950"
          href="/settings/channels"
        >
          Back to settings
        </Link>
      </div>

      <UpdateManager initialStatus={status} />
    </main>
  );
}
