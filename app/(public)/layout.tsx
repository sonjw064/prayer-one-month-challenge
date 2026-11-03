import Image from "next/image";
import Link from "next/link";
import "./public.css";

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="public-site">
      <a className="public-skip" href="#public-main">본문으로 바로가기</a>
      <header className="public-header">
        <Link className="public-brand" href="/about">
          <Image src="/icons/3duks-192.png" alt="" width={48} height={48} unoptimized />
          <span><strong>3D</strong><small>삼덕청년부</small></span>
        </Link>
        <nav className="public-nav" aria-label="공개 안내 메뉴">
          <Link href="/about">앱 소개</Link>
          <Link href="/privacy">개인정보처리방침</Link>
          <Link href="/login" prefetch={false}>로그인</Link>
        </nav>
      </header>
      <main id="public-main" className="public-main" tabIndex={-1}>{children}</main>
      <footer className="public-footer">
        <p><strong>3D</strong> · 삼덕청년부</p>
        <p><Link href="/privacy">개인정보처리방침</Link> · <a href="mailto:ditto0310@gmail.com">운영 담당자에게 문의</a></p>
      </footer>
    </div>
  );
}
