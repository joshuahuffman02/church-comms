import { describe, expect, it } from "vitest";
import {
  REQUESTER_EDIT_BLOCKED_STATUSES,
  requesterDeliverableStatus,
  requesterStatus,
} from "@/lib/requester-portal";

describe("requester portal language", () => {
  it("hides internal workflow jargon", () => {
    expect(requesterStatus("triaged").label).toBe("Being reviewed");
    expect(requesterStatus("in_production").label).toBe("In preparation");
    expect(requesterDeliverableStatus("to_design").label).toBe("Planned");
    expect(requesterDeliverableStatus("proof").label).toBe("Final check");
  });

  it("keeps closed requests read-only", () => {
    expect(REQUESTER_EDIT_BLOCKED_STATUSES.has("archived")).toBe(true);
    expect(REQUESTER_EDIT_BLOCKED_STATUSES.has("cancelled")).toBe(true);
    expect(REQUESTER_EDIT_BLOCKED_STATUSES.has("declined")).toBe(true);
    expect(REQUESTER_EDIT_BLOCKED_STATUSES.has("scheduled")).toBe(false);
  });
});
