import { describe, expect, it } from "vitest";
import { parseQuickItemForm, quickItemProductionDueAt } from "../src/lib/quick-items";

function validForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    title: "Update the Easter service times",
    channelId: "website",
    date: "2026-08-02",
    ownerId: "user-1",
    assetLink: "https://example.com/art",
    note: "Use the approved times.",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe("quick item form", () => {
  it("returns field-level errors instead of silently accepting missing values", () => {
    const result = parseQuickItemForm(
      validForm({ title: "", channelId: "", date: "" }),
      new Date(2026, 6, 22),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state.fieldErrors).toMatchObject({
        title: expect.any(String),
        channelId: expect.any(String),
        date: expect.any(String),
      });
    }
  });

  it("rejects past placements and incomplete asset links", () => {
    const result = parseQuickItemForm(
      validForm({ date: "2026-07-21", assetLink: "drive-file" }),
      new Date(2026, 6, 22),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state.fieldErrors.date).toContain("past");
      expect(result.state.fieldErrors.assetLink).toContain("http");
    }
  });

  it("trims valid input and keeps optional ownership explicit", () => {
    const result = parseQuickItemForm(
      validForm({ title: "  Update homepage  ", ownerId: "", note: "" }),
      new Date(2026, 6, 22),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { title: "Update homepage", ownerId: null, note: null },
    });
  });

  it("never creates a deadline before the task itself exists", () => {
    const createdAt = new Date(2026, 6, 22, 15, 30);
    const urgent = quickItemProductionDueAt(new Date(2026, 6, 24), 7, createdAt);
    const planned = quickItemProductionDueAt(new Date(2026, 7, 20), 7, createdAt);

    expect(urgent).toEqual(new Date(2026, 6, 22));
    expect(planned).toEqual(new Date(2026, 7, 13));
  });
});
