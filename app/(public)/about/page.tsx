import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "앱 소개",
  description: "삼덕청년부의 기도, 심방, 소통을 돕는 3D 앱과 Google Calendar 연동 안내입니다.",
  alternates: { canonical: "https://prayer-one-month-challenge.vercel.app/about" },
};

const features = [
  ["01", "공지", "공동체의 안내와 소식을 확인하고, 선택한 기기에서 새 공지 알림을 받을 수 있습니다."],
  ["02", "기도운동", "정해진 도전 기간에 기도 완료를 체크하고 자신의 달성률을 확인합니다."],
  ["03", "심방신청", "신청 가능한 날짜를 확인하고 개인 또는 샘 심방을 신청합니다."],
  ["04", "기도요청", "함께 기도할 내용을 운영 담당자에게 전달합니다."],
  ["05", "커뮤니티", "공동체 회원끼리 게시글, 사진과 파일, 댓글을 나눕니다."],
  ["06", "목양지", "권한이 부여된 리더가 목양지를 제출하고 관리자가 확인합니다."],
] as const;

export default function AboutPage() {
  return (
    <>
      <section className="public-hero" aria-labelledby="about-title">
        <p className="public-eyebrow">삼덕청년부를 위한 앱</p>
        <h1 id="about-title">함께 기도하고,<br />서로를 돌보는 <span>3D</span></h1>
        <p className="public-lead">기도의 일상을 기록하고, 만남을 준비하고, 공동체의 소식을 나눕니다.</p>
        <div className="public-actions">
          <Link className="public-button" href="/login" prefetch={false}>3D 시작하기</Link>
          <Link className="public-text-link" href="/privacy">개인정보처리방침 읽기 →</Link>
        </div>
        <p className="public-caption">앱 소개와 개인정보처리방침은 누구나 볼 수 있습니다. 공동체 기능은 등록된 회원만 이용할 수 있습니다.</p>
      </section>
      <section className="public-section" aria-labelledby="features-title">
        <p className="public-eyebrow">공동체의 일상을 한곳에서</p>
        <h2 id="features-title">3D에서 할 수 있는 일</h2>
        <div className="public-feature-grid">
          {features.map(([number, title, text]) => (
            <article className="public-feature" key={title}>
              <span className="public-number" aria-hidden="true">{number}</span>
              <h3>{title}</h3><p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="public-callout" aria-labelledby="calendar-title">
        <p className="public-eyebrow">Google Calendar 연동</p>
        <h2 id="calendar-title">심방 일정이 겹치지 않도록</h2>
        <p>관리자가 운영용 Google 계정을 직접 연결하고 캘린더를 선택합니다. 앱은 기존 일정의 시작·종료 시각과 취소 상태를 읽어 신청 가능 날짜를 계산하고, 심방 신청·변경·취소에 따라 연결된 캘린더의 심방 일정을 생성·수정·삭제합니다.</p>
        <p><strong>일반 회원의 Google 계정 연결은 필요하지 않습니다.</strong> 회원 로그인은 공동체에 등록된 이름과 비밀번호를 사용하며, Google 비밀번호를 앱에서 입력받거나 저장하지 않습니다.</p>
        <p>운영 캘린더에는 신청자·리더, 참석자, 장소와 희망 시간이 기록됩니다. 캘린더 공유 대상은 관리자가 확인해야 하며, 일반 회원에게는 기존 Google 일정의 제목·본문 대신 신청 가능 여부를 안내합니다.</p>
        <Link className="public-text-link" href="/privacy#google-calendar">Google 데이터 이용·보관·연결 해제 안내 →</Link>
      </section>
      <section className="public-section public-contact" aria-labelledby="contact-title">
        <h2 id="contact-title">이용 중 도움이 필요하신가요?</h2>
        <p>로그인, 회원 정보 또는 개인정보 관련 문의는 삼덕청년부 운영 담당자에게 보내 주세요.</p>
        <a className="public-text-link" href="mailto:ditto0310@gmail.com">ditto0310@gmail.com</a>
      </section>
    </>
  );
}
