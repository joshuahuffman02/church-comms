import { describe, expect, it } from "vitest";

import { deriveUpdateState, shortSha } from "@/lib/update-status";

describe("deriveUpdateState", () => {
  it("detects an up-to-date checkout", () => {
    expect(
      deriveUpdateState({
        currentSha: "abc123",
        mergeBaseSha: "abc123",
        upstreamSha: "abc123",
      }),
    ).toBe("up_to_date");
  });

  it("detects an available fast-forward update", () => {
    expect(
      deriveUpdateState({
        currentSha: "abc123",
        mergeBaseSha: "abc123",
        upstreamSha: "def456",
      }),
    ).toBe("update_available");
  });

  it("detects local commits ahead of the tracked branch", () => {
    expect(
      deriveUpdateState({
        currentSha: "def456",
        mergeBaseSha: "abc123",
        upstreamSha: "abc123",
      }),
    ).toBe("local_ahead");
  });

  it("detects diverged history", () => {
    expect(
      deriveUpdateState({
        currentSha: "def456",
        mergeBaseSha: "abc123",
        upstreamSha: "ghi789",
      }),
    ).toBe("diverged");
  });

  it("reports missing git data as not configured", () => {
    expect(
      deriveUpdateState({
        currentSha: null,
        mergeBaseSha: null,
        upstreamSha: null,
      }),
    ).toBe("not_configured");
  });
});

describe("shortSha", () => {
  it("returns seven-character git shas", () => {
    expect(shortSha("1234567890abcdef")).toBe("1234567");
  });

  it("returns null for empty values", () => {
    expect(shortSha(null)).toBeNull();
  });
});
