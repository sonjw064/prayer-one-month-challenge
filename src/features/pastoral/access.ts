import { getDb, rows, sql, type Executor } from "./db";
import { deriveAccess, ReportError, samKey, villageKey, type Actor, type VillageLeader, type Identity, type SamTarget } from "./policy";
export function requireReportAdmin(actor: Actor) {
  if (actor.role !== "admin") throw new ReportError("FORBIDDEN", 403);
}
export async function directory(db: Executor = getDb()) {
  const [roster, samRows, heads] = await Promise.all([
    rows<Identity>(db, sql`select id,source_name as "sourceName",canonical_name as "canonicalName",sam_label as "samLabel",village,is_active as "isActive" from prayer_app.member_roster`),
    rows<Omit<SamTarget, "village">>(db, sql`select id,name,leader_name as "leaderName",leader_roster_id as "leaderRosterId",leader_binding_locked as "leaderBindingLocked",is_active as "isActive" from prayer_app.sams order by name,id`),
    rows<VillageLeader>(db, sql`select id,name,village,leader_name as "leaderName",leader_roster_id as "leaderRosterId",leader_binding_locked as "leaderBindingLocked",is_active as "isActive" from prayer_app.village_leaders order by village,id`),
  ]);
  const sams: SamTarget[] = samRows.map(sam => {
    const key = samKey(sam.name);
    const villages = [...new Set(roster.filter(r => samKey(r.samLabel) === key).map(r => villageKey(r.village)).filter(Boolean))];
    return { ...sam, village: villages.length === 1 ? villages[0] : key.includes("-") ? key.split("-")[0] : "" };
  });
  return { roster, sams, heads };
}
/** Same as `reportAccess`, but also returns the roster that was loaded so callers need no second query. */
export async function reportAccessWithRoster(actor: Actor, db: Executor = getDb()) {
  const [user] = await rows<{ rosterId: string | null }>(db, sql`select roster_id as "rosterId" from prayer_app.users where id=${actor.id} and is_active=true`);
  if (!user) throw new ReportError("UNAUTHORIZED", 401);
  const data = await directory(db);
  const access = deriveAccess(actor, data.roster.find(r => r.id === user.rosterId) ?? null, data.sams, data.roster, data.heads);
  return { access, roster: data.roster };
}
export async function reportAccess(actor: Actor, db: Executor = getDb()) {
  return (await reportAccessWithRoster(actor, db)).access;
}
export async function requireReportAccess(actor: Actor, db: Executor = getDb()) {
  const access = await reportAccess(actor, db);
  if (!access.visible) throw new ReportError("FORBIDDEN", 403);
  return access;
}
export async function requireReportTarget(actor: Actor, samId: string, db: Executor = getDb()) {
  const access = await requireReportAccess(actor, db);
  const sam = access.sams.find(s => s.id === samId);
  if (!sam) throw new ReportError("FORBIDDEN", 403);
  return { access, sam };
}
