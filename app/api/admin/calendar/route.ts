import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../src/features/admin/service";
import { getCurrentSessionUser } from "../../../../src/features/auth/http-session";
import {
  assertSameOrigin,
  parseCalendarEventInput,
} from "../../../../src/features/calendar/input";
import { describeEventForPush, pushTitleForEvent } from "../../../../src/features/calendar/month";
import {
  createCalendarEvent,
  listCalendarEventsForAdmin,
} from "../../../../src/features/calendar/service";
import type { PushStatus } from "../../../../src/features/calendar/types";
import { sendCalendarEventPush } from "../../../../src/features/push/service";
import { DomainError } from "../../../../src/lib/http";

function errorResponse(error: unknown) {
  if (error instanceof DomainError) {
    return NextResponse.json({ code: error.code }, { status: error.status });
  }
  throw error;
}

export async function GET() {
  try {
    requireAdmin(await getCurrentSessionUser());
    return NextResponse.json({ events: await listCalendarEventsForAdmin() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentSessionUser();
    requireAdmin(user);
    assertSameOrigin(request);
    const input = parseCalendarEventInput(await request.json().catch(() => null));
    const event = await createCalendarEvent(user.id, input);

    let pushStatus: PushStatus = "skipped";
    if (input.notify) {
      try {
        await sendCalendarEventPush({
          id: event.id,
          title: pushTitleForEvent(event),
          body: describeEventForPush(event),
          startDate: event.startDate,
        });
        pushStatus = "sent";
      } catch {
        // The event is saved even if push delivery is unavailable.
        pushStatus = "failed";
      }
    }
    return NextResponse.json({ status: "ok", event, pushStatus }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
