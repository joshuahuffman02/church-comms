import { describe, expect, it } from "vitest";
import {
  describeRequestProvenance,
  requestAttentionLabel,
  requestSource,
} from "../src/lib/provenance";

describe("request provenance", () => {
  it("keeps Planning Center ownership separate from requester identity", () => {
    const provenance = describeRequestProvenance({
      pcoEventId: "pco-123",
      requesterName: null,
      requesterEmail: null,
      owner: null,
    });
    expect(provenance).toEqual({
      source: "pco",
      sourceLabel: "Planning Center",
      requesterLabel: "Imported — no requester",
      ownerLabel: "Unassigned",
    });
  });

  it("recognizes a genuine request-form submission", () => {
    expect(requestSource({
      requesterName: "Jane Doe",
      requesterEmail: "jane@example.com",
    })).toBe("request");
    expect(describeRequestProvenance({
      requesterName: "Jane Doe",
      requesterEmail: "jane@example.com",
      owner: { name: "Alex" },
    }).requesterLabel).toBe("Jane Doe");
  });

  it("labels calendar imports without inventing a requester", () => {
    const provenance = describeRequestProvenance({
      externalCalendarKey: "calendar-1",
    });
    expect(provenance.sourceLabel).toBe("Calendar import");
    expect(provenance.requesterLabel).toBe("Imported — no requester");
  });

  it("uses plain-language attention reasons", () => {
    expect(requestAttentionLabel("submitted")).toBe("Needs triage");
    expect(requestAttentionLabel("needs_info")).toBe("Missing details");
    expect(requestAttentionLabel("triaged")).toBe("Plan decision");
  });
});
