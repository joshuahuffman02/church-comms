import {
  buildChannelHandoff,
  exportSundayFromParam,
  loadActiveExportChannels,
  loadChannelHandoff,
  ymd,
} from "@/lib/exports";

// Reads live DB data per request — never statically cached.
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const channel = (await loadActiveExportChannels()).find((item) => item.key === key);
  if (!channel) return new Response("Active channel not found.", { status: 404 });

  const anchor = exportSundayFromParam(
    new URL(request.url).searchParams.get("sunday"),
    new Date(),
  );
  const { sunday, items } = await loadChannelHandoff(channel, anchor);
  const text = buildChannelHandoff(channel.name, items, sunday);

  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${channel.key}-${ymd(sunday)}.txt"`,
    },
  });
}
