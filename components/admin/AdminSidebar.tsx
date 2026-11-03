"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrayerMenuSettings } from "../app/PrayerMenuProvider";
const adminNav = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/notices", label: "공지 관리" },
  { href: "/admin/calendar", label: "일정 관리" },
  { href: "/admin/prayer", label: "기도운동 관리" },
  { href: "/admin/visits", label: "심방 신청 관리" },
  { href: "/admin/prayer-requests", label: "기도요청 관리" },
  { href: "/admin/community", label: "커뮤니티 관리" },
  { href: "/admin/pastoral-reports", label: "목양지 관리" },
  { href: "/admin/users", label: "사용자 관리" },
] as const;
function activePath(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}
export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { name } = usePrayerMenuSettings();
  return <nav className="admin-hub-nav" aria-label="관리자 메뉴">
    {adminNav.map((item) => {
      const active = activePath(pathname, item.href);
      return <Link key={item.href} href={item.href} className={active ? "admin-hub-link is-active" : "admin-hub-link"} aria-current={active ? "page" : undefined} onClick={onNavigate}>{item.href === "/admin/prayer" ? `${name} 관리` : item.label}</Link>;
    })}
  </nav>;
}
