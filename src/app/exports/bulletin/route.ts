import { buildBulletinCopy, loadBulletinThisWeek, ymd } from "@/lib/exports";

// Reads live DB data per request — never statically cached.
export const dynamic = "force-dynamic";

export async function GET() {
  const { sunday, items } = await loadBulletinThisWeek(new Date());
  const text = buildBulletinCopy(items);
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="bulletin-copy-${ymd(sunday)}.txt"`,
    },
  });
}
