import { NextResponse } from "next/server";
import { todayInSeoul } from "../../../src/features/challenge/date";
import { listPublicBulletins } from "../../../src/features/bulletin/service";

/** Public: no login needed. Only published bulletins inside the 30-day retention period. */
export async function GET() {
  const bulletins = await listPublicBulletins(todayInSeoul());
  return NextResponse.json(
    { bulletins },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" } },
  );
}
