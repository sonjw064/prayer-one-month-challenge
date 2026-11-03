import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../../src/features/auth/http-session";
import {
  assertEventId,
  assertSameOrigin,
  parseCalendarEventInput,
} from "../../../../../src/features/calendar/input";
import { describeEventForPush } from "../../../../../src/features/calendar/month";
import {
  deleteCalendarEvent,
  updateCalendarEvent,
} from "../../../../../src/features/calendar/service";
import type { PushStatus } from "../../../../../src/features/calendar/types";
import { sendCalendarEventPush } from "../../../../../src/features/push/service";
import { DomainError } from "../../../../../src/lib/http";

function errorResponse(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json({ code: error.code }, { status: error.status });
  }
  throw error;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireAdmin(await getCurrentSessionUser());
    assertSameOrigin(request);
    const { id } = await context.params;
    assertEventId(id);
    const input = parseCalendarEventInput(await request.json().catch(() => null));
    const event = await updateCalendarEvent(id, input);

    let pushStatus: PushStatus = "skipped";
    if (input.notify) {
      try {
        await sendCalendarEventPush({
          id: event.id,
          title: event.title,
          body: describeEventForPush(event),
          startDate: event.startDate,
        });
        pushStatus = "sent";
      } catch {
        // The edit is saved even if push delivery is unavailable.
        pushStatus = "failed";
      }
    }
    return NextResponse.json({ status: "ok", event, pushStatus });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireAdmin(await getCurrentSessionUser());
    assertSameOrigin(request);
    const { id } = await context.params;
    assertEventId(id);
    await deleteCalendarEvent(id);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return errorResponse(error);
  }
}
