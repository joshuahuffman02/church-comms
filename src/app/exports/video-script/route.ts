import { buildVideoScript, exportSundayFromParam, loadVideoScriptThisWeek, ymd } from "@/lib/exports";

// Reads live DB data (and the editable templates) per request — never cached.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const anchor = exportSundayFromParam(new URL(request.url).searchParams.get("sunday"), new Date());
  const { sunday, items, intro, outro } = await loadVideoScriptThisWeek(anchor);
  const text = buildVideoScript(items, sunday, intro, outro);
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="announcement-script-${ymd(sunday)}.txt"`,
    },
  });
}
