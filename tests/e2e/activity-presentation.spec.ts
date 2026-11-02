import { expect, test } from "@playwright/test";
import { login, expectNoOverflow } from "./helpers";

const endpoint = "/api/admin/prayer/menu-settings";

test("admin edits the activity name and description; members see them without losing records", async ({ page, browser, baseURL }, testInfo) => {
  test.skip(process.env.E2E_DATABASE_READY !== "1", "Requires the disposable CI database.");
  await login(page, "admin");
  const original = await (await page.request.get(endpoint)).json();
  const memberContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const member = await memberContext.newPage();
  const name = "말씀 읽기 운동";
  const description = "매일 말씀을 한 장 읽고 체크해 주세요.\n감사한 내용을 떠올려 보세요. <script>본문</script>";
  try {
    await login(member);
    const records = await (await member.request.get("/api/checkins")).json();
    const challenges = await (await page.request.get("/api/admin/challenge")).json();
    expect((await member.request.put(endpoint, { data: { enabled: true, name, description } })).status()).toBe(403);
    await page.goto("/admin/prayer");
    const section = page.getByRole("region", { name: "운동 이름·설명 및 탭 설정" });
    await section.getByLabel("운동 이름", { exact: true }).fill(name);
    await section.getByLabel("운동 설명", { exact: true }).fill(description);
    await section.getByRole("button", { name: "저장", exact: true }).click();
    await expect(section.getByRole("status")).toContainText("저장했습니다");
    await expect(page.getByRole("heading", { name: `${name} 관리`, exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "관리자 메뉴" }).getByRole("link", { name: `${name} 관리`, exact: true })).toBeVisible();
    await member.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(member.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(member.locator(".activity-description")).toHaveText(description);
    await expect(member.locator(".activity-description")).toHaveCSS("white-space", "pre-wrap");
    await expect(member.locator(".activity-description script")).toHaveCount(0);
    await expect(member.getByRole("region", { name: "참여 완료 달력" })).toBeVisible();
    await member.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await expect(member.getByRole("navigation", { name: "3D 메뉴" }).getByRole("link", { name, exact: true })).toBeVisible();
    await expectNoOverflow(member);
    await member.getByRole("navigation", { name: "3D 메뉴" }).getByRole("link", { name, exact: true }).click({ timeout: 10_000 });
    await expect.poll(() => member.locator(".community-sidebar").evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
    await expectNoOverflow(member);
    expect(await member.locator(".activity-description").evaluate((element) => element.scrollWidth <= element.clientWidth && element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
    await member.screenshot({ path: testInfo.outputPath("member-activity-mobile.png"), fullPage: true });
    await page.reload();
    await expect(section.getByLabel("운동 이름", { exact: true })).toHaveValue(name);
    await expect(section.getByLabel("운동 설명", { exact: true })).toHaveValue(description);
    expect(await (await member.request.get("/api/checkins")).json()).toEqual(records);
    expect(await (await page.request.get("/api/admin/challenge")).json()).toEqual(challenges);
    await page.screenshot({ path: testInfo.outputPath("admin-activity-desktop.png"), fullPage: true });

    // Blank descriptions are intentionally removable; failed saves keep the draft and saved value.
    await section.getByLabel("운동 설명", { exact: true }).fill("");
    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() === "PUT") await route.fulfill({ status: 503, json: { code: "UNAVAILABLE" } });
      else await route.continue();
    });
    await section.getByRole("button", { name: "저장", exact: true }).click();
    await expect(section.getByRole("alert")).toBeVisible();
    expect((await (await page.request.get(endpoint)).json()).description).toBe(description);
    await expect(section.getByLabel("운동 설명", { exact: true })).toHaveValue("");
    await page.unroute(`**${endpoint}`);
    await section.getByRole("button", { name: "저장", exact: true }).click();
    await expect(section.getByRole("status")).toContainText("저장했습니다");
    await member.reload();
    await expect(member.locator(".activity-description")).toHaveCount(0);
  } finally {
    await page.unroute(`**${endpoint}`);
    expect((await page.request.put(endpoint, { data: original })).status()).toBe(200);
    await memberContext.close();
  }
});

test("long activity names fit the mobile summary and inactive activity screen", async ({ page, browser, baseURL }) => {
  test.skip(process.env.E2E_DATABASE_READY !== "1", "Requires the disposable CI database.");
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin");
  const original = await (await page.request.get(endpoint)).json();
  const { challenges } = await (await page.request.get("/api/admin/challenge")).json();
  const active = challenges.find((challenge: { isActive: boolean }) => challenge.isActive);
  expect(active).toBeDefined();
  const memberContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const member = await memberContext.newPage();
  const name = "DailyScriptureReadingAndThanksgiving";
  try {
    expect((await page.request.put(endpoint, { data: { enabled: true, name, description: "" } })).status()).toBe(200);
    await login(member);
    await page.goto("/admin");
    const summary = page.locator('.admin-summary-card[href="/admin/prayer"]');
    await expect(summary).toContainText(name);
    expect(await summary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expectNoOverflow(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    expect(await summary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect((await page.request.post("/api/admin/challenge", { data: { ...active, isActive: false } })).status()).toBe(200);
    await member.reload();
    await expect(member.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(member.getByText("아직 활성화된 도전이 없습니다.")).toBeVisible();
    await expectNoOverflow(member);
  } finally {
    expect((await page.request.post("/api/admin/challenge", { data: active })).status()).toBe(200);
    expect((await page.request.put(endpoint, { data: original })).status()).toBe(200);
    await memberContext.close();
  }
});
