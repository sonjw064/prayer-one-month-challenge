import { z } from "zod";
import { DomainError } from "../../lib/http";
import { canonicalizeRosterName, normalizeOptionalPhone } from "../roster/normalize";
import type { SignupDecision, SignupRequestInput } from "./types";

export const MAX_PENDING_REQUESTS = 200;
/** Key used with the shared failure limiter to cap sign-up attempts per IP. */
export const SIGNUP_RATE_KEY = "__signup__";

const requestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(1).max(30),
  memo: z.string().trim().max(200).nullish(),
  /** Hidden bot-trap field: real people never fill it in. */
  website: z.string().max(200).nullish(),
});

export function parseSignupInput(raw: unknown): SignupRequestInput {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("INVALID_INPUT", 400);

  const name = parsed.data.name.replace(/\s+/g, " ").normalize("NFC");
  let canonicalName: string;
  try {
    canonicalName = canonicalizeRosterName(name);
  } catch {
    throw new DomainError("INVALID_INPUT", 400);
  }

  let phone: string | null;
  try {
    phone = normalizeOptionalPhone(parsed.data.phone);
  } catch {
    throw new DomainError("INVALID_PHONE", 400);
  }
  if (!phone) throw new DomainError("INVALID_PHONE", 400);

  return {
    name,
    canonicalName,
    phone,
    memo: (parsed.data.memo ?? "").replace(/\s+/g, " "),
    honeypot: Boolean(parsed.data.website?.trim()),
  };
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim().normalize("NFC") ?? "";
  return normalized || null;
}

const decisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  position: z.string().trim().max(80).nullish(),
  village: z.string().trim().max(80).nullish(),
  sam: z.string().trim().max(80).nullish(),
});

export function parseSignupDecision(raw: unknown): SignupDecision {
  const parsed = decisionSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("INVALID_INPUT", 400);
  if (parsed.data.action === "reject") return { action: "reject" };
  return {
    action: "approve",
    approval: {
      position: optionalText(parsed.data.position),
      village: optionalText(parsed.data.village),
      sam: optionalText(parsed.data.sam),
    },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertRequestId(id: string): void {
  if (!UUID_RE.test(id)) throw new DomainError("SIGNUP_NOT_FOUND", 404);
}
