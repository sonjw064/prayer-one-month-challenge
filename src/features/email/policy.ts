import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"];
export const EMAIL_CALLBACK = "/api/admin/google-calendar/callback";
export const EMAIL_STATE_COOKIE = "submission_email_oauth_state";
export type NotificationKind = "pastoral" | "visit" | "prayer" | "test";
export type NotificationIdentity = { samLabel?: string | null; requesterName?: string | null; visitDate?: string | null; visitTime?: string | null };
export type DeliveryStatus = "sent" | "retry" | "failed" | "unknown";

export function normalizeRecipient(input: unknown): string {
  if (typeof input !== "string" || /[\r\n\u0000-\u001f\u007f]/u.test(input)) throw new Error("INVALID_EMAIL_RECIPIENT");
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(email)) throw new Error("INVALID_EMAIL_RECIPIENT");
  return email;
}

function plainLabel(value: string | null | undefined, max: number): string {
  return (value ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, max);
}

export function safeVisitTime(value: string | null | undefined): string | null {
  if (!value || value.length > 30) return null;
  const text = value.trim();
  let h: number; let m: number;
  const clock = /^(\d{1,2}):(\d{2})(?::00)?$/u.exec(text);
  const korean = /^(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?$/u.exec(text);
  if (clock) { h = Number(clock[1]); m = Number(clock[2]); if (h > 23 || m > 59) return null; }
  else if (korean) { h = Number(korean[2]); m = Number(korean[3] ?? 0); if (h < 1 || h > 12 || m > 59) return null; h = h % 12 + (korean[1] === "오후" ? 12 : 0); }
  else return null;
  return `${h >= 12 ? "오후" : "오전"}${h % 12 || 12}시${m ? `${m}분` : ""}`;
}

export function formatNotification(kind: NotificationKind, input: NotificationIdentity): {subject: string; text: string} {
  if (kind === "test") return {subject:"[3D] 이메일 알림 연결 확인",text:"3D 이메일 알림 연결 확인 메일입니다."};
  const name = plainLabel(input.requesterName, 80) || "신청자";
  const sam = plainLabel(input.samLabel, 100);
  const last = name.codePointAt(name.length - 1) ?? 0;
  const particle = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0 ? "이" : "가";
  const person = `${sam ? `${sam.endsWith("샘") ? sam : `${sam}샘`} ` : ""}${name}${particle}`;
  if (kind === "pastoral") return {subject:"[3D] 목양지 접수",text:`${person} 목양지를 제출하였습니다.`};
  if (kind === "prayer") return {subject:"[3D] 기도요청 접수",text:`${person} 기도요청을 제출했습니다.`};
  if (kind !== "visit" || !/^\d{4}-\d{2}-\d{2}$/u.test(input.visitDate ?? "")) throw new Error("INVALID_VISIT_DATE");
  const date = new Date(`${input.visitDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== input.visitDate) throw new Error("INVALID_VISIT_DATE");
  const time = safeVisitTime(input.visitTime);
  return {subject:"[3D] 심방신청 접수",text:`${person} ${date.getUTCMonth()+1}월 ${date.getUTCDate()}일${time ? ` ${time}` : ""}에 심방을 신청했습니다.`};
}

export function encodeMessage(input: {email:string; subject:string; text:string; id:string; date:Date}): string {
  const email = normalizeRecipient(input.email);
  if (!/^[a-f0-9-]{36}$/iu.test(input.id) || /[\r\n]/u.test(input.subject) || input.subject.length > 200 || input.text.length > 1000 || !Number.isFinite(input.date.getTime())) throw new Error("INVALID_EMAIL_MESSAGE");
  const body = Buffer.from(input.text,"utf8").toString("base64").match(/.{1,76}/gu)?.join("\r\n") ?? "";
  return Buffer.from([
    `From: ${email}`, `To: ${email}`, `Date: ${input.date.toUTCString()}`,
    `Message-ID: <${input.id}@56love.notifications.invalid>`,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject,"utf8").toString("base64")}?=`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", body, "",
  ].join("\r\n")).toString("base64url");
}

function purposeKey(master: string, purpose: "token" | "pkce"): Buffer {
  const decoded = Buffer.from(master, "base64");
  if (decoded.length !== 32 || decoded.toString("base64").replace(/=+$/u,"") !== master.replace(/=+$/u,"")) throw new Error("EMAIL_ENCRYPTION_NOT_CONFIGURED");
  return Buffer.from(hkdfSync("sha256",decoded,"56love-submission-email-v1",purpose,32));
}
export function seal(value: string, master: string, purpose: "token" | "pkce"): string {
  const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",purposeKey(master,purpose),iv);
  cipher.setAAD(Buffer.from(`56love-email:${purpose}`));
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function unseal(value: string, master: string, purpose: "token" | "pkce"): string {
  const parts=value.split(".");
  if(parts.length!==4 || parts[0]!=="v1" || parts.slice(1).some(p=>!/^[A-Za-z0-9_-]+$/u.test(p))) throw new Error("EMAIL_CREDENTIAL_INVALID");
  const iv=Buffer.from(parts[1],"base64url"),tag=Buffer.from(parts[2],"base64url");
  if(iv.length!==12 || tag.length!==16)throw new Error("EMAIL_CREDENTIAL_INVALID");
  const decipher=createDecipheriv("aes-256-gcm",purposeKey(master,purpose),iv);decipher.setAAD(Buffer.from(`56love-email:${purpose}`));decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[3],"base64url")),decipher.final()]).toString("utf8");
}
export function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function secretMatches(value: string, hash: string | null): boolean {
  if (!hash || !/^[a-f0-9]{64}$/u.test(hash) || value.length < 32 || value.length > 200) return false;
  return timingSafeEqual(Buffer.from(digest(value),"hex"),Buffer.from(hash,"hex"));
}
export function runtimeAllowed(env: Record<string,string|undefined>, origin: string, configured: string): boolean {
  if(env.VERCEL_ENV!=="production" || env.NODE_ENV!=="production")return false;
  try {const a=new URL(origin),b=new URL(configured);return a.protocol==="https:" && !b.username && !b.password && b.origin===configured && a.origin===b.origin;} catch{return false;}
}
export function validateGoogleIdentity(claims: {email?: string; email_verified?: boolean; nonce?: string}, recipient:string, nonce:string): void {
  if(claims.email_verified!==true || claims.nonce!==nonce || normalizeRecipient(claims.email)!==normalizeRecipient(recipient))throw new Error("GMAIL_ACCOUNT_MISMATCH");
}
export function classifySendFailure(status:number, reason?:string): Exclude<DeliveryStatus,"sent"> {
  if(status===429 || (status===403 && ["rateLimitExceeded","userRateLimitExceeded","dailyLimitExceeded"].includes(reason ?? "")))return "retry";
  if(status===0 || status>=500 || (status>=200 && status<300))return "unknown";
  return "failed";
}
