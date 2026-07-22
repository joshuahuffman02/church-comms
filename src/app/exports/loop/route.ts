import { buildLoopList, exportSundayFromParam, loadLoopForComingSunday, ymd } from "@/lib/exports";

// Reads live DB data per request — never statically cached.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const anchor = exportSundayFromParam(new URL(request.url).searchParams.get("sunday"), new Date());
  const { sunday, items } = await loadLoopForComingSunday(anchor);
  const text = buildLoopList(items, sunday);
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="pre-service-loop-${ymd(sunday)}.txt"`,
    },
  });
}
