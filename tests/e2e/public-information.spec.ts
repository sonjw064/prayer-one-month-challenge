import { expect, test } from "@playwright/test";
import { expectNoOverflow } from "./helpers";

for (const width of [360, 1280]) {
  for (const [path, title] of [["/about", "앱 소개"], ["/privacy", "개인정보처리방침"]] as const) {
    test(`anonymous ${path} works at ${width}px without authenticated API calls`, async ({ page, context }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      const authRequests: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) authRequests.push(request.url()); });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page).toHaveTitle(`${title} | 3D`);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "공개 안내 메뉴" })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://prayer-one-month-challenge.vercel.app${path}`);
      await expect.poll(() => page.locator(".public-brand img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expectNoOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-${width}.png`), fullPage: path === "/about" });
      expect(authRequests).toEqual([]);
      expect((await context.cookies()).filter(cookie => cookie.name === "prayer_session")).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("public introduction links directly to the privacy policy and its Google section", async ({ page }) => {
  await page.goto("/about");
  await page.getByRole("link", { name: "개인정보처리방침 읽기 →" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.getByRole("navigation", { name: "개인정보처리방침 목차" }).getByRole("link", { name: "Google Calendar 데이터" }).click();
  await expect(page).toHaveURL(/\/privacy#google-calendar$/);
  await expect(page.locator("#google-calendar")).toContainText("Limited Use");
  await expect(page.locator("#google-calendar")).toContainText("calendar.calendarlist.readonly");
  await expect(page.locator("#rights").getByRole("link", { name: "ditto0310@gmail.com" })).toHaveAttribute("href", "mailto:ditto0310@gmail.com");
});

test("login exposes public information without opening member or admin data", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByRole("navigation", { name: "앱 안내", exact: true }).getByRole("link", { name: "앱 소개", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  expect((await request.get("/api/checkins")).status()).toBe(401);
  expect((await request.get("/api/admin/prayer")).status()).toBe(403);
  expect((await request.get("/admin", { maxRedirects: 0 })).status()).toBe(307);
});

test("both pages remain readable with JavaScript disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const path of ["/about", "/privacy"]) {
      expect((await page.goto(`http://localhost:3000${path}`))?.status()).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.getByRole("main")).toContainText("Google");
    }
  } finally { await context.close(); }
});
