import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public bulletin routes", () => {
  it("need no login and expose only published, unexpired bulletins", () => {
    for (const path of ["app/api/bulletins/route.ts", "app/api/bulletins/[id]/pages/[page]/route.ts", "app/bulletin/page.tsx", "app/bulletin/[id]/page.tsx"]) {
      const source = read(path);
      expect(source, path).not.toMatch(/requireAdmin|getCurrentSessionUser\(\)\s*;?\s*\n?\s*if \(!user\)/);
      expect(source, path).not.toMatch(/redirect\("\/login"\)/);
    }
    const service = read("src/features/bulletin/service.ts");
    const publicReads = service.slice(service.indexOf("export async function listPublicBulletins"), service.indexOf("/** Administrator preview"));
    expect(publicReads.match(/eq\(bulletins\.status, "published"\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(publicReads.match(/retentionCutoff\(today\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("only allow GET", () => {
    for (const path of ["app/api/bulletins/route.ts", "app/api/bulletins/[id]/pages/[page]/route.ts"]) {
      expect(read(path)).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    }
  });

  it("are cacheable but only for a short time, and images are versioned", () => {
    expect(read("app/api/bulletins/route.ts")).toContain("public, max-age=60");
    expect(read("app/api/bulletins/[id]/pages/[page]/route.ts")).toContain("public, max-age=3600");
    expect(read("src/features/bulletin/http.ts")).toContain("if-none-match");
  });

  it("the layout shows the member shell to signed-in people and the public frame to everyone else", () => {
    const layout = read("app/bulletin/layout.tsx");
    expect(layout).toContain("MemberShell");
    expect(layout).toContain("PublicLayout");
    expect(layout).not.toMatch(/redirect\(/);
    expect(layout).not.toContain('"/login"');
  });
});

describe("administrator bulletin routes", () => {
  const files = [
    "app/api/admin/bulletins/route.ts",
    "app/api/admin/bulletins/[id]/route.ts",
    "app/api/admin/bulletins/[id]/pages/[page]/route.ts",
    "app/api/admin/bulletins/[id]/publish/route.ts",
  ];

  it("authorize before doing anything else", () => {
    for (const path of files) {
      const source = read(path);
      const auth = source.indexOf("requireAdmin(");
      expect(auth, path).toBeGreaterThan(-1);
      for (const later of ["assertSameOrigin(", "assertBulletinId(", "parseDraftInput(", "purgeExpiredBulletins(", "listAdminBulletins(", "savePage(", "publishDraft(", "deleteBulletin("]) {
        const index = source.indexOf(later, source.indexOf("export async function"));
        if (index >= 0) expect(auth, `${path} ${later}`).toBeLessThan(index);
      }
    }
  });

  it("all writes check the origin and responses are never cached", () => {
    for (const path of files) {
      const source = read(path);
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const start = source.indexOf(`export async function ${method}`);
        if (start >= 0) expect(source.slice(start), `${path} ${method}`).toContain("assertSameOrigin(");
      }
      expect(source).toContain("no-store");
    }
  });

  it("page uploads are size-limited, type-checked and re-encoded before saving", () => {
    const source = read("app/api/admin/bulletins/[id]/pages/[page]/route.ts");
    expect(source).toContain("MAX_PAGE_UPLOAD_BYTES");
    expect(source).toContain("assertImageContentType(");
    expect(source.indexOf("normalizePageImage(")).toBeLessThan(source.indexOf("savePage(") + "savePage(".length + 60);
  });

  it("publishing needs a complete draft, replaces the same date in one transaction, and notifies only on request", () => {
    const service = read("src/features/bulletin/service.ts");
    expect(service).toContain("PAGES_INCOMPLETE");
    expect(service).toContain("NOT_A_DRAFT");
    const publish = service.slice(service.indexOf("export async function publishDraft"));
    expect(publish).toContain(".transaction(");
    expect(publish.indexOf("delete(bulletins)")).toBeLessThan(publish.indexOf('status: "published"'));
    const route = read("app/api/admin/bulletins/[id]/publish/route.ts");
    expect(route).toContain("if (parsed.data.notify)");
    expect(route).toContain('push = "failed"');
  });

  it("cleanup removes expired bulletins and abandoned drafts, and is triggered by admin actions", () => {
    const service = read("src/features/bulletin/service.ts");
    expect(service).toContain("lt(bulletins.bulletinDate, retentionCutoff(today))");
    expect(service).toContain("interval '1 day'");
    expect(read("app/api/admin/bulletins/route.ts").match(/purgeExpiredBulletins\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("database and assets", () => {
  it("the migration locks the tables, allows one live bulletin per date and stores no PDF", () => {
    const sql = read("drizzle/20261120000000_bulletins.sql");
    expect(sql).toContain("bulletins_live_date_uq");
    expect(sql).toContain("where status <> 'draft'");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on prayer_app.bulletins, prayer_app.bulletin_pages");
    expect(sql).toContain("on delete cascade");
    expect(sql.toLowerCase()).not.toContain("pdf bytea");
  });

  it("pdf.js is self-hosted with its license and excluded from lint", () => {
    for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs", "LICENSE", "README.md"]) {
      expect(existsSync(`public/vendor/pdfjs/${file}`), file).toBe(true);
    }
    expect(statSync("public/vendor/pdfjs/pdf.min.mjs").size).toBeGreaterThan(100_000);
    expect(existsSync("public/vendor/pdfjs/cmaps/Adobe-Korea1-UCS2.bcmap")).toBe(true);
    expect(read("eslint.config.mjs")).toContain("public/vendor/**");
    const converter = read("src/features/bulletin/convert.ts");
    expect(converter).toContain("/vendor/pdfjs/");
    expect(converter).not.toMatch(/https?:\/\//);
  });
});

describe("screens and links", () => {
  it("the menus, login page and public header link to the bulletin", () => {
    expect(read("components/app/MemberSidebar.tsx")).toContain('href: "/bulletin"');
    expect(read("components/admin/AdminSidebar.tsx")).toContain('href: "/admin/bulletins"');
    expect(read("app/login/page.tsx")).toContain('href="/bulletin"');
    expect(read("app/(public)/layout.tsx")).toContain('href="/bulletin"');
  });

  it("the viewer offers paging, zoom, thumbnails, sharing and a PDF download", () => {
    const viewer = read("components/bulletin/BulletinViewer.tsx");
    for (const needle of ["이전 쪽", "다음 쪽", "확대", "축소", "링크 공유", "PDF로 저장", "ArrowRight", "onTouchEnd"]) {
      expect(viewer, needle).toContain(needle);
    }
    expect(read("components/bulletin/useBulletinPdf.ts")).toContain("buildPdf(");
  });

  it("the admin screen converts in the browser and warns about public exposure and replacement", () => {
    const admin = read("components/admin/bulletin/AdminBulletinManagement.tsx");
    expect(admin).toContain("openPdf(");
    expect(admin).toContain("개인정보");
    expect(admin).toContain("교체됩니다");
    expect(admin).toContain("다시 시도");
  });

  it("the privacy policy mentions the public bulletin", () => {
    expect(read("app/(public)/privacy/page.tsx")).toContain("<dt>주보</dt>");
  });
});
