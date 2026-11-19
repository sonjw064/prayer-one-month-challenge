import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the real bulletin routes against a real PostgreSQL database. It is skipped unless
 * BULLETIN_TEST_DATABASE_URL points at a disposable database that already has every migration applied.
 */
const databaseUrl = process.env.BULLETIN_TEST_DATABASE_URL;

const session = vi.hoisted(() => ({
  user: null as null | { id: string; displayName: string; samId: null; role: "admin" | "member" },
}));
vi.mock("../../src/features/auth/http-session", () => ({
  getCurrentSessionUser: async () => session.user,
}));

if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
  process.env.SESSION_SECRET = "s".repeat(32);
  process.env.PHONE_LOOKUP_PEPPER = "p".repeat(32);
  process.env.ROSTER_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
}

const ORIGIN = "http://localhost";

describe.skipIf(!databaseUrl)("bulletin with a real database", () => {
  let db: ReturnType<typeof import("../../src/db/client").getDb>;
  let sql: typeof import("drizzle-orm").sql;
  let adminId = "";
  let memberId = "";
  let today = "";
  let addDays: typeof import("../../src/features/challenge/date").addDays;

  // Route handlers, loaded after the environment is set.
  let listRoute: typeof import("../../app/api/bulletins/route");
  let publicPageRoute: typeof import("../../app/api/bulletins/[id]/pages/[page]/route");
  let adminRoute: typeof import("../../app/api/admin/bulletins/route");
  let adminItemRoute: typeof import("../../app/api/admin/bulletins/[id]/route");
  let adminPageRoute: typeof import("../../app/api/admin/bulletins/[id]/pages/[page]/route");
  let publishRoute: typeof import("../../app/api/admin/bulletins/[id]/publish/route");

  const asAdmin = () => { session.user = { id: adminId, displayName: "관리자", samId: null, role: "admin" }; };
  const asMember = () => { session.user = { id: memberId, displayName: "성도", samId: null, role: "member" }; };
  const asNobody = () => { session.user = null; };

  async function jpeg(width = 1400, height = 1979) {
    return sharp({ create: { width, height, channels: 3, background: { r: 230, g: 200, b: 120 } } }).jpeg().toBuffer();
  }
  const request = (path: string, init: RequestInit = {}) =>
    new Request(`${ORIGIN}${path}`, { ...init, headers: { origin: ORIGIN, ...(init.headers as Record<string, string> | undefined) } });
  const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

  async function createDraft(date: string, pageCount: number, title = "주일 주보") {
    const response = await adminRoute.POST(request("/api/admin/bulletins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, title, pageCount }),
    }));
    expect(response.status).toBe(201);
    return (await response.json()).id as string;
  }
  async function putPage(id: string, page: number, body: Buffer | Uint8Array, type = "image/jpeg") {
    return adminPageRoute.PUT(
      request(`/api/admin/bulletins/${id}/pages/${page}`, { method: "PUT", headers: { "content-type": type }, body: new Uint8Array(body) }),
      ctx({ id, page: String(page) }),
    );
  }
  async function uploadAll(id: string, count: number) {
    const bytes = await jpeg();
    for (let page = 1; page <= count; page += 1) expect((await putPage(id, page, bytes)).status).toBe(200);
  }
  const publish = (id: string, body: unknown = {}) =>
    publishRoute.POST(request(`/api/admin/bulletins/${id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx({ id }));
  const publicList = async () => (await (await listRoute.GET()).json()).bulletins as Array<{ id: string; date: string; pageCount: number }>;
  const publicPage = (id: string, page: number | string, query = "", headers: Record<string, string> = {}) =>
    publicPageRoute.GET(request(`/api/bulletins/${id}/pages/${page}${query}`, { headers }), ctx({ id, page: String(page) }));
  const code = async (response: Response) => (await response.json()).code as string;

  beforeAll(async () => {
    const client = await import("../../src/db/client");
    db = client.getDb();
    ({ sql } = await import("drizzle-orm"));
    ({ addDays } = await import("../../src/features/challenge/date"));
    today = (await import("../../src/features/challenge/date")).todayInSeoul();
    listRoute = await import("../../app/api/bulletins/route");
    publicPageRoute = await import("../../app/api/bulletins/[id]/pages/[page]/route");
    adminRoute = await import("../../app/api/admin/bulletins/route");
    adminItemRoute = await import("../../app/api/admin/bulletins/[id]/route");
    adminPageRoute = await import("../../app/api/admin/bulletins/[id]/pages/[page]/route");
    publishRoute = await import("../../app/api/admin/bulletins/[id]/publish/route");

    const { users } = await import("../../src/db/schema");
    const [admin] = await db.insert(users).values({ displayName: "관리자", normalizedName: "관리자", phoneLookupHash: "a".repeat(64), phonePasswordHash: "x", role: "admin" }).returning({ id: users.id });
    const [member] = await db.insert(users).values({ displayName: "성도", normalizedName: "성도", phoneLookupHash: "b".repeat(64), phonePasswordHash: "x" }).returning({ id: users.id });
    adminId = admin.id;
    memberId = member.id;
  });

  beforeEach(async () => {
    await db.execute(sql`delete from prayer_app.bulletins`);
    asAdmin();
  });

  afterAll(async () => {
    if (!db) return;
    await db.execute(sql`delete from prayer_app.bulletins`);
    await db.execute(sql`delete from prayer_app.users where id in (${adminId}, ${memberId})`);
    await (await import("../../src/db/client")).closeDb();
  });

  it("uploads, previews, publishes and serves a bulletin to anyone without logging in", async () => {
    const id = await createDraft(today, 3, "추수감사 주일");
    await uploadAll(id, 3);

    // Invisible to the public until published.
    asNobody();
    expect(await publicList()).toEqual([]);
    expect((await publicPage(id, 1)).status).toBe(404);

    // The administrator can preview the draft pages.
    asAdmin();
    const preview = await adminPageRoute.GET(request(`/api/admin/bulletins/${id}/pages/2?size=thumb`), ctx({ id, page: "2" }));
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("private, no-cache");

    expect((await publish(id)).status).toBe(200);

    // A visitor who is not logged in can now see it.
    asNobody();
    const list = await publicList();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, date: today, pageCount: 3 });
    const listResponse = await listRoute.GET();
    expect(listResponse.headers.get("cache-control")).toContain("public");

    const full = await publicPage(id, 1);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/webp");
    expect(full.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=3600");
    const fullBytes = Buffer.from(await full.arrayBuffer());
    expect((await sharp(fullBytes).metadata()).format).toBe("webp");

    const thumb = await publicPage(id, 1, "?size=thumb");
    expect(Buffer.from(await thumb.arrayBuffer()).length).toBeLessThan(fullBytes.length);

    // Conditional requests are cheap.
    const etag = full.headers.get("etag")!;
    expect((await publicPage(id, 1, "", { "if-none-match": etag })).status).toBe(304);

    expect((await publicPage(id, 4)).status).toBe(404);
    expect((await publicPage(id, "abc")).status).toBe(404);
    expect((await publicPage("not-a-uuid", 1)).status).toBe(404);
  });

  it("refuses to publish a draft that is missing pages", async () => {
    const id = await createDraft(today, 3);
    await putPage(id, 1, await jpeg());
    await putPage(id, 2, await jpeg());
    const response = await publish(id);
    expect(response.status).toBe(409);
    expect(await code(response)).toBe("PAGES_INCOMPLETE");
    asNobody();
    expect(await publicList()).toEqual([]);
  });

  it("validates every page upload", async () => {
    const id = await createDraft(today, 2);
    const good = await jpeg();

    const beyond = await putPage(id, 3, good);
    expect(beyond.status).toBe(404);
    expect(await code(beyond)).toBe("PAGE_NOT_FOUND");

    const wrongType = await putPage(id, 1, good, "image/gif");
    expect(wrongType.status).toBe(415);

    const garbage = await putPage(id, 1, Buffer.from("this is not an image"));
    expect(garbage.status).toBe(400);
    expect(await code(garbage)).toBe("INVALID_IMAGE");

    const huge = await putPage(id, 1, Buffer.alloc(3 * 1024 * 1024 + 1, 1));
    expect(huge.status).toBe(413);

    // Re-uploading a page replaces it.
    expect((await putPage(id, 1, good)).status).toBe(200);
    expect((await putPage(id, 1, await jpeg(900, 1200))).status).toBe(200);
    const count = await db.execute(sql`select count(*)::int as n from prayer_app.bulletin_pages where bulletin_id = ${id}`);
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });

  it("only administrators can change anything, and only from the same origin", async () => {
    const id = await createDraft(today, 1);
    const good = await jpeg();
    const attempts = async () => [
      (await adminRoute.GET()).status,
      (await adminRoute.POST(request("/api/admin/bulletins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: today, pageCount: 1 }) }))).status,
      (await putPage(id, 1, good)).status,
      (await publish(id)).status,
      (await adminItemRoute.PATCH(request(`/api/admin/bulletins/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "hidden" }) }), ctx({ id }))).status,
      (await adminItemRoute.DELETE(request(`/api/admin/bulletins/${id}`, { method: "DELETE" }), ctx({ id }))).status,
    ];
    asMember();
    expect(await attempts()).toEqual([403, 403, 403, 403, 403, 403]);
    asNobody();
    expect(await attempts()).toEqual([403, 403, 403, 403, 403, 403]);

    asAdmin();
    const crossSite = await adminRoute.POST(new Request(`${ORIGIN}/api/admin/bulletins`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ date: today, pageCount: 1 }),
    }));
    expect(crossSite.status).toBe(403);
    const rows = await db.execute(sql`select count(*)::int as n from prayer_app.bulletins`);
    expect((rows.rows[0] as { n: number }).n).toBe(1); // only the draft made above; nothing was changed by the refused calls
  });

  it("does not let a published bulletin be changed", async () => {
    const id = await createDraft(today, 1);
    await uploadAll(id, 1);
    expect((await publish(id)).status).toBe(200);
    const again = await putPage(id, 1, await jpeg());
    expect(again.status).toBe(409);
    expect(await code(again)).toBe("NOT_A_DRAFT");
    expect((await publish(id)).status).toBe(409);
  });

  it("replaces the bulletin of the same date when a new one is published", async () => {
    const first = await createDraft(today, 1, "처음");
    await uploadAll(first, 1);
    expect((await publish(first)).status).toBe(200);

    const second = await createDraft(today, 2, "수정본");
    await uploadAll(second, 2);
    const response = await publish(second);
    expect(response.status).toBe(200);
    expect((await response.json()).replaced).toBe(true);

    asNobody();
    const list = await publicList();
    expect(list.map((item) => item.id)).toEqual([second]);
    expect((await publicPage(first, 1)).status).toBe(404);
    expect((await publicPage(second, 2)).status).toBe(200);

    // The database itself refuses two live bulletins on one date.
    await expect(
      db.execute(sql`insert into prayer_app.bulletins(bulletin_date, title, page_count, status) values (${today}, 'x', 1, 'hidden')`),
    ).rejects.toThrow();
  });

  it("hides a bulletin from the public and shows it again", async () => {
    const id = await createDraft(today, 1);
    await uploadAll(id, 1);
    await publish(id);

    const toggle = (status: string) =>
      adminItemRoute.PATCH(request(`/api/admin/bulletins/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }), ctx({ id }));
    expect((await toggle("hidden")).status).toBe(200);
    asNobody();
    expect(await publicList()).toEqual([]);
    expect((await publicPage(id, 1)).status).toBe(404);

    asAdmin();
    expect((await toggle("published")).status).toBe(200);
    asNobody();
    expect(await publicList()).toHaveLength(1);

    asAdmin();
    const draft = await createDraft(addDays(today, 7), 1);
    const onDraft = await adminItemRoute.PATCH(request(`/api/admin/bulletins/${draft}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "published" }) }), ctx({ id: draft }));
    expect(onDraft.status).toBe(404); // a draft cannot be published by toggling visibility
  });

  it("hides bulletins 30 days after their date and really deletes them at the next cleanup", async () => {
    const insertLive = async (date: string) => {
      const row = await db.execute(sql`insert into prayer_app.bulletins(bulletin_date, title, page_count, status) values (${date}, '옛 주보', 1, 'published') returning id`);
      const id = (row.rows[0] as { id: string }).id;
      const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).webp().toBuffer();
      await db.execute(sql`insert into prayer_app.bulletin_pages(bulletin_id, page_no, image, width, height, thumb) values (${id}, 1, ${image}, 10, 10, ${image})`);
      return id;
    };
    // Starting an upload also runs the cleanup, so make the draft first and the old rows afterwards.
    const abandoned = await createDraft(today, 1);
    await db.execute(sql`update prayer_app.bulletins set created_at = now() - interval '2 days' where id = ${abandoned}`);
    const old = await insertLive(addDays(today, -31));
    const edge = await insertLive(addDays(today, -30));

    // Already invisible to visitors even though the row still exists.
    asNobody();
    expect((await publicList()).map((item) => item.id)).toEqual([edge]);
    expect((await publicPage(old, 1)).status).toBe(404);
    expect((await publicPage(edge, 1)).status).toBe(200);
    const before = await db.execute(sql`select count(*)::int as n from prayer_app.bulletins`);
    expect((before.rows[0] as { n: number }).n).toBe(3);

    // An administrator opening the screen triggers the cleanup.
    asAdmin();
    const response = await adminRoute.GET();
    const body = await response.json();
    expect(body.bulletins.map((item: { id: string }) => item.id)).toEqual([edge]);
    const rows = await db.execute(sql`select id from prayer_app.bulletins`);
    expect((rows.rows as Array<{ id: string }>).map((row) => row.id)).toEqual([edge]);
    const pages = await db.execute(sql`select count(*)::int as n from prayer_app.bulletin_pages`);
    expect((pages.rows[0] as { n: number }).n).toBe(1); // the deleted bulletin's page went with it
  });

  it("refuses to start an upload for a date that is already past the retention period", async () => {
    const response = await adminRoute.POST(request("/api/admin/bulletins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: addDays(today, -31), pageCount: 1 }),
    }));
    expect(response.status).toBe(400);
    expect(await code(response)).toBe("DATE_EXPIRED");
  });

  it("lists uploads for the administrator with progress, and deletes with the pages", async () => {
    const id = await createDraft(today, 3);
    await putPage(id, 1, await jpeg());
    const listed = (await (await adminRoute.GET()).json()).bulletins as Array<{ id: string; status: string; uploadedPages: number; pageCount: number; expired: boolean }>;
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id, status: "draft", uploadedPages: 1, pageCount: 3, expired: false });

    const removed = await adminItemRoute.DELETE(request(`/api/admin/bulletins/${id}`, { method: "DELETE" }), ctx({ id }));
    expect(removed.status).toBe(200);
    const pages = await db.execute(sql`select count(*)::int as n from prayer_app.bulletin_pages`);
    expect((pages.rows[0] as { n: number }).n).toBe(0);
    const again = await adminItemRoute.DELETE(request(`/api/admin/bulletins/${id}`, { method: "DELETE" }), ctx({ id }));
    expect(again.status).toBe(404);
  });

  it("publishes even when the optional notification cannot be sent", async () => {
    const id = await createDraft(today, 1);
    await uploadAll(id, 1);
    const response = await publish(id, { notify: true });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.push).toBe("failed"); // push is not configured in this test database
    asNobody();
    expect(await publicList()).toHaveLength(1);
  });
});
