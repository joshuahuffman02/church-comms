import { db } from "@/lib/db";
import { monthGrid } from "@/lib/calendar";
import { MonthCalendar } from "@/components/month-calendar";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";

export default async function Calendar({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const m = monthParam ? /^(\d{4})-(\d{2})$/.exec(monthParam) : null;
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]) - 1;
  }
  const grid = monthGrid(year, month);
  const touches = await db.touch.findMany({
    where: {
      deliverable: {
        request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
      },
    },
    include: { channel: true, deliverable: { include: { request: true } } },
  });
  const items = touches.map(t => ({
    date: t.scheduledAt, color: t.channel.color, channel: t.channel.name,
    title: t.deliverable.request.title, requestId: t.deliverable.request.id,
  }));
  return <MonthCalendar grid={grid} items={items} year={year} month={month} />;
}
