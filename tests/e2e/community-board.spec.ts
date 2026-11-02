import { expect, test } from "@playwright/test";
import { login, expectNoOverflow } from "./helpers";

test("community stays private in notice-first member navigation", async ({ page, request }) => {
  test.skip(process.env.E2E_DATABASE_READY !== "1", "Requires disposable CI DB");
  expect((await request.get("/api/community/folders")).status()).toBe(401);
  await login(page);
  await page.goto("/community");
  await expect(page.getByRole("heading", { name: "커뮤니티", exact: true })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "3D 메뉴" });
  const labels = await menu.locator("a").allTextContents();
  const expected = ["공지", "기도운동", "심방신청", "기도요청", "커뮤니티"];
  expected.forEach((label, index) => expect(labels[index]).toContain(label));
  const folders = await page.request.get("/api/community/folders");
  expect(folders.ok()).toBe(true);
  expect((await folders.json()).folders.length).toBeGreaterThan(0);
  expect((await page.request.post("/api/community/folders", { data: { name: "회원이 생성하면 안 됨" } })).status()).toBe(403);
  await page.setViewportSize({ width: 360, height: 800 });
  await expectNoOverflow(page);
});
