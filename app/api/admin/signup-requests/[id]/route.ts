import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../src/features/auth/http-session";
import { assertSameOrigin } from "../../../../../src/features/calendar/input";
import {
  assertRequestId,
  parseSignupDecision,
} from "../../../../../src/features/signup/input";
import {
  approveSignupRequest,
  rejectSignupRequest,
} from "../../../../../src/features/signup/service";
import { DomainError } from "../../../../../src/lib/http";

function errorResponse(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json({ code: error.code }, { status: error.status });
  }
  throw error;
}

/** Approve or reject one pending request: body `{ action: "approve" | "reject", ... }`. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentSessionUser();
    requireAdmin(user);
    assertSameOrigin(request);
    const { id } = await context.params;
    assertRequestId(id);
    const decision = parseSignupDecision(await request.json().catch(() => null));

    if (decision.action === "approve") {
      await approveSignupRequest(id, user.id, decision.approval);
    } else {
      await rejectSignupRequest(id, user.id);
    }
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return errorResponse(error);
  }
}
