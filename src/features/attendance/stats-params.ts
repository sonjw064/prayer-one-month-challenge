import { z } from "zod";
import { DomainError } from "../../lib/http";
import { addDays } from "../challenge/date";
import { isDateKey } from "./policy";

export type StatsFilter = { from: string; to: string; village: string | null; samId: string | null };

export const MAX_RANGE_DAYS = 366;

const optionalText = z.string().trim().max(20);
const uuid = z.string().uuid();

/** Defaults to this month so far (first of the month to today). */
export function parseStatsParams(params: URLSearchParams, today: string): StatsFilter {
  const from = params.get("from") || `${today.slice(0, 7)}-01`;
  const to = params.get("to") || today;
  if (!isDateKey(from) || !isDateKey(to) || from > to) throw new DomainError("INVALID_RANGE", 400);
  if (to > addDays(from, MAX_RANGE_DAYS - 1)) throw new DomainError("RANGE_TOO_LONG", 400);

  const village = params.get("village");
  const samId = params.get("samId");
  if (village && !optionalText.safeParse(village).success) throw new DomainError("INVALID_INPUT", 400);
  if (samId && !uuid.safeParse(samId).success) throw new DomainError("INVALID_INPUT", 400);
  return { from, to, village: village?.trim() || null, samId: samId || null };
}
