import { describe, expect, it } from "vitest";
import { formatBulletinDate, pageUrl, pdfFileName } from "../../src/features/bulletin/format";
import {
  DEFAULT_TITLE,
  MAX_PAGES,
  RETENTION_DAYS,
  assertBulletinId,
  assertImageContentType,
  isExpired,
  nextSunday,
  parseDraftInput,
  parsePageNumber,
  retentionCutoff,
} from "../../src/features/bulletin/policy";
import { DomainError } from "../../src/lib/http";

const TODAY = "2026-11-30";

describe("retention", () => {
  it("keeps bulletins for 30 days after their date", () => {
    expect(RETENTION_DAYS).toBe(30);
    expect(retentionCutoff(TODAY)).toBe("2026-10-31");
    expect(isExpired("2026-10-31", TODAY)).toBe(false); // exactly 30 days old: still shown
    expect(isExpired("2026-10-30", TODAY)).toBe(true);
    expect(isExpired("2026-11-29", TODAY)).toBe(false);
    expect(isExpired("2026-12-06", TODAY)).toBe(false); // upcoming Sunday
  });

  it("crosses month and year boundaries correctly", () => {
    expect(retentionCutoff("2027-01-10")).toBe("2026-12-11");
    expect(retentionCutoff("2026-03-01")).toBe("2026-01-30");
  });
});

describe("default date", () => {
  it("is the Sunday on or after the given day", () => {
    expect(nextSunday("2026-11-22")).toBe("2026-11-22"); // Sunday itself
    expect(nextSunday("2026-11-19")).toBe("2026-11-22"); // Thursday
    expect(nextSunday("2026-11-23")).toBe("2026-11-29"); // Monday
    expect(nextSunday("2026-12-30")).toBe("2027-01-03"); // across the year end
  });
});

describe("draft input", () => {
  const bad = (raw: unknown, code = "INVALID_INPUT") =>
    expect(() => parseDraftInput(raw, TODAY)).toThrowError(new DomainError(code, 400));

  it("accepts a valid draft and defaults the title", () => {
    expect(parseDraftInput({ date: "2026-11-29", pageCount: 8 }, TODAY)).toEqual({ date: "2026-11-29", title: DEFAULT_TITLE, pageCount: 8 });
    expect(parseDraftInput({ date: "2026-11-29", title: "  추수   감사 주일 ", pageCount: 1 }, TODAY).title).toBe("추수 감사 주일");
    expect(parseDraftInput({ date: "2026-11-29", title: "   ", pageCount: 2 }, TODAY).title).toBe(DEFAULT_TITLE);
  });

  it("limits pages to 1..20", () => {
    expect(parseDraftInput({ date: "2026-11-29", pageCount: MAX_PAGES }, TODAY).pageCount).toBe(20);
    bad({ date: "2026-11-29", pageCount: 0 });
    bad({ date: "2026-11-29", pageCount: 21 });
    bad({ date: "2026-11-29", pageCount: 2.5 });
    bad({ date: "2026-11-29", pageCount: "8" });
  });

  it("rejects bad dates, dates already past retention, and far-future dates", () => {
    bad(null);
    bad({ pageCount: 3 });
    bad({ date: "2026-02-30", pageCount: 3 });
    bad({ date: "2026-10-30", pageCount: 3 }, "DATE_EXPIRED");
    bad({ date: "2027-03-01", pageCount: 3 }, "DATE_TOO_FAR");
    expect(parseDraftInput({ date: "2026-10-31", pageCount: 3 }, TODAY).date).toBe("2026-10-31");
    expect(parseDraftInput({ date: "2027-01-29", pageCount: 3 }, TODAY).date).toBe("2027-01-29"); // 60 days ahead
  });

  it("rejects an overlong title", () => {
    bad({ date: "2026-11-29", title: "가".repeat(101), pageCount: 3 });
  });
});

describe("ids, pages and content types", () => {
  it("treats malformed ids and page numbers as not found", () => {
    expect(() => assertBulletinId("nope")).toThrowError(new DomainError("BULLETIN_NOT_FOUND", 404));
    expect(() => assertBulletinId("00000000-0000-4000-8000-000000000001")).not.toThrow();
    expect(parsePageNumber("1")).toBe(1);
    expect(parsePageNumber("20")).toBe(20);
    for (const value of ["0", "21", "-1", "1.5", "abc", "001", ""]) {
      expect(() => parsePageNumber(value), value).toThrowError(new DomainError("PAGE_NOT_FOUND", 404));
    }
  });

  it("accepts only JPEG, PNG and WebP uploads", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "IMAGE/JPEG; charset=binary"]) {
      expect(() => assertImageContentType(type), type).not.toThrow();
    }
    for (const type of [null, "", "image/gif", "application/pdf", "text/html", "image/svg+xml"]) {
      expect(() => assertImageContentType(type), String(type)).toThrowError(new DomainError("UNSUPPORTED_IMAGE_TYPE", 415));
    }
  });
});

describe("display helpers", () => {
  it("formats dates, calling Sunday 주일", () => {
    expect(formatBulletinDate("2026-11-22")).toBe("2026. 11. 22 (주일)");
    expect(formatBulletinDate("2026-11-25")).toBe("2026. 11. 25 (수)");
    expect(pdfFileName("2026-11-22")).toBe("주보-2026-11-22.pdf");
    expect(pageUrl("abc", 3, "v1")).toBe("/api/bulletins/abc/pages/3?v=v1");
    expect(pageUrl("abc", 3, "v1", "thumb")).toBe("/api/bulletins/abc/pages/3?v=v1&size=thumb");
  });
});
