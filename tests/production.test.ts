import { describe, expect, it } from "vitest";
import {
  focusProductionItems,
  productionWorkBrief,
  type ProductionFocusItem,
} from "../src/lib/production";
import { addDays, atMidnight } from "../src/lib/engine/dates";

describe("focusProductionItems", () => {
  const today = atMidnight(new Date("2026-07-21T12:00:00"));
  let id = 0;
  const item = (
    status: string,
    due: Date | null,
    ownerId: string | null = "user-1",
  ): ProductionFocusItem & { id: number } => ({
    id: id++,
    status,
    productionDueAtMs: due?.getTime() ?? null,
    ownerId,
  });

  it("prioritizes workflow states before deadline buckets", () => {
    const result = focusProductionItems([
      item("proof", addDays(today, -40)),
      item("ready", addDays(today, 40)),
      item("in_progress", addDays(today, -20)),
      item("scheduled", addDays(today, 2)),
    ], today);

    expect(result.proof).toHaveLength(1);
    expect(result.ready).toHaveLength(1);
    expect(result.inProgress).toHaveLength(1);
    expect(result.scheduled).toHaveLength(1);
    expect(result.actionTotal).toBe(3);
  });

  it("separates recent work, older backlog, and the 30-day horizon", () => {
    const result = focusProductionItems([
      item("to_design", addDays(today, -15)),
      item("to_design", addDays(today, -14)),
      item("to_design", addDays(today, -1)),
      item("to_design", today),
      item("to_design", addDays(today, 6)),
      item("to_design", addDays(today, 30)),
      item("to_design", addDays(today, 31)),
      item("to_design", null),
    ], today);

    expect(result.oldBacklog).toHaveLength(1);
    expect(result.recentOverdue).toHaveLength(2);
    expect(result.thisWeek).toHaveLength(1);
    expect(result.nearTerm).toHaveLength(2);
    expect(result.later).toHaveLength(2);
  });

  it("counts unassigned pieces only inside the attention total", () => {
    const result = focusProductionItems([
      item("proof", today, null),
      item("to_design", today, null),
      item("to_design", addDays(today, 40), null),
      item("ready", today, "user-2"),
    ], today);

    expect(result.actionTotal).toBe(3);
    expect(result.unassignedActionTotal).toBe(2);
  });
});

describe("productionWorkBrief", () => {
  it("distinguishes writing, graphics, and video work", () => {
    expect(productionWorkBrief("facebook", "Facebook", "to_design").kind).toBe("writing");
    expect(productionWorkBrief("loop", "Sunday Loop", "to_design").kind).toBe("graphics");
    expect(productionWorkBrief("announcement_video", "Announcement Video", "to_design").kind).toBe("video");
  });

  it("turns approved creative into scheduling and publishing work", () => {
    const brief = productionWorkBrief("loop", "Sunday Loop", "ready");
    expect(brief.kind).toBe("publishing");
    expect(brief.nextAction).toContain("Schedule or publish");
  });

  it("explains proof review without losing the underlying work type", () => {
    const brief = productionWorkBrief("announcement_video", "Announcement Video", "proof");
    expect(brief.kind).toBe("video");
    expect(brief.nextAction).toContain("Review");
  });
});
