import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "../../../components/auth/SignupForm";

export const metadata: Metadata = {
  title: "가입 신청",
  description: "삼덕청년부 3D 앱 가입을 신청합니다. 관리자가 확인한 뒤 승인하면 로그인할 수 있습니다.",
};

export default function SignupPage() {
  return (
    <>
      <section className="public-hero" aria-labelledby="signup-title">
        <p className="public-eyebrow">삼덕청년부를 위한 앱</p>
        <h1 id="signup-title">가입 신청</h1>
        <p className="public-lead">이름과 전화번호를 보내 주시면 관리자가 확인한 뒤 승인합니다.</p>
      </section>
      <SignupForm />
      <p className="public-caption">
        이미 등록되어 있다면 <Link href="/login" prefetch={false}>로그인</Link>하세요.
        입력한 정보의 사용 방법은 <Link href="/privacy">개인정보처리방침</Link>에서 확인할 수 있습니다.
      </p>
    </>
  );
}
