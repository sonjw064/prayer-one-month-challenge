import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/lib/http";
import {
  assertActorNotSelectedForDeletion,
  assertAdminRemains,
  assertNoAdminSelectedForDeletion,
  passwordModeFromHash,
  uniqueRosterIds,
} from "../../src/features/admin/roster-service";

describe("admin roster management helpers", () => {
  it("shows whether a member still uses the initial phone password", () => {
    expect(passwordModeFromHash(null)).toBe("initial");
    expect(passwordModeFromHash("argon-hash")).toBe("custom");
  });

  it("deduplicates selected roster ids before bulk deletion", () => {
    expect(uniqueRosterIds(["r1", "r1", "r2"])).toEqual(["r1", "r2"]);
  });

  it("prevents deleting the currently signed-in administrator", () => {
    expect(() =>
      assertActorNotSelectedForDeletion(
        [
          { id: "u1", rosterId: "r1" },
          { id: "u2", rosterId: "r2" },
        ],
        "u1",
      ),
    ).toThrowError(new DomainError("CANNOT_DELETE_SELF", 409));
  });

  it("blocks deleting rosters that still have administrator permission", () => {
    expect(() =>
      assertNoAdminSelectedForDeletion([
        { id: "r1", isAdmin: false },
        { id: "r2", isAdmin: true },
      ]),
    ).toThrowError(new DomainError("CANNOT_DELETE_ADMIN", 409));
  });

  it("allows deleting rosters once administrator permission was removed", () => {
    expect(() =>
      assertNoAdminSelectedForDeletion([
        { id: "r1", isAdmin: false },
        { id: "r2", isAdmin: false },
      ]),
    ).not.toThrow();
  });

  it("keeps at least one active administrator", () => {
    const base = { wasAdmin: true, willBeAdmin: false, willBeActive: true };
    expect(() => assertAdminRemains({ ...base, otherActiveAdmins: 0 })).toThrowError(
      new DomainError("ADMIN_REQUIRED", 409),
    );
    expect(() =>
      assertAdminRemains({ ...base, willBeAdmin: true, willBeActive: false, otherActiveAdmins: 0 }),
    ).toThrowError(new DomainError("ADMIN_REQUIRED", 409));
    expect(() => assertAdminRemains({ ...base, otherActiveAdmins: 1 })).not.toThrow();
    expect(() =>
      assertAdminRemains({ wasAdmin: false, willBeAdmin: false, willBeActive: true, otherActiveAdmins: 0 }),
    ).not.toThrow();
  });
});
