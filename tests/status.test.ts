import { describe, it, expect } from "vitest";
import {
  DELIVERABLE_STATUS_META,
  nextRequestStatus,
  prevRequestStatus,
  nextDeliverableStatus,
} from "../src/lib/status";
describe("status", () => {
  it("advances request statuses and stops at the end", () => {
    expect(nextRequestStatus("submitted")).toBe("triaged");
    expect(nextRequestStatus("published")).toBe("archived");
    expect(nextRequestStatus("archived")).toBe(null);
    expect(prevRequestStatus("submitted")).toBe(null);
  });
  it("advances deliverable flow and stops at published", () => {
    expect(nextDeliverableStatus("to_design")).toBe("in_progress");
    expect(nextDeliverableStatus("ready")).toBe("published");
    expect(nextDeliverableStatus("published")).toBe(null);
  });
  it("uses channel-neutral language for production work", () => {
    expect(DELIVERABLE_STATUS_META.to_design.label).toBe("Not started");
    expect(DELIVERABLE_STATUS_META.proof.label).toBe("Needs review");
    expect(DELIVERABLE_STATUS_META.published.label).toBe("Complete");
  });
});
