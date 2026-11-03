import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "../../../src/features/calendar/input";
import { isLoginBlocked, recordLoginFailure } from "../../../src/features/auth/rate-limit";
import {
  SIGNUP_RATE_KEY,
  parseSignupInput,
} from "../../../src/features/signup/input";
import { submitSignupRequest } from "../../../src/features/signup/service";
import { DomainError } from "../../../src/lib/http";

function requestIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Public endpoint (no login). Every attempt counts toward a per-IP limit, and the
 * response never reveals whether the person is already pending or on the roster.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const ip = requestIp(request);
    if (await isLoginBlocked(SIGNUP_RATE_KEY, ip)) {
      return NextResponse.json({ code: "TOO_MANY_ATTEMPTS" }, { status: 429 });
    }
    await recordLoginFailure(SIGNUP_RATE_KEY, ip);

    const input = parseSignupInput(await request.json().catch(() => null));
    // Bots that fill the hidden field get the same success response and nothing is stored.
    if (!input.honeypot) await submitSignupRequest(input);
    return NextResponse.json({ status: "ok" }, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ code: error.code }, { status: error.status });
    }
    throw error;
  }
}
