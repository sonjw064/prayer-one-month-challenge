"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReportBadge } from "../pastoral/ReportStatusBadge";
import { UnreadNoticeBadge } from "../notices/UnreadNoticeBadge";

const memberNav = [
  { href: "/notices", label: "공지", icon: "🔔" },
  { href: "/", label: "기도운동", icon: "🙏" },
  { href: "/calendar", label: "일정", icon: "📅" },
  { href: "/visits", label: "심방신청", icon: "♡" },
  { href: "/prayer-requests", label: "기도요청", icon: "♥" },
  { href: "/community", label: "커뮤니티", icon: "💬" },
  { href: "/pastoral-reports", label: "목양지", icon: "📝" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MemberSidebar({ onNavigate, unreadCount, pastoralVisible = false, pastoralCount = 0, prayerMenuEnabled = true, prayerMenuName = "기도운동", prayerHasUnread = false }: { onNavigate?: () => void; unreadCount: number; pastoralVisible?: boolean; pastoralCount?: number; prayerMenuEnabled?: boolean; prayerMenuName?: string; prayerHasUnread?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="member-nav" aria-label="3D 메뉴">
      {memberNav.filter(item =>
        (item.href !== "/" || prayerMenuEnabled) &&
        (item.href !== "/pastoral-reports" || pastoralVisible)).map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} className={`member-nav-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} onClick={onNavigate}>
            <span className="member-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.href === "/" ? prayerMenuName : item.label}</span>
            {item.href === "/pastoral-reports" && <ReportBadge count={pastoralCount} />}
            {item.href === "/notices" && <UnreadNoticeBadge count={unreadCount} />}
            {item.href === "/prayer-requests" && prayerHasUnread && <span className="nav-badge" aria-label="읽지 않은 기도요청 댓글">!</span>}
          </Link>
        );
      })}
    </nav>
  );
}
