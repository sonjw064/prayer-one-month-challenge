"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PrayerMenuProvider, usePrayerMenuSettings } from "./PrayerMenuProvider";
import type { PrayerMenuSetting } from "../../src/features/prayer-menu/settings";
import type { SessionUser } from "../../src/features/auth/session";
import { LogoutButton } from "../auth/LogoutButton";
import { ReportBadge, usePastoralBadge } from "../pastoral/ReportStatusBadge";
import { MemberSidebar } from "./MemberSidebar";
import { UnreadNoticeBadge, useUnreadNoticeCount } from "../notices/UnreadNoticeBadge";
import { useUnreadPrayerComments } from "../prayer-requests/useUnreadPrayerComments";

export function MemberShell({
  user,
  initialPrayerMenuSettings,
  children,
}: {
  user: SessionUser;
  initialPrayerMenuSettings: PrayerMenuSetting;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <PrayerMenuProvider initial={initialPrayerMenuSettings} menuOpen={menuOpen}>
    <MemberShellContent user={user} menuOpen={menuOpen} setMenuOpen={setMenuOpen}>{children}</MemberShellContent>
  </PrayerMenuProvider>;
}

function MemberShellContent({ user, menuOpen, setMenuOpen, children }: {
  user: SessionUser; menuOpen: boolean; setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>; children: React.ReactNode;
}) {
  const { enabled: prayerMenuEnabled, name } = usePrayerMenuSettings();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!prayerMenuEnabled && pathname === "/") router.replace("/notices");
  }, [prayerMenuEnabled, pathname, router]);
  const unreadCount = useUnreadNoticeCount();
  const prayerHasUnread = useUnreadPrayerComments(menuOpen);
  const pastoral = usePastoralBadge();

  return (
    <div className="community-app">
      <aside className={`community-sidebar${menuOpen ? " is-open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/icons/56-heart-192.png" alt="" width={44} height={44} />
          <strong>3D</strong>
        </div>

        <MemberSidebar prayerMenuEnabled={prayerMenuEnabled} prayerMenuName={name} pastoralVisible={pastoral.visible} pastoralCount={pastoral.count} unreadCount={unreadCount} prayerHasUnread={prayerHasUnread} onNavigate={() => setMenuOpen(false)} />

        <div className="sidebar-footer">
          <Link href="/profile" onClick={() => setMenuOpen(false)}>내 정보</Link>
          {user.role === "admin" && (
            <Link href="/admin" onClick={() => setMenuOpen(false)}>관리자</Link>
          )}
          <LogoutButton />
        </div>
      </aside>

      {menuOpen && (
        <button
          className="community-drawer-overlay"
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="community-main">
        <header className="community-header">
          <button
            className="community-menu-button"
            type="button"
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            onClick={() => setMenuOpen((value) => !value)}
          >
            ☰
            {pastoral.count > 0 ? <ReportBadge count={pastoral.count} /> : <UnreadNoticeBadge count={unreadCount} />}
          </button>
          <div>
            <h1>삼덕청년부</h1>
            <p className="community-verse">성령이 하나 되게 하신 것을 힘써 지키라(엡 4:3)</p>
          </div>
        </header>
        <div className="community-content">{!prayerMenuEnabled && pathname === "/" ? null : children}</div>
      </div>
    </div>
  );
}
