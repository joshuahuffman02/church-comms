import { describe, expect, it } from "vitest";
import {
  LOCAL_DRAFT_TTL_MS,
  parseLocalDraft,
  serializeLocalDraft,
} from "../src/lib/local-draft";

describe("expiring local drafts", () => {
  const now = Date.UTC(2026, 6, 27, 12);

  it("round-trips a current draft", () => {
    const raw = serializeLocalDraft({ title: "VBS" }, now);
    expect(parseLocalDraft<{ title: string }>(raw, now + 1_000)).toEqual({
      status: "ready",
      data: { title: "VBS" },
    });
  });

  it("expires drafts after seven days", () => {
    const raw = serializeLocalDraft({ title: "Old event" }, now);
    expect(parseLocalDraft(raw, now + LOCAL_DRAFT_TTL_MS + 1)).toEqual({
      status: "expired",
    });
  });

  it("accepts one legacy v1 draft for migration", () => {
    expect(parseLocalDraft<{ title: string }>(
      JSON.stringify({ title: "Legacy event" }),
      now,
    )).toEqual({
      status: "ready",
      data: { title: "Legacy event" },
    });
  });

  it("rejects malformed storage", () => {
    expect(parseLocalDraft("{bad json", now)).toEqual({ status: "invalid" });
  });
});
