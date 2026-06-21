import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/authz";
import { isAdmin } from "@/lib/roles";
import { db } from "@/lib/db";
import {
  DEFAULT_VIDEO_SCRIPT_INTRO,
  DEFAULT_VIDEO_SCRIPT_OUTRO,
} from "@/lib/exports";
import { saveVideoScriptTemplates } from "@/actions/video-script";

export const dynamic = "force-dynamic";

export default async function VideoScriptSettingsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!isAdmin(me.roles)) {
    return (
      <div className="max-w-xl card-float p-6">
        <h1 className="text-xl font-extrabold mb-1">🔒 Admins only</h1>
        <p className="text-muted text-sm">Ask an admin to edit the video-script templates.</p>
      </div>
    );
  }

  const setting = await db.setting.findUnique({
    where: { id: 1 },
    select: { videoScriptIntro: true, videoScriptOutro: true },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold mb-1">Announcement Video Script 🎬</h1>
      <p className="text-muted mb-5">
        Your <b>intro</b> and <b>outro</b> wrap the week&apos;s auto-filled top-3 items. Leave a box
        blank to use the built-in default. Edit, then grab the finished script on the Exports page.
      </p>

      <form action={saveVideoScriptTemplates} className="card-float p-6 grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm font-semibold text-muted">Intro</span>
          <textarea
            name="intro"
            rows={3}
            defaultValue={setting?.videoScriptIntro ?? ""}
            placeholder={DEFAULT_VIDEO_SCRIPT_INTRO}
            className="rounded-2xl border px-4 py-2 text-sm"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm font-semibold text-muted">Outro</span>
          <textarea
            name="outro"
            rows={3}
            defaultValue={setting?.videoScriptOutro ?? ""}
            placeholder={DEFAULT_VIDEO_SCRIPT_OUTRO}
            className="rounded-2xl border px-4 py-2 text-sm"
          />
        </label>
        <button className="rounded-full bg-ink text-white py-2 font-semibold w-fit px-6">Save</button>
      </form>
    </div>
  );
}
