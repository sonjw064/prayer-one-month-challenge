import { and, inArray, or, sql, isNotNull } from "drizzle-orm";
import { getDb } from "../../db/client";
import { memberRoster, sams, users } from "../../db/schema";
import { membersOfSam } from "../attendance/policy";
import { directory } from "../pastoral/access";
import { villageKey } from "../pastoral/policy";
import type {
  RegistrationAction,
  RegistrationList,
  RegistrationResult,
} from "./registrations-types";

/** Every registered sam and village head (including archived and leader-less ones) with what is linked to it. */
export async function listRegistrations(): Promise<RegistrationList> {
  const db = getDb();
  const [data, reportRows, sessionRows] = await Promise.all([
    directory(),
    db.execute(sql`select sam_id as "samId", count(*)::int as n from prayer_app.pastoral_reports group by sam_id`),
    db.execute(sql`select sam_id as "samId", count(*)::int as n from prayer_app.attendance_sessions where sam_id is not null group by sam_id`),
  ]);
  const counts = (result: { rows: unknown[] }) =>
    new Map((result.rows as Array<{ samId: string; n: number }>).map((row) => [row.samId, row.n]));
  const reports = counts(reportRows);
  const sessions = counts(sessionRows);

  return {
    sams: data.sams
      .map((sam) => ({
        id: sam.id,
        name: sam.name,
        leaderName: sam.leaderName,
        isActive: sam.isActive,
        members: membersOfSam(data.roster, sam.name).length,
        reports: reports.get(sam.id) ?? 0,
        attendanceSessions: sessions.get(sam.id) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true })),
    villages: data.heads
      .map((head) => ({
        id: head.id,
        name: head.name,
        village: head.village,
        leaderName: head.leaderName,
        isActive: head.isActive,
        members: data.roster.filter((person) => person.isActive && villageKey(person.village) === villageKey(head.village)).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true })),
  };
}

/**
 * Deleting a sam removes the registration. A sam that already has pastoral reports is skipped (archive it instead),
 * saved attendance sheets stay (their sam link is cleared by the database), and the legacy user link is cleared.
 */
export async function changeSams(ids: string[], action: RegistrationAction): Promise<RegistrationResult> {
  return getDb().transaction(async (tx) => {
    if (action === "delete") {
      const deletable = (
        await tx
          .select({ id: sams.id })
          .from(sams)
          .where(
            and(
              inArray(sams.id, ids),
              sql`not exists (select 1 from prayer_app.pastoral_reports r where r.sam_id = ${sams.id})`,
            ),
          )
      ).map((row) => row.id);
      if (deletable.length > 0) {
        await tx.update(users).set({ samId: null }).where(inArray(users.samId, deletable));
        await tx.delete(sams).where(inArray(sams.id, deletable));
      }
      return { processed: deletable.length, skipped: ids.length - deletable.length };
    }

    const changed = await tx
      .update(sams)
      .set({ isActive: action === "restore" })
      .where(inArray(sams.id, ids))
      .returning({ id: sams.id });
    return { processed: changed.length, skipped: ids.length - changed.length };
  });
}

export async function changeVillageLeaders(ids: string[], action: RegistrationAction): Promise<RegistrationResult> {
  const list = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
  const result =
    action === "delete"
      ? await getDb().execute(sql`delete from prayer_app.village_leaders where id in (${list}) returning id`)
      : await getDb().execute(
          sql`update prayer_app.village_leaders set is_active = ${action === "restore"}, updated_at = now() where id in (${list}) returning id`,
        );
  return { processed: result.rows.length, skipped: ids.length - result.rows.length };
}

const hasGroup = or(isNotNull(memberRoster.village), isNotNull(memberRoster.sam), isNotNull(memberRoster.samLabel));

/** How many roster entries still carry a village or sam value. */
export async function countRosterGroups(): Promise<number> {
  const result = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(memberRoster)
    .where(hasGroup);
  return result[0]?.n ?? 0;
}

/**
 * New-year reset: clears only the village and sam of every roster entry. Positions, phone numbers,
 * administrator rights and the login restriction are untouched.
 */
export async function resetRosterGroups(): Promise<number> {
  const cleared = await getDb()
    .update(memberRoster)
    .set({ village: null, sam: null, samLabel: null, updatedAt: new Date() })
    .where(hasGroup)
    .returning({ id: memberRoster.id });
  return cleared.length;
}
