import { buildVideoScript, loadVideoScriptThisWeek, ymd } from "@/lib/exports";

// Reads live DB data (and the editable templates) per request — never cached.
export const dynamic = "force-dynamic";

export async function GET() {
  const { sunday, items, intro, outro } = await loadVideoScriptThisWeek(new Date());
  const text = buildVideoScript(items, sunday, intro, outro);
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="announcement-script-${ymd(sunday)}.txt"`,
    },
  });
}
