import { describe, expect, it } from "vitest";
import {
  assertRequestId,
  parseSignupDecision,
  parseSignupInput,
} from "../../src/features/signup/input";
import { DomainError } from "../../src/lib/http";

const base = { name: "홍길동", phone: "010-1234-5678" };

function invalid(raw: unknown, code = "INVALID_INPUT") {
  expect(() => parseSignupInput(raw)).toThrowError(new DomainError(code, 400));
}

describe("sign-up request input", () => {
  it("normalizes name, phone and memo", () => {
    expect(parseSignupInput({ ...base, name: "  홍   길동 ", memo: " ○○  샘  소개 " })).toEqual({
      name: "홍 길동",
      canonicalName: "홍 길동",
      phone: "01012345678",
      memo: "○○ 샘 소개",
      honeypot: false,
    });
  });

  it("memo is optional", () => {
    expect(parseSignupInput(base).memo).toBe("");
    expect(parseSignupInput({ ...base, memo: null }).memo).toBe("");
  });

  it("detects the bot-trap field", () => {
    expect(parseSignupInput({ ...base, website: "http://spam.example" }).honeypot).toBe(true);
    expect(parseSignupInput({ ...base, website: "" }).honeypot).toBe(false);
    expect(parseSignupInput({ ...base, website: "   " }).honeypot).toBe(false);
  });

  it("rejects missing or overlong fields", () => {
    invalid(null);
    invalid({ phone: base.phone });
    invalid({ ...base, name: "   " });
    invalid({ ...base, name: "가".repeat(81) });
    invalid({ ...base, memo: "가".repeat(201) });
    invalid({ ...base, phone: "" });
  });

  it("rejects phone numbers that are not 9-11 digits", () => {
    invalid({ ...base, phone: "12345" }, "INVALID_PHONE");
    invalid({ ...base, phone: "010-1234-56789-0" }, "INVALID_PHONE");
    invalid({ ...base, phone: "전화번호" }, "INVALID_PHONE");
    expect(parseSignupInput({ ...base, phone: "02-123-4567" }).phone).toBe("021234567");
  });
});

describe("sign-up decision input", () => {
  it("parses reject without extra fields", () => {
    expect(parseSignupDecision({ action: "reject", sam: "x" })).toEqual({ action: "reject" });
  });

  it("parses approve and turns blank optional fields into null", () => {
    expect(
      parseSignupDecision({ action: "approve", position: " 청년 ", village: "", sam: null }),
    ).toEqual({ action: "approve", approval: { position: "청년", village: null, sam: null } });
    expect(parseSignupDecision({ action: "approve" })).toEqual({
      action: "approve",
      approval: { position: null, village: null, sam: null },
    });
  });

  it("rejects unknown actions and overlong values", () => {
    const bad = (raw: unknown) =>
      expect(() => parseSignupDecision(raw)).toThrowError(new DomainError("INVALID_INPUT", 400));
    bad(null);
    bad({ action: "delete" });
    bad({ action: "approve", sam: "가".repeat(81) });
  });

  it("treats malformed request ids as not found", () => {
    expect(() => assertRequestId("nope")).toThrowError(new DomainError("SIGNUP_NOT_FOUND", 404));
    expect(() => assertRequestId("00000000-0000-4000-8000-000000000111")).not.toThrow();
  });
});
