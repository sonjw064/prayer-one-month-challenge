import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("sign-up contracts", () => {
  it("admin routes authorize before validating or touching data", () => {
    for (const path of [
      "app/api/admin/signup-requests/route.ts",
      "app/api/admin/signup-requests/count/route.ts",
      "app/api/admin/signup-requests/[id]/route.ts",
    ]) {
      const source = read(path);
      const auth = source.indexOf("requireAdmin(");
      expect(auth, path).toBeGreaterThan(-1);
      for (const later of ["assertSameOrigin(", "assertRequestId(", "parseSignupDecision(", "approveSignupRequest(", "listSignupRequestsForAdmin(", "countPendingSignupRequests("]) {
        const index = source.indexOf(later, source.indexOf("export async function"));
        if (index >= 0) expect(auth, `${path} ${later}`).toBeLessThan(index);
      }
    }
  });

  it("the public route is rate limited, same-origin only and never reveals duplicates", () => {
    const source = read("app/api/signup/route.ts");
    expect(source).toContain("assertSameOrigin");
    expect(source).toContain("isLoginBlocked");
    expect(source).toContain("recordLoginFailure");
    expect(source).toContain("input.honeypot");
    expect(source).not.toMatch(/ROSTER_DUPLICATE|alreadyInRoster/);
    expect(source).not.toMatch(/export async function (GET|PUT|PATCH|DELETE)/);
  });

  it("approval claims the request before creating a regular (non-admin) roster entry", () => {
    const source = read("src/features/signup/service.ts");
    const claim = source.indexOf('status: "approved"');
    const create = source.indexOf("createRosterMember(");
    expect(claim).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(claim);
    expect(source).toContain("isAdmin: false");
    expect(source).toContain("phoneCiphertext: null");
  });

  it("migration limits pending duplicates and locks the table down", () => {
    const sql = read("drizzle/20261104000000_signup_requests.sql");
    expect(sql).toContain("signup_requests_pending_uq");
    expect(sql).toContain("where status = 'pending'");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on prayer_app.signup_requests");
  });

  it("is reachable from login, listed in privacy policy and shown to admins", () => {
    expect(read("app/login/page.tsx")).toContain('href="/signup"');
    expect(read("app/(public)/privacy/page.tsx")).toContain("가입 신청");
    expect(read("app/admin/users/page.tsx")).toContain("AdminSignupRequests");
    expect(read("components/admin/AdminSidebar.tsx")).toContain("/api/admin/signup-requests/count");
  });
});
