import { expect, test } from "@playwright/test";
import { login, expectNoOverflow } from "./helpers";

const endpoint = "/api/admin/prayer/menu-settings";

test("saved global visibility controls member and admin navigation on mobile and desktop", async ({ page, browser, baseURL }, testInfo) => {
  test.skip(process.env.E2E_DATABASE_READY !== "1", "Requires the disposable CI database.");
  await login(page, "admin");
  const memberContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  const member = await memberContext.newPage();
  try {
    await login(member);
    const beforeRecords = await (await member.request.get("/api/checkins")).json();
    const beforeChallenge = await (await page.request.get("/api/admin/challenge")).json();
    await page.goto("/admin/prayer");
    const section = page.getByRole("region", { name: "운동 이름·설명 및 탭 설정" });
    const checkbox = section.getByRole("checkbox", { name: "운동 탭 활성화" });
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("heading", { name: "참여자 명단", exact: true })).toBeVisible();
    // The settings section follows, rather than replacing, the existing management content.
    expect(await section.evaluate((el) => Boolean(el.previousElementSibling?.querySelector(".participant-table")))).toBe(true);
    await checkbox.uncheck();
    await expect(page.getByRole("heading", { name: "참여자 명단", exact: true })).toBeVisible();
    expect(await (await member.request.get("/api/prayer-menu")).json()).toMatchObject({ enabled: true });
    await section.getByRole("button", { name: "저장", exact: true }).click();
    await expect(section.getByRole("status")).toContainText("숨겨집니다");
    await expect(page.getByRole("heading", {name:"참여자 명단",exact:true})).toHaveCount(0);
    await expect(page.getByRole("heading", {name:"샘별 통계",exact:true})).toHaveCount(0);
    const disabledData=await (await page.request.get("/api/admin/prayer")).json();
    expect(disabledData.prayerMenuEnabled).toBe(false);
    expect(disabledData.members).toEqual([]);expect(disabledData.sams).toEqual([]);
    expect((await (await page.request.get("/api/admin/dashboard")).json()).prayer.participants).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("admin-prayer-menu-disabled.png"), fullPage: true, animations: "disabled" });

    // An already-open root page learns of the change without reloading and goes to notices.
    await member.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(member).toHaveURL(/\/notices$/);
    await member.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    const memberNav = member.getByRole("navigation", { name: "3D 메뉴" });
    await expect(memberNav.getByRole("link", { name: "기도운동", exact: true })).toHaveCount(0);
    await expect(memberNav.getByRole("link").first()).toContainText("공지");
    await expect(memberNav.getByRole("link", { name: "심방신청" })).toBeVisible();
    await expect(memberNav).toBeInViewport({ ratio: 1 });
    await expectNoOverflow(member);
    await member.screenshot({ path: testInfo.outputPath("mobile-menu-disabled.png"), fullPage: true, animations: "disabled" });
    expect(await (await member.request.get("/api/checkins")).json()).toEqual(beforeRecords);
    expect(await (await page.request.get("/api/admin/challenge")).json()).toEqual(beforeChallenge);

    await page.reload();
    await expect(checkbox).not.toBeChecked();
    await page.goto("/");
    await expect(page).toHaveURL(/\/notices$/);
    await expect(page.getByRole("navigation", { name: "3D 메뉴" }).getByRole("link", { name: "기도운동", exact: true })).toHaveCount(0);
    await member.goto("/");
    await expect(member).toHaveURL(/\/notices$/);

    // Administration stays reachable while the global member tab is hidden.
    await page.goto("/admin/prayer");
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await section.getByRole("button", { name: "저장", exact: true }).click();
    await expect(section.getByRole("status")).toContainText("표시됩니다");
    await expect(page.getByRole("heading",{name:"참여자 명단",exact:true})).toBeVisible();
    await expect(page.getByRole("heading",{name:"샘별 통계",exact:true})).toBeVisible();
    await page.reload();
    await expect(checkbox).toBeChecked();
    await member.evaluate(() => window.dispatchEvent(new Event("focus")));
    const opener = member.getByRole("button", { name: "메뉴 열기", exact: true });
    if (await opener.isVisible()) await opener.click();
    await expect(memberNav.getByRole("link").nth(0)).toContainText("공지");
    await expect(memberNav.getByRole("link").nth(1)).toContainText("기도운동");
    await expect(memberNav).toBeInViewport({ ratio: 1 });
    await member.screenshot({ path: testInfo.outputPath("mobile-menu-enabled.png"), fullPage: true, animations: "disabled" });
    await page.goto("/notices");
    const adminNav = page.getByRole("navigation", { name: "3D 메뉴" });
    await expect(adminNav.getByRole("link").nth(0)).toContainText("공지");
    await expect(adminNav.getByRole("link").nth(1)).toContainText("기도운동");
    await page.screenshot({ path: testInfo.outputPath("desktop-menu-enabled.png"), fullPage: true, animations: "disabled" });
  } finally {
    expect((await page.request.put(endpoint, { data: { enabled: true } })).status()).toBe(200);
    await memberContext.close();
  }
});

test("failed save reports an error without changing the persisted setting", async ({ page }) => {
  test.skip(process.env.E2E_DATABASE_READY !== "1", "Requires the disposable CI database.");
  await login(page, "admin");
  await page.goto("/admin/prayer");
  const section = page.getByRole("region", { name: "운동 이름·설명 및 탭 설정" });
  const checkbox = section.getByRole("checkbox", { name: "운동 탭 활성화" });
  await expect(checkbox).toBeChecked();
  await page.route(`**${endpoint}`, async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "UNAVAILABLE" }) });
    } else { await route.continue(); }
  });
  try {
    await checkbox.uncheck();
    await section.getByRole("button", { name: "저장", exact: true }).click();
    await expect(section.getByRole("alert")).toContainText("저장 결과를 확인하지 못했습니다");
    await expect(section.getByRole("status")).toHaveCount(0);
    expect(await (await page.request.get(endpoint)).json()).toMatchObject({ enabled: true });
  } finally { await page.unroute(`**${endpoint}`); }
  await page.reload();
  await expect(checkbox).toBeChecked();
});
