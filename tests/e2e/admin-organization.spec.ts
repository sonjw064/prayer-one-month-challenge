import { expect, test } from "@playwright/test";
import { read } from "xlsx";
import { expectNoOverflow, login } from "./helpers";

test.describe("management organization and booking period", () => {
  test.skip(process.env.E2E_DATABASE_READY !== "1", "Requires disposable CI DB");

  test("saves, reloads, validates, and clears the booking period on the visits page", async ({ page }) => {
    await login(page, "admin");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/admin/visits");
    await expect(page.getByRole("heading", {name: "심방 신청 가능일", exact:true})).toBeVisible();
    const start = page.getByLabel("신청 가능 시작일");
    const end = page.getByLabel("신청 가능 종료일");
    await expect(start).toBeEnabled();
    try {
      await start.fill("2099-10-01"); await end.fill("2099-11-30");
      await page.getByRole("button", {name:"신청 기간 저장", exact:true}).click();
      await expect(page.getByText("신청 기간을 저장했습니다: 2099-10-01 ~ 2099-11-30", {exact:true})).toBeVisible();
      await page.reload();
      await expect(start).toHaveValue("2099-10-01"); await expect(end).toHaveValue("2099-11-30");
      const invalid = await page.request.put("/api/admin/visits/booking-period", {data:{ startDate:"2099-12-01", endDate:"2099-11-01" }});
      expect(invalid.status()).toBe(400);
      expect(await (await page.request.get("/api/admin/visits/booking-period")).json()).toEqual({period:{ startDate:"2099-10-01", endDate:"2099-11-30" }});
      await expectNoOverflow(page);
      await page.getByRole("button", {name:"기간 제한 해제", exact:true}).click();
      await expect(start).toHaveValue(""); await expect(end).toHaveValue("");
    } finally {
      expect((await page.request.put("/api/admin/visits/booking-period", {data:{startDate:null,endDate:null}})).ok()).toBe(true);
    }
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/admin\/visits#google-calendar$/);
    await expect(page.getByRole("heading", {name:"심방 신청 가능일",exact:true})).toBeVisible();
    await expect(page.getByRole("heading", {name:"Google Calendar",exact:true})).toBeVisible();
    await expect(page.getByRole("link", {name:"설정",exact:true})).toHaveCount(0);
    await expect(page.getByText("새 공지 Push",{exact:true})).toHaveCount(0);
    await expect(page.getByRole("heading", {name:"샘 리더 관리",exact:true})).toHaveCount(0);
  });

  test("downloads both Excel examples from user management and removes push opt-in", async ({ page }) => {
    await login(page, "admin");
    await page.setViewportSize({width:360,height:800});
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", {name:"샘 리더 관리",exact:true})).toBeVisible();
    for (const name of ["샘 리더 엑셀 예제 다운로드", "삼덕청년부 명단 엑셀 예제 다운로드"]) {
      const link = page.getByRole("link", {name,exact:true});
      const response = await page.request.get((await link.getAttribute("href"))!);
      expect(response.ok()).toBe(true);
      const workbook = read(await response.body(),{type:"buffer"});
      expect(workbook.SheetNames).toHaveLength(2);
      const download = page.waitForEvent("download");
      await link.click();
      expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
    }
    await expectNoOverflow(page);
    await page.goto("/notices");
    await expect(page.getByRole("button", {name:/새 공지 알림/})).toHaveCount(0);
  });
});
