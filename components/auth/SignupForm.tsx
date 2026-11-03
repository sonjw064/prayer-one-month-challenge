"use client";

import { FormEvent, useState } from "react";

function errorText(status: number, code: string | undefined): string {
  if (status === 429) return "신청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (code === "INVALID_PHONE") return "전화번호를 확인해 주세요. 숫자 9~11자리여야 합니다.";
  if (code === "SIGNUP_UNAVAILABLE") return "지금은 신청을 받을 수 없습니다. 운영 담당자에게 문의해 주세요.";
  if (code === "INVALID_INPUT") return "입력 내용을 확인해 주세요.";
  return "신청하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function SignupForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone, memo, website }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setDone(true);
        return;
      }
      setMessage(errorText(response.status, body.code));
    } catch {
      setMessage("연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="card auth-card" role="status">
        <h2>신청이 접수되었습니다</h2>
        <p>관리자가 확인한 뒤 승인하면 <strong>이름</strong>과 <strong>전화번호(초기 비밀번호)</strong>로 로그인할 수 있습니다.</p>
        <p className="helper-text">승인에는 시간이 걸릴 수 있습니다. 로그인이 되지 않으면 운영 담당자에게 문의해 주세요.</p>
      </section>
    );
  }

  return (
    <form className="card auth-card" onSubmit={submit}>
      <label>
        <span>이름</span>
        <input
          required
          maxLength={80}
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="이름을 입력하세요"
        />
      </label>
      <label>
        <span>전화번호</span>
        <input
          required
          type="tel"
          inputMode="tel"
          maxLength={30}
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="010-0000-0000"
        />
      </label>
      <label>
        <span>메모 (선택)</span>
        <input
          maxLength={200}
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="예: ○○ 샘 소개"
        />
      </label>
      {/* Bot trap: hidden from people and assistive technology, never filled in by them. */}
      <div className="signup-trap" aria-hidden="true">
        <label>
          웹사이트
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
        </label>
      </div>
      {message && <p className="error-text" role="alert">{message}</p>}
      <button className="primary-button" type="submit" disabled={busy}>
        {busy ? "접수 중…" : "가입 신청"}
      </button>
      <p className="helper-text">
        입력한 이름과 전화번호는 관리자의 승인 확인에만 사용하며, 처리가 끝나면 전화번호는 삭제됩니다.
      </p>
    </form>
  );
}
