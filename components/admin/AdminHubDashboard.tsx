import Link from "next/link";
import type { AdminHubDashboardData } from "../../src/features/admin/hub-service";
import { usePrayerMenuSettings } from "../app/PrayerMenuProvider";

function percent(value: number) {
  return Math.round(value * 100) + "%";
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdminHubDashboard({
  data, onPageChange, loading = false,
}: {
  data: AdminHubDashboardData;
  onPageChange?: (page: number) => void;
  loading?: boolean;
}) {
  const { name } = usePrayerMenuSettings();
  return (
    <div className="admin-hub-dashboard">
      <section className="admin-page-heading">
        <p className="eyebrow">전체 요약</p>
        <h1>대시보드</h1>
        <p>3D의 주요 현황을 한눈에 확인하세요.</p>
      </section>

      <section className="admin-summary-grid" aria-label="주요 현황">
        <Link className="admin-summary-card" href="/admin/pastoral-reports?unreviewed=1">
          <span>목양지 미확인</span><strong>{data.pastoral.unreviewed}건</strong>
          <small>완료된 제출본 중 관리자 미확인</small>
        </Link>
        <Link className="admin-summary-card" href="/admin/users">
          <span>활성 사용자</span><strong>{data.users.active}명</strong>
          <small>등록 명단 중 1회 이상 로그인</small>
        </Link>
        <Link className="admin-summary-card" href="/admin/users">
          <span>전체 등록 사용자</span><strong>{data.users.registered}명</strong>
          <small>사용자 명단에 등록된 전체 인원</small>
        </Link>
        {data.prayer.enabled && <Link className="admin-summary-card" href="/admin/prayer">
          <span className="activity-name">{name} 참여</span><strong>{data.prayer.participants}명</strong>
          <small>설정 기간 내 실제 체크 · 오늘 {data.prayer.todayCompleted}명 ({percent(data.prayer.todayRate)})</small>
        </Link>}
        <Link className="admin-summary-card" href="/admin/visits?status=requested">
          <span>심방 신청 대기</span><strong>{data.visits.requested}건</strong>
          <small>확인 후 유선으로 확정</small>
        </Link>
        <div className="admin-prayer-summary-pair">
          <Link className="admin-summary-card" href="/admin/prayer-requests?status=received">
            <span>미처리 기도요청</span><strong>{data.prayerRequests.received}건</strong>
            <small>기도중 {data.prayerRequests.praying}건</small>
          </Link>
          <Link className="admin-summary-card" href="/admin/prayer-requests?unreadComments=1">
            <span>댓글 알림</span><strong>{data.prayerRequests.unreadComments}건</strong>
            <small>신청자 미확인 댓글</small>
          </Link>
        </div>
      </section>

      <section className="card admin-hub-activity" aria-busy={loading}>
        <div className="section-heading">
          <h2>최근 활동</h2><p className="helper-text">최신순 · 한 페이지에 10개</p>
        </div>
        {loading && <p role="status">활동 목록을 불러오는 중입니다.</p>}
        {data.recentActivity.length === 0 ? (
          <p className="helper-text">아직 최근 활동이 없습니다.</p>
        ) : (
          <div className="admin-activity-list">
            {data.recentActivity.map((item) => (
              <Link
                key={item.kind + item.href + item.occurredAt}
                href={item.href}
                className="admin-activity-row"
              >
                <span>{item.label}</span>
                <small>{timeLabel(item.occurredAt)}</small>
              </Link>
            ))}
          </div>
        )}
        <nav className="admin-activity-pagination" aria-label="최근 활동 페이지">
          <button type="button" disabled={loading || data.activityPagination.page <= 1}
            onClick={() => onPageChange?.(data.activityPagination.page - 1)}>이전</button>
          <span aria-live="polite">{data.activityPagination.page} / {data.activityPagination.pages} 페이지 · 전체 {data.activityPagination.total}건</span>
          <button type="button" disabled={loading || data.activityPagination.page >= data.activityPagination.pages}
            onClick={() => onPageChange?.(data.activityPagination.page + 1)}>다음</button>
        </nav>
      </section>
    </div>
  );
}
