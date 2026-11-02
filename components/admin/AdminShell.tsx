"use client";

import Link from "next/link";
import { useState } from "react";
import { LogoutButton } from "../auth/LogoutButton";
import { AdminSidebar } from "./AdminSidebar";
import { PrayerMenuProvider } from "../app/PrayerMenuProvider";
import { defaultPrayerMenuSettings, type PrayerMenuSetting } from "../../src/features/prayer-menu/settings";

export function AdminShell({
  displayName,
  initialPrayerMenuSettings = defaultPrayerMenuSettings,
  children,
}: {
  displayName: string;
  initialPrayerMenuSettings?: PrayerMenuSetting;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <PrayerMenuProvider initial={initialPrayerMenuSettings} menuOpen={open}>
    <div className="admin-hub">
      <button
        className="admin-hub-menu-button"
        type="button"
        aria-label="관리자 메뉴 열기"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        ☰
      </button>

      {open && (
        <button
          className="admin-hub-overlay"
          type="button"
          aria-label="관리자 메뉴 닫기"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={open ? "admin-hub-sidebar is-open" : "admin-hub-sidebar"}>
        <div className="admin-hub-brand">
          <strong>3D 관리자</strong>
          <span>{displayName} 님</span>
        </div>
        <AdminSidebar onNavigate={() => setOpen(false)} />
        <div className="admin-hub-footer">
          <Link href="/">사용자 화면</Link>
          <LogoutButton />
        </div>
      </aside>

      <section className="admin-hub-stage">
        <header className="admin-hub-topbar">
          <div>
            <p className="eyebrow">삼덕청년부</p>
            <strong>관리자 센터</strong>
          </div>
        </header>
        <div className="admin-hub-content">{children}</div>
      </section>
    </div>
    </PrayerMenuProvider>
  );
}
