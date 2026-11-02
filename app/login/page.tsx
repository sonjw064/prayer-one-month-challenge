import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "../../components/auth/LoginForm";
import { getCurrentSessionUser } from "../../src/features/auth/http-session";

export default async function LoginPage() {
  if (await getCurrentSessionUser()) redirect("/");
  return (
    <main className="shell auth-shell">
      <header className="hero-copy">
        <p className="eyebrow">3D</p>
        <h1>삼덕청년부</h1>
        <p className="community-verse">성령이 하나 되게 하신 것을 힘써 지키라(엡 4:3)</p>
      </header>
      <LoginForm />
      <nav aria-label="앱 안내" style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", marginTop: 24 }}>
        <Link href="/about">앱 소개</Link>
        <Link href="/privacy">개인정보처리방침</Link>
      </nav>
    </main>
  );
}
