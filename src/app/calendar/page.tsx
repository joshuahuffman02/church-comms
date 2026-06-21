import { db } from "@/lib/db";
import { monthGrid } from "@/lib/calendar";
import { MonthCalendar } from "@/components/month-calendar";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";

export default async function Calendar() {
  const now = new Date();
  const grid = monthGrid(now.getFullYear(), now.getMonth());
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
  return <MonthCalendar grid={grid} items={items} month={now.getMonth()} />;
}
