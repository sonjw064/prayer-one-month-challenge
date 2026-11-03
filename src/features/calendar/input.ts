import { z } from "zod";
import { DomainError } from "../../lib/http";
import { isRealDate } from "./month";
import type { CalendarEventInput } from "./types";

const dateKey = z.string().refine(isRealDate);
const timeKey = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const schema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).nullish(),
  location: z.string().trim().max(100).nullish(),
  startDate: dateKey,
  endDate: dateKey.nullish(),
  startTime: timeKey.nullish(),
  endTime: timeKey.nullish(),
  notify: z.boolean().nullish(),
});

/** Treat empty strings from form fields as "not provided". */
function blankToNull(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const copy: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  for (const key of ["endDate", "startTime", "endTime"]) {
    if (copy[key] === "") copy[key] = null;
  }
  return copy;
}

export function parseCalendarEventInput(raw: unknown): CalendarEventInput {
  const parsed = schema.safeParse(blankToNull(raw));
  if (!parsed.success) throw new DomainError("INVALID_INPUT", 400);

  const data = parsed.data;
  const startDate = data.startDate;
  const endDate = data.endDate ?? startDate;
  const startTime = data.startTime ?? null;
  const endTime = data.endTime ?? null;

  if (endDate < startDate) throw new DomainError("INVALID_INPUT", 400);
  if (endTime && !startTime) throw new DomainError("INVALID_INPUT", 400);
  if (startTime && endTime && endDate === startDate && endTime <= startTime) {
    throw new DomainError("INVALID_INPUT", 400);
  }

  return {
    title: data.title,
    description: (data.description ?? "").replace(/\r\n?/g, "\n"),
    location: data.location ?? "",
    startDate,
    endDate,
    startTime,
    endTime,
    notify: data.notify === true,
  };
}

/** Reject cross-origin browser requests for mutating admin routes. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new DomainError("FORBIDDEN", 403);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertEventId(id: string): void {
  if (!UUID_RE.test(id)) throw new DomainError("EVENT_NOT_FOUND", 404);
}
