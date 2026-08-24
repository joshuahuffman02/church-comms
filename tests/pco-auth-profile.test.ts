import { describe, expect, it } from "vitest";
import {
  belongsToOrganization,
  normalizeEmail,
  parsePlanningCenterIdentity,
} from "@/lib/pco-auth-profile";

describe("Planning Center OIDC identity", () => {
  it("accepts the verified fields needed for a local requester profile", () => {
    expect(
      parsePlanningCenterIdentity({
        sub: "10471404",
        name: "Josh Huffman",
        email: " Josh@PVWinona.com ",
        organization_id: 123456,
        organization_name: "Pleasant Valley Church",
      }),
    ).toEqual({
      userId: "10471404",
      name: "Josh Huffman",
      email: "josh@pvwinona.com",
      organizationId: "123456",
      organizationName: "Pleasant Valley Church",
    });
  });

  it("fails closed when an identity or organization claim is missing", () => {
    expect(
      parsePlanningCenterIdentity({
        sub: "1",
        name: "Staff Member",
        email: "staff@example.com",
      }),
    ).toBeNull();
    expect(
      parsePlanningCenterIdentity({
        organization_id: "123",
        name: "Staff Member",
        email: "staff@example.com",
      }),
    ).toBeNull();
  });

  it("only admits the configured church organization", () => {
    const identity = parsePlanningCenterIdentity({
      sub: "1",
      name: "Staff Member",
      email: "staff@example.com",
      organization_id: "church-a",
    });
    expect(identity).not.toBeNull();
    expect(belongsToOrganization(identity!, "church-a")).toBe(true);
    expect(belongsToOrganization(identity!, "church-b")).toBe(false);
  });

  it("normalizes email for safe ownership matching", () => {
    expect(normalizeEmail(" Staff@Example.COM ")).toBe("staff@example.com");
  });
});
