import { z } from "zod";
import { DomainError } from "../../lib/http";
import { isRealDate } from "../calendar/month";
import { addDays } from "../challenge/date";

/** Pure rules shared by the server and the administrator screen. */
export const MAX_PAGES = 20;
/** A bulletin disappears 30 days after its date. */
export const RETENTION_DAYS = 30;
/** Bulletins may be uploaded a little ahead of their Sunday. */
export const MAX_DAYS_AHEAD = 60;
export const MAX_TITLE_LENGTH = 100;
export const DEFAULT_TITLE = "주일 주보";
/** One page image per request: well under Vercel's request size limit. */
export const MAX_PAGE_UPLOAD_BYTES = 3 * 1024 * 1024;
/** Largest PDF the administrator's browser is asked to read. */
export const MAX_SOURCE_PDF_BYTES = 200 * 1024 * 1024;

export type BulletinStatus = "draft" | "published" | "hidden";

export function retentionCutoff(today: string): string {
  return addDays(today, -RETENTION_DAYS);
}

/** Bulletins dated before the cutoff are hidden everywhere and deleted at the next cleanup. */
export function isExpired(date: string, today: string): boolean {
  return date < retentionCutoff(today);
}

/** The Sunday on or after `date`: the default bulletin date. */
export function nextSunday(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, (7 - weekday) % 7);
}

const createSchema = z.object({
  date: z.string().refine(isRealDate),
  title: z.string().trim().max(MAX_TITLE_LENGTH).nullish(),
  pageCount: z.number().int().min(1).max(MAX_PAGES),
});

export type BulletinDraftInput = { date: string; title: string; pageCount: number };

export function parseDraftInput(raw: unknown, today: string): BulletinDraftInput {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("INVALID_INPUT", 400);
  const { date, pageCount } = parsed.data;
  if (isExpired(date, today)) throw new DomainError("DATE_EXPIRED", 400);
  if (date > addDays(today, MAX_DAYS_AHEAD)) throw new DomainError("DATE_TOO_FAR", 400);
  const title = (parsed.data.title ?? "").replace(/\s+/gu, " ").trim() || DEFAULT_TITLE;
  return { date, title, pageCount };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertBulletinId(id: string): void {
  if (!UUID_RE.test(id)) throw new DomainError("BULLETIN_NOT_FOUND", 404);
}

/** Page numbers are 1-based; returns the number. */
export function parsePageNumber(value: string): number {
  if (!/^\d{1,2}$/.test(value)) throw new DomainError("PAGE_NOT_FOUND", 404);
  const page = Number(value);
  if (page < 1 || page > MAX_PAGES) throw new DomainError("PAGE_NOT_FOUND", 404);
  return page;
}

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function assertImageContentType(value: string | null): void {
  const type = (value ?? "").split(";")[0].trim().toLowerCase();
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)) {
    throw new DomainError("UNSUPPORTED_IMAGE_TYPE", 415);
  }
}
