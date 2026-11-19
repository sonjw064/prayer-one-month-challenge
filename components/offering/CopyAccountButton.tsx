"use client";

import { useEffect, useRef, useState } from "react";
import { copyText } from "../../src/features/offering/copy";

type State = "idle" | "copied" | "failed";

export function CopyAccountButton({ number, label }: { number: string; label: string }) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    const ok = await copyText(number);
    setState(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), ok ? 2500 : 8000);
  }

  return (
    <>
      <button className="off-copy" type="button" onClick={() => void copy()} aria-label={`${label} 계좌번호 복사`}>
        <span aria-hidden="true">{state === "copied" ? "✓" : "⧉"}</span>{" "}
        {state === "copied" ? "복사했습니다" : "계좌번호 복사"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? `${label} 계좌번호를 복사했습니다.` : ""}
      </span>
      {state === "failed" && (
        <p className="error-text" role="alert">
          복사하지 못했습니다. 위의 계좌번호를 길게 눌러 직접 복사해 주세요.
        </p>
      )}
    </>
  );
}
