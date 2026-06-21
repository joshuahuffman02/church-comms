import { buildVideoRunOfShow, loadVideoThisWeek, ymd } from "@/lib/exports";

// Reads live DB data per request — never statically cached.
export const dynamic = "force-dynamic";

export async function GET() {
  const { sunday, items } = await loadVideoThisWeek(new Date());
  const text = buildVideoRunOfShow(items, sunday);
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="announcement-video-run-of-show-${ymd(sunday)}.txt"`,
    },
  });
}
