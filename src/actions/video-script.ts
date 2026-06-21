"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { revalidatePath } from "next/cache";

/** Save the announcement-video script intro/outro templates (the auto-filled
 *  top-3 items are sandwiched between them). Blank clears back to the default. */
export async function saveVideoScriptTemplates(fd: FormData) {
  await requireAdmin();
  const intro = String(fd.get("intro") ?? "").trim().slice(0, 2000) || null;
  const outro = String(fd.get("outro") ?? "").trim().slice(0, 2000) || null;
  await db.setting.update({
    where: { id: 1 },
    data: { videoScriptIntro: intro, videoScriptOutro: outro },
  });
  revalidatePath("/settings/video-script");
  revalidatePath("/exports");
}
