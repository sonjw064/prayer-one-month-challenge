import { expect, test } from "@playwright/test";

test.describe("mobile and PWA shell", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("login fits a narrow phone viewport without horizontal overflow", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "삼덕청년부" })).toBeVisible();
    await expect(page.getByLabel("이름 (아이디)")).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "3D");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/56-heart-apple-180.png");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test("manifest and install icons are served", async ({ request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const body = await manifest.json();
    expect(body.name).toBe("3D");
    expect(body.display).toBe("standalone");

    for (const path of [
      "/icons/56-heart-192.png",
      "/icons/56-heart-512.png",
      "/icons/56-heart-maskable-512.png",
      "/icons/56-heart-apple-180.png",
    ]) {
      const response = await request.get(path);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
  });
});
