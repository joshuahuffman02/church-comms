import { describe, expect, it } from "vitest";
import { buildImportPatterns, describePcoChanges, normalizeImportPatternTitle } from "@/lib/import-review";

describe("import review helpers", () => {
  it("groups repeated calendar titles without acting on one-off items", () => {
    const patterns = buildImportPatterns([
      { key: "a", title: "Young Adults", recommendation: "review" },
      { key: "b", title: "Young Adults!", recommendation: "review" },
      { key: "c", title: "Family Movie Night", recommendation: "accept" },
    ]);
    expect(normalizeImportPatternTitle(" Young—Adults! ")).toBe("young adults");
    expect(patterns).toEqual([
      {
        id: "young adults",
        title: "Young Adults",
        count: 2,
        keys: ["a", "b"],
        recommendation: "review",
      },
    ]);
  });

  it("reports only Planning Center-owned fields that changed", () => {
    expect(
      describePcoChanges(
        {
          name: "Family Night",
          startsAt: new Date(2026, 7, 9, 18),
          endsAt: null,
          location: "Cafe",
          registrationUrl: "https://example.com/register",
          approvalStatus: "A",
        },
        {
          title: "Family Night",
          eventStart: new Date(2026, 7, 9),
          eventEnd: null,
          location: "Gym",
          registrationUrl: null,
          pcoApprovalStatus: "A",
        },
      ),
    ).toEqual(["room or location", "registration link"]);
  });
});
