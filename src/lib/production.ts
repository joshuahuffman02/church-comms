import { addDays, atMidnight } from "./engine/dates";
import { weekRange } from "./week";

export type ProductionFocusItem = {
  status: string;
  productionDueAtMs: number | null;
  ownerId: string | null;
};

export type ProductionWorkKind = "writing" | "graphics" | "video" | "publishing";

export type ProductionWorkBrief = {
  kind: ProductionWorkKind;
  label: string;
  nextAction: string;
};

const WORK_KIND_LABEL: Record<ProductionWorkKind, string> = {
  writing: "Writing",
  graphics: "Graphics",
  video: "Video",
  publishing: "Scheduling / publishing",
};

/**
 * Turn a channel into the kind of work a teammate is actually doing. The
 * status can temporarily change that kind: once creative is approved, the
 * active job is scheduling/publishing regardless of how the piece was made.
 */
export function productionWorkBrief(
  channelKey: string,
  channelName: string,
  status: string,
): ProductionWorkBrief {
  const normalized = `${channelKey} ${channelName}`.toLowerCase();
  let kind: ProductionWorkKind;

  if (status === "ready" || status === "scheduled") kind = "publishing";
  else if (normalized.includes("video")) kind = "video";
  else if (
    /loop|graphic|slide|sign|banner|bulletin|insert|display|opportunit|print/.test(normalized)
  ) kind = "graphics";
  else kind = "writing";

  const startAction: Record<ProductionWorkKind, string> = {
    writing: "Write the channel-ready copy",
    graphics: "Design the visual and prepare the final file",
    video: "Write, record, and finish the video segment",
    publishing: "Schedule or publish it in the channel",
  };

  const nextAction = (() => {
    if (status === "proof") return "Review the piece and approve it or send it back";
    if (status === "ready") return "Schedule or publish it in the channel";
    if (status === "scheduled") return "Confirm the placement goes live as planned";
    if (status === "published") return "Finished and live";
    if (status === "skipped") return "Not needed for this event";
    if (status === "in_progress") return `Finish it: ${startAction[kind].toLowerCase()}`;
    return startAction[kind];
  })();

  return { kind, label: WORK_KIND_LABEL[kind], nextAction };
}

export type ProductionFocus<T extends ProductionFocusItem> = {
  proof: T[];
  ready: T[];
  inProgress: T[];
  recentOverdue: T[];
  oldBacklog: T[];
  thisWeek: T[];
  nearTerm: T[];
  later: T[];
  scheduled: T[];
  actionTotal: number;
  unassignedActionTotal: number;
};

/**
 * Split current production into one mutually-exclusive home per piece. Status
 * work wins over dates; untouched work is then organized around the make-by
 * date so the default team view stays focused without losing the full board.
 */
export function focusProductionItems<T extends ProductionFocusItem>(
  items: T[],
  today: Date,
  recentDays = 14,
  upcomingDays = 30,
): ProductionFocus<T> {
  const day = atMidnight(today);
  const recentCutoff = addDays(day, -recentDays);
  const upcomingCutoff = addDays(day, upcomingDays);
  const { end: weekEnd } = weekRange(day);
  const focus: ProductionFocus<T> = {
    proof: [],
    ready: [],
    inProgress: [],
    recentOverdue: [],
    oldBacklog: [],
    thisWeek: [],
    nearTerm: [],
    later: [],
    scheduled: [],
    actionTotal: 0,
    unassignedActionTotal: 0,
  };

  for (const item of items) {
    let bucket: keyof Pick<
      ProductionFocus<T>,
      "proof" | "ready" | "inProgress" | "recentOverdue" | "oldBacklog" | "thisWeek" | "nearTerm" | "later" | "scheduled"
    >;

    if (item.status === "proof") bucket = "proof";
    else if (item.status === "ready") bucket = "ready";
    else if (item.status === "in_progress") bucket = "inProgress";
    else if (item.status === "scheduled") bucket = "scheduled";
    else if (item.productionDueAtMs == null) bucket = "later";
    else {
      const due = atMidnight(new Date(item.productionDueAtMs));
      if (due < recentCutoff) bucket = "oldBacklog";
      else if (due < day) bucket = "recentOverdue";
      else if (due <= weekEnd) bucket = "thisWeek";
      else if (due <= upcomingCutoff) bucket = "nearTerm";
      else bucket = "later";
    }

    focus[bucket].push(item);
  }

  const actionItems = [
    ...focus.proof,
    ...focus.ready,
    ...focus.inProgress,
    ...focus.recentOverdue,
    ...focus.thisWeek,
  ];
  focus.actionTotal = actionItems.length;
  focus.unassignedActionTotal = actionItems.filter((item) => item.ownerId == null).length;
  return focus;
}
