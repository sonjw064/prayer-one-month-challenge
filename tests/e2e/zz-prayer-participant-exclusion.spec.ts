import { expect, test, type BrowserContext } from "@playwright/test";
import postgres from "postgres";
import type { AdminDashboardData } from "../../src/features/admin/service";
import type { AdminHubDashboardData } from "../../src/features/admin/hub-service";
import { addDays, isPrayerDay } from "../../src/features/challenge/date";
import type { MemberDashboard } from "../../src/lib/types";
import { e2eAccounts, e2eChallengeId } from "../fixtures/e2e-data";
import { expectNoOverflow, login } from "./helpers";

test.describe("challenge-only participant exclusion", () => {
  test.skip(process.env.E2E_DATABASE_READY !== "1", "Requires the disposable CI database.");

  test("removes a participant from this challenge's statistics while preserving login and personal prayer records", async ({ page, browser, baseURL }) => {
    const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
    if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname) || databaseUrl.pathname !== "/prayer_e2e") {
      throw new Error("DISPOSABLE_DATABASE_REQUIRED");
    }
    const sql = postgres(databaseUrl.toString(), { ssl: "require", prepare: false, max: 1 });
    const memberId = e2eAccounts.member.userId;
    const endpoint = `/api/admin/prayer/participants/${memberId}`;
    let adminContext: BrowserContext | undefined;
    let cleanupExclusion = false;
    let restorePrayerDate: string | null = null;

    try {
      const existing = await sql`select 1 from prayer_app.prayer_participant_exclusions
        where challenge_id = ${e2eChallengeId} and user_id = ${memberId}`;
      expect(existing).toHaveLength(0);
      cleanupExclusion = true;

      await login(page);
      const original = await (await page.request.get("/api/checkins")).json() as { dashboard: MemberDashboard };
      expect(original.dashboard.challenge.id).toBe(e2eChallengeId);
      const prayerDate = isPrayerDay(original.dashboard.today) ? original.dashboard.today : addDays(original.dashboard.today, -1);
      if (!original.dashboard.completedDates.includes(prayerDate)) restorePrayerDate = prayerDate;
      const checked = await page.request.post("/api/checkins", {
        data: { prayerDate, challengeId: e2eChallengeId, checked: true },
      });
      expect(checked.status()).toBe(200);
      const savedPersonal = await (await page.request.get("/api/checkins")).json() as { dashboard: MemberDashboard };
      expect(savedPersonal.dashboard.completedDates).toContain(prayerDate);
      const profileBefore = await (await page.request.get("/api/profile")).json();
      expect((await page.request.delete(endpoint, { data: { challengeId: e2eChallengeId } })).status()).toBe(403);

      adminContext = await browser.newContext({ baseURL });
      const admin = await adminContext.newPage();
      await login(admin, "admin");
      const before = await (await admin.request.get("/api/admin/prayer")).json() as AdminDashboardData;
      const hubBefore = await (await admin.request.get("/api/admin/dashboard")).json() as AdminHubDashboardData;
      const participant = before.members.find((member) => member.userId === memberId);
      expect(participant).toBeDefined();
      expect(before.challenge?.id).toBe(e2eChallengeId);
      expect(hubBefore.prayer.participants).toBe(before.totals.members);
      const samLabel = participant!.samLabel ?? "미지정";
      const samBefore = before.sams.find((sam) => sam.samLabel === samLabel)!;

      const stale = await admin.request.delete(endpoint, {
        data: { challengeId: "00000000-0000-4000-8000-000000000999" },
      });
      expect(stale.status()).toBe(409);
      expect(await stale.json()).toEqual({ code: "CHALLENGE_CHANGED" });
      expect(await (await admin.request.get("/api/admin/prayer")).json()).toEqual(before);

      await admin.setViewportSize({ width: 360, height: 800 });
      await admin.goto("/admin/prayer");
      const remove = admin.getByRole("button", { name: `${participant!.name} 기도운동 명단에서 삭제`, exact: true });
      await expect(remove).toBeEnabled();
      await expectNoOverflow(admin);
      admin.once("dialog", (dialog) => dialog.dismiss());
      await remove.click();
      await expect(remove).toBeEnabled();
      expect(await (await admin.request.get("/api/admin/prayer")).json()).toEqual(before);

      admin.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain(participant!.name);
        expect(dialog.message()).toContain(before.challenge!.title);
        expect(dialog.message()).toContain(before.challenge!.startDate);
        expect(dialog.message()).toContain("로그인, 회원정보, 개인 기도 체크 기록은 유지됩니다");
        await dialog.accept();
      });
      const removal = admin.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === "DELETE");
      await remove.click();
      const removed = await removal;
      expect(removed.status()).toBe(200);
      expect(removed.request().postDataJSON()).toEqual({ challengeId: e2eChallengeId });
      await expect(remove).toHaveCount(0);
      await expect(admin.getByRole("status")).toContainText("로그인과 개인 기록은 유지됩니다");
      await expect(admin.locator(".admin-kpis article").filter({ hasText: "전체 참여자" }).locator("strong"))
        .toHaveText(`${before.totals.members - 1}명`);

      const after = await (await admin.request.get("/api/admin/prayer")).json() as AdminDashboardData;
      const remaining = before.members.filter((member) => member.userId !== memberId);
      expect(after.members.map((member) => member.userId).sort()).toEqual(remaining.map((member) => member.userId).sort());
      expect(after.totals.members).toBe(before.totals.members - 1);
      expect(after.totals.todayCompleted).toBe(before.totals.todayCompleted - Number(participant!.completedToday));
      expect(after.totals.averageRate).toBeCloseTo(remaining.length ? remaining.reduce((sum, member) => sum + member.rate, 0) / remaining.length : 0);
      const samAfter = after.sams.find((sam) => sam.samLabel === samLabel);
      const samRemaining = remaining.filter((member) => (member.samLabel ?? "미지정") === samLabel);
      expect(samAfter?.members ?? 0).toBe(samBefore.members - 1);
      expect(samAfter?.todayCompleted ?? 0).toBe(samBefore.todayCompleted - Number(participant!.completedToday));
      if (samRemaining.length) {
        expect(samAfter!.averageRate).toBeCloseTo(samRemaining.reduce((sum, member) => sum + member.rate, 0) / samRemaining.length);
      }
      expect(after.sams.filter((sam) => sam.samLabel !== samLabel)).toEqual(before.sams.filter((sam) => sam.samLabel !== samLabel));

      const hubAfter = await (await admin.request.get("/api/admin/dashboard")).json() as AdminHubDashboardData;
      expect(hubAfter.prayer.participants).toBe(hubBefore.prayer.participants - 1);
      expect(hubAfter.prayer.todayCompleted).toBe(hubBefore.prayer.todayCompleted - Number(participant!.completedToday));
      expect(hubAfter.prayer.todayRate).toBe(after.totals.todayRate);
      expect((await admin.request.delete(endpoint, { data: { challengeId: e2eChallengeId } })).status()).toBe(200);
      expect(await (await admin.request.get("/api/admin/prayer")).json()).toEqual(after);
      await admin.reload();
      await expect(admin.getByRole("heading", { name: "참여자 명단", exact: true })).toBeVisible();
      await expect(admin.getByRole("button", { name: `${participant!.name} 기도운동 명단에서 삭제`, exact: true })).toHaveCount(0);

      const personalResponse = await page.request.get("/api/checkins");
      expect(personalResponse.status()).toBe(200);
      expect(await personalResponse.json()).toEqual(savedPersonal);
      expect(await (await page.request.get("/api/profile")).json()).toEqual(profileBefore);
      expect((await page.request.post("/api/checkins", {
        data: { prayerDate, challengeId: e2eChallengeId, checked: true },
      })).status()).toBe(200);
      await page.reload();
      await expect(page.getByRole("heading", { name: "삼덕청년부", exact: true })).toBeVisible();
      await expect(page.getByText(e2eAccounts.member.name, { exact: true })).toBeVisible();
    } finally {
      try {
        if (cleanupExclusion) {
          await sql`delete from prayer_app.prayer_participant_exclusions
            where challenge_id = ${e2eChallengeId} and user_id = ${memberId}`;
        }
        if (restorePrayerDate) {
          const restored = await page.request.post("/api/checkins", {
            data: { prayerDate: restorePrayerDate, challengeId: e2eChallengeId, checked: false },
          });
          expect(restored.status()).toBe(200);
        }
      } finally {
        await sql.end();
        await adminContext?.close();
      }
    }
  });
});
