import {
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  projectPrayerRequestActivity,
  projectVisitActivity,
} from "../../src/features/admin/hub-service";

function routeFiles(root: string): string[] {
  const results: string[] = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) {
      results.push(...routeFiles(path));
    } else if (name === "route.ts") {
      results.push(path);
    }
  }
  return results;
}

describe("3D community hub access boundaries", () => {
  it("requires admin authorization in every admin API route", () => {
    const routes = routeFiles("app/api/admin");
    expect(routes.length).toBeGreaterThan(0);

    for (const path of routes) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("requireAdmin");
    }
  });

  it("scopes member prayer request history to the session owner", () => {
    const source = readFileSync("app/api/prayer-requests/route.ts", "utf8");
    expect(source).toContain("export async function POST");
    expect(source).toContain("listOwnPrayerRequests(actor.id");
  });

  it("returns only the created visit id from member booking service", () => {
    const source = readFileSync("src/features/visits/service.ts", "utf8");
    expect(source).toContain("Promise<{ id: string }>");
    expect(source).toContain("return { id: pending.id }");
  });

  it("does not project prayer-request content into dashboard activity", () => {
    const activity = projectPrayerRequestActivity({
      id: "p1",
      requesterName: "홍길동",
      content: "민감한 기도 내용",
      status: "received",
      createdAt: new Date("2026-09-26T00:00:00Z"),
    });

    expect(activity).not.toHaveProperty("content");
    expect(JSON.stringify(activity)).not.toContain("민감한 기도 내용");
  });

  it("does not project visit reason into dashboard activity", () => {
    const activity = projectVisitActivity({
      id: "v1",
      requesterName: "홍길동",
      visitDate: "2026-09-30",
      reason: "민감한 심방 사유",
      status: "requested",
      createdAt: new Date("2026-09-26T00:00:00Z"),
    });

    expect(activity).not.toHaveProperty("reason");
    expect(JSON.stringify(activity)).not.toContain("민감한 심방 사유");
  });
});
