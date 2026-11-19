import { and, count, desc, eq, gte, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { bulletinPages, bulletins } from "../../db/schema";
import { DomainError } from "../../lib/http";
import { isExpired, retentionCutoff, type BulletinDraftInput, type BulletinStatus } from "./policy";
import type { PageImage } from "./image";

export type PublicBulletin = { id: string; date: string; title: string; pageCount: number; version: string };

export type AdminBulletin = PublicBulletin & {
  status: BulletinStatus;
  uploadedPages: number;
  publishedAt: string | null;
  /** True once the bulletin is older than the retention period (it is deleted at the next cleanup). */
  expired: boolean;
};

const publicColumns = {
  id: bulletins.id,
  date: bulletins.bulletinDate,
  title: bulletins.title,
  pageCount: bulletins.pageCount,
  version: bulletins.version,
};

/** Published bulletins that are still within the retention period, newest first. */
export async function listPublicBulletins(today: string): Promise<PublicBulletin[]> {
  return getDb()
    .select(publicColumns)
    .from(bulletins)
    .where(and(eq(bulletins.status, "published"), gte(bulletins.bulletinDate, retentionCutoff(today))))
    .orderBy(desc(bulletins.bulletinDate));
}

export async function getPublicBulletin(id: string, today: string): Promise<PublicBulletin | null> {
  const [row] = await getDb()
    .select(publicColumns)
    .from(bulletins)
    .where(
      and(
        eq(bulletins.id, id),
        eq(bulletins.status, "published"),
        gte(bulletins.bulletinDate, retentionCutoff(today)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** One page of a published, unexpired bulletin; anything else looks like it does not exist. */
export async function getPublicPageImage(
  id: string,
  page: number,
  kind: "full" | "thumb",
  today: string,
): Promise<{ data: Buffer; version: string } | null> {
  const [row] = await getDb()
    .select({
      data: kind === "thumb" ? bulletinPages.thumb : bulletinPages.image,
      version: bulletins.version,
    })
    .from(bulletinPages)
    .innerJoin(bulletins, eq(bulletins.id, bulletinPages.bulletinId))
    .where(
      and(
        eq(bulletinPages.bulletinId, id),
        eq(bulletinPages.pageNo, page),
        eq(bulletins.status, "published"),
        gte(bulletins.bulletinDate, retentionCutoff(today)),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Administrator preview: works for drafts and hidden bulletins too. */
export async function getAdminPageImage(
  id: string,
  page: number,
  kind: "full" | "thumb",
): Promise<{ data: Buffer; version: string } | null> {
  const [row] = await getDb()
    .select({
      data: kind === "thumb" ? bulletinPages.thumb : bulletinPages.image,
      version: bulletins.version,
    })
    .from(bulletinPages)
    .innerJoin(bulletins, eq(bulletins.id, bulletinPages.bulletinId))
    .where(and(eq(bulletinPages.bulletinId, id), eq(bulletinPages.pageNo, page)))
    .limit(1);
  return row ?? null;
}

/**
 * Deletes bulletins past the retention period and drafts that were never published (older than a day).
 * Runs whenever an administrator uploads or opens the bulletin screen; the public list already hides them.
 */
export async function purgeExpiredBulletins(today: string): Promise<number> {
  const removed = await getDb()
    .delete(bulletins)
    .where(
      or(
        lt(bulletins.bulletinDate, retentionCutoff(today)),
        and(eq(bulletins.status, "draft"), lt(bulletins.createdAt, sql`now() - interval '1 day'`)),
      ),
    )
    .returning({ id: bulletins.id });
  return removed.length;
}

export async function listAdminBulletins(today: string): Promise<AdminBulletin[]> {
  const rows = await getDb()
    .select({
      ...publicColumns,
      status: bulletins.status,
      publishedAt: bulletins.publishedAt,
      uploadedPages: sql<number>`(select count(*)::int from ${bulletinPages} p where p.bulletin_id = ${bulletins.id})`,
    })
    .from(bulletins)
    .orderBy(desc(bulletins.bulletinDate), desc(bulletins.createdAt));
  return rows.map((row) => ({
    ...row,
    status: row.status as BulletinStatus,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    expired: isExpired(row.date, today),
  }));
}

export async function createDraft(userId: string, input: BulletinDraftInput): Promise<string> {
  const [row] = await getDb()
    .insert(bulletins)
    .values({ bulletinDate: input.date, title: input.title, pageCount: input.pageCount, createdBy: userId })
    .returning({ id: bulletins.id });
  return row.id;
}

export async function savePage(id: string, page: number, image: PageImage): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [bulletin] = await tx
      .select({ status: bulletins.status, pageCount: bulletins.pageCount })
      .from(bulletins)
      .where(eq(bulletins.id, id))
      .for("update")
      .limit(1);
    if (!bulletin) throw new DomainError("BULLETIN_NOT_FOUND", 404);
    // Pages can only be added while the bulletin is a draft, so a published bulletin never changes under readers.
    if (bulletin.status !== "draft") throw new DomainError("NOT_A_DRAFT", 409);
    if (page > bulletin.pageCount) throw new DomainError("PAGE_NOT_FOUND", 404);
    await tx
      .insert(bulletinPages)
      .values({ bulletinId: id, pageNo: page, image: image.image, width: image.width, height: image.height, thumb: image.thumb })
      .onConflictDoUpdate({
        target: [bulletinPages.bulletinId, bulletinPages.pageNo],
        set: { image: image.image, width: image.width, height: image.height, thumb: image.thumb },
      });
  });
}

/**
 * Publishes a complete draft. An existing bulletin of the same date is replaced in the same transaction.
 */
export async function publishDraft(id: string): Promise<PublicBulletin & { replaced: boolean }> {
  return getDb().transaction(async (tx) => {
    const [bulletin] = await tx
      .select({
        status: bulletins.status,
        date: bulletins.bulletinDate,
        pageCount: bulletins.pageCount,
      })
      .from(bulletins)
      .where(eq(bulletins.id, id))
      .for("update")
      .limit(1);
    if (!bulletin) throw new DomainError("BULLETIN_NOT_FOUND", 404);
    if (bulletin.status !== "draft") throw new DomainError("NOT_A_DRAFT", 409);

    const [{ value: uploaded }] = await tx
      .select({ value: count() })
      .from(bulletinPages)
      .where(eq(bulletinPages.bulletinId, id));
    if (uploaded !== bulletin.pageCount) throw new DomainError("PAGES_INCOMPLETE", 409);

    const removed = await tx
      .delete(bulletins)
      .where(and(eq(bulletins.bulletinDate, bulletin.date), ne(bulletins.status, "draft"), ne(bulletins.id, id)))
      .returning({ id: bulletins.id });

    const [published] = await tx
      .update(bulletins)
      .set({ status: "published", publishedAt: new Date(), updatedAt: new Date(), version: sql`gen_random_uuid()` })
      .where(eq(bulletins.id, id))
      .returning(publicColumns);
    return { ...published, replaced: removed.length > 0 };
  });
}

/** Hide a published bulletin from the public (or show it again). Drafts cannot be toggled. */
export async function setVisibility(id: string, status: "published" | "hidden"): Promise<void> {
  const changed = await getDb()
    .update(bulletins)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(bulletins.id, id), ne(bulletins.status, "draft")))
    .returning({ id: bulletins.id });
  if (changed.length === 0) throw new DomainError("BULLETIN_NOT_FOUND", 404);
}

export async function deleteBulletin(id: string): Promise<void> {
  const removed = await getDb().delete(bulletins).where(eq(bulletins.id, id)).returning({ id: bulletins.id });
  if (removed.length === 0) throw new DomainError("BULLETIN_NOT_FOUND", 404);
}
