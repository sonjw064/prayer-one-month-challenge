import { describe, expect, it } from "vitest";
import {
  assertEventId,
  assertSameOrigin,
  parseCalendarEventInput,
} from "../../src/features/calendar/input";
import { DomainError } from "../../src/lib/http";

const base = { title: "청년부 예배", startDate: "2026-11-09" };

function invalid(raw: unknown) {
  expect(() => parseCalendarEventInput(raw)).toThrowError(new DomainError("INVALID_INPUT", 400));
}

describe("calendar event input", () => {
  it("accepts a minimal all-day event and fills defaults", () => {
    expect(parseCalendarEventInput(base)).toEqual({
      title: "청년부 예배",
      description: "",
      location: "",
      startDate: "2026-11-09",
      endDate: "2026-11-09",
      startTime: null,
      endTime: null,
      isImportant: false,
      notify: false,
    });
  });

  it("reads the important flag only when it is exactly true", () => {
    expect(parseCalendarEventInput({ ...base, isImportant: true }).isImportant).toBe(true);
    expect(parseCalendarEventInput({ ...base, isImportant: false }).isImportant).toBe(false);
    expect(parseCalendarEventInput({ ...base, isImportant: null }).isImportant).toBe(false);
    invalid({ ...base, isImportant: "yes" });
  });

  it("treats blank form fields as not provided", () => {
    const parsed = parseCalendarEventInput({ ...base, endDate: "", startTime: "", endTime: "" });
    expect(parsed.endDate).toBe("2026-11-09");
    expect(parsed.startTime).toBeNull();
    expect(parsed.endTime).toBeNull();
  });

  it("accepts times, multi-day ranges and notify", () => {
    const parsed = parseCalendarEventInput({
      ...base,
      endDate: "2026-11-11",
      startTime: "19:00",
      endTime: "08:00",
      location: "본당",
      description: "줄1\r\n줄2",
      notify: true,
    });
    expect(parsed.endDate).toBe("2026-11-11");
    expect(parsed.description).toBe("줄1\n줄2");
    expect(parsed.notify).toBe(true);
  });

  it("rejects bad titles and dates", () => {
    invalid(null);
    invalid({ ...base, title: "   " });
    invalid({ ...base, title: "가".repeat(101) });
    invalid({ ...base, startDate: "2026-02-30" });
    invalid({ ...base, startDate: "11/09/2026" });
  });

  it("rejects end before start, and end time without start time", () => {
    invalid({ ...base, endDate: "2026-11-08" });
    invalid({ ...base, endTime: "20:00" });
    invalid({ ...base, startTime: "20:00", endTime: "19:00" });
    invalid({ ...base, startTime: "20:00", endTime: "20:00" });
    invalid({ ...base, startTime: "24:00" });
  });

  it("rejects overlong location and description", () => {
    invalid({ ...base, location: "가".repeat(101) });
    invalid({ ...base, description: "가".repeat(2001) });
  });

  it("rejects cross-origin requests", () => {
    const request = (origin: string | null) =>
      new Request("https://app.example/api/admin/calendar", origin ? { headers: { origin } } : undefined);
    expect(() => assertSameOrigin(request("https://evil.example"))).toThrowError(
      new DomainError("FORBIDDEN", 403),
    );
    expect(() => assertSameOrigin(request("https://app.example"))).not.toThrow();
    expect(() => assertSameOrigin(request(null))).not.toThrow();
  });

  it("treats malformed ids as not found", () => {
    expect(() => assertEventId("not-a-uuid")).toThrowError(new DomainError("EVENT_NOT_FOUND", 404));
    expect(() => assertEventId("00000000-0000-4000-8000-000000000111")).not.toThrow();
  });
});
