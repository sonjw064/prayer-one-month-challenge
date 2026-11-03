import { hasLoginHistory } from "./metrics-policy";
import { reconcileUnboundLeaders } from "../sams/identity-service";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "../../db/client";
import { memberRoster, sessions, users } from "../../db/schema";
import { DomainError } from "../../lib/http";
import {
  hashPassword,
  hashPhonePassword,
  normalizeName,
  phoneLookupHash,
  verifyPassword,
} from "../auth/crypto";
import { decryptRosterPhone, encryptRosterPhone } from "../roster/crypto";
import {
  canonicalizeRosterName,
  formatPhoneForDisplay,
  makeSamLabel,
  normalizeOptionalPhone,
  normalizeRosterPhone,
} from "../roster/normalize";

export type AdminRosterInput = {
  name: string;
  position: string | null;
  phone: string | null;
  village: string | null;
  sam: string | null;
  isActive: boolean;
  isAdmin: boolean;
};

export type PreparedAdminRosterValues = {
  sourceName: string;
  canonicalName: string;
  position: string | null;
  phoneLookupHash: string | null;
  phoneCiphertext: string | null;
  village: string | null;
  sam: string | null;
  samLabel: string | null;
  isActive: boolean;
  isAdmin: boolean;
};

export type AdminRosterRow = {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  village: string | null;
  sam: string | null;
  samLabel: string | null;
  isActive: boolean;
  isAdmin: boolean;
  joined: boolean;
  passwordMode: "initial" | "custom";
};

export type AdminRosterPage = {
  rows: AdminRosterRow[];
  nextOffset: number | null;
};

export function passwordModeFromHash(
  passwordHash: string | null,
): "initial" | "custom" {
  return passwordHash ? "custom" : "initial";
}

export function uniqueRosterIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function assertActorNotSelectedForDeletion(
  linkedUsers: Array<{ id: string; rosterId: string | null }>,
  actingUserId: string,
): void {
  if (linkedUsers.some((user) => user.id === actingUserId)) {
    throw new DomainError("CANNOT_DELETE_SELF", 409);
  }
}

export function assertNoAdminSelectedForDeletion(
  targets: Array<{ id: string; isAdmin: boolean }>,
): void {
  if (targets.some((target) => target.isAdmin)) {
    throw new DomainError("CANNOT_DELETE_ADMIN", 409);
  }
}

export function assertAdminRemains({
  wasAdmin,
  willBeAdmin,
  willBeActive,
  otherActiveAdmins,
}: {
  wasAdmin: boolean;
  willBeAdmin: boolean;
  willBeActive: boolean;
  otherActiveAdmins: number;
}): void {
  const losesAdmin = wasAdmin && (!willBeAdmin || !willBeActive);
  if (losesAdmin && otherActiveAdmins === 0) {
    throw new DomainError("ADMIN_REQUIRED", 409);
  }
}

function optionalText(value: string | null): string | null {
  const normalized = value?.trim().normalize("NFC") ?? "";
  return normalized || null;
}

export function prepareAdminRosterValues(
  input: AdminRosterInput,
): PreparedAdminRosterValues {
  const sourceName = input.name.trim().replace(/\s+/g, " ").normalize("NFC");
  const canonicalName = canonicalizeRosterName(sourceName);
  const phone = normalizeOptionalPhone(input.phone ?? "");
  const village = optionalText(input.village);
  const sam = optionalText(input.sam);

  return {
    sourceName,
    canonicalName,
    position: optionalText(input.position),
    phoneLookupHash: phone ? phoneLookupHash(phone) : null,
    phoneCiphertext: phone ? encryptRosterPhone(phone) : null,
    village,
    sam,
    samLabel: makeSamLabel(village, sam),
    isActive: input.isActive,
    isAdmin: input.isAdmin,
  };
}

export function rosterAuthIdentityChanged(
  before: {
    canonicalName: string;
    phoneLookupHash: string | null;
    isActive: boolean;
  },
  after: {
    canonicalName: string;
    phoneLookupHash: string | null;
    isActive: boolean;
  },
): boolean {
  return (
    before.canonicalName !== after.canonicalName ||
    before.phoneLookupHash !== after.phoneLookupHash ||
    before.isActive !== after.isActive
  );
}

function decryptPhone(ciphertext: string | null): string | null {
  if (!ciphertext) return null;
  try {
    return formatPhoneForDisplay(decryptRosterPhone(ciphertext));
  } catch {
    throw new DomainError("ROSTER_PHONE_DECRYPT_FAILED", 500);
  }
}

export async function listRosterForAdmin({
  query = "",
  participation = "all",
  offset = 0,
  limit = 500,
}: {
  query?: string;
  participation?: "all" | "joined" | "not_joined";
  offset?: number;
  limit?: number;
} = {}): Promise<AdminRosterPage> {
  const all = await getDb()
    .select({
      id: memberRoster.id,
      name: memberRoster.canonicalName,
      position: memberRoster.position,
      phoneCiphertext: memberRoster.phoneCiphertext,
      village: memberRoster.village,
      sam: memberRoster.sam,
      samLabel: memberRoster.samLabel,
      isActive: memberRoster.isActive,
      isAdmin: memberRoster.isAdmin,
      passwordHash: memberRoster.passwordHash,
      firstLoginAt: users.firstLoginAt,
    })
    .from(memberRoster)
    .leftJoin(users, eq(users.rosterId, memberRoster.id))
    .orderBy(asc(memberRoster.canonicalName));

  const decoded = all.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    phone: decryptPhone(row.phoneCiphertext),
    village: row.village,
    sam: row.sam,
    samLabel: row.samLabel,
    isActive: row.isActive,
    isAdmin: row.isAdmin,
    joined: hasLoginHistory(row.firstLoginAt),
    passwordMode: passwordModeFromHash(row.passwordHash),
  }));

  const rawNeedle = query.trim();
  const needle = rawNeedle.toLocaleLowerCase("ko-KR");
  let normalizedPhoneQuery: string | null = null;
  if (/\d/.test(rawNeedle)) {
    try {
      normalizedPhoneQuery = normalizeRosterPhone(rawNeedle);
    } catch {
      normalizedPhoneQuery = null;
    }
  }

  const filtered = decoded.filter((row) => {
    if (participation === "joined" && !row.joined) return false;
    if (participation === "not_joined" && row.joined) return false;
    if (!needle) return true;

    if (normalizedPhoneQuery) {
      return row.phone?.replace(/\D/g, "") === normalizedPhoneQuery;
    }
    return (
      row.name.toLocaleLowerCase("ko-KR").includes(needle) ||
      (row.position ?? "").toLocaleLowerCase("ko-KR").includes(needle) ||
      (row.samLabel ?? "").toLocaleLowerCase("ko-KR").includes(needle)
    );
  });

  const safeLimit = Math.max(1, Math.min(500, limit));
  const safeOffset = Math.max(0, offset);
  const page = filtered.slice(safeOffset, safeOffset + safeLimit);

  return {
    rows: page,
    nextOffset:
      safeOffset + safeLimit < filtered.length
        ? safeOffset + safeLimit
        : null,
  };
}

export async function duplicateExists(
  canonicalName: string,
  lookupHash: string | null,
  excludeId?: string,
): Promise<boolean> {
  if (!lookupHash) return false;
  const conditions = [
    eq(memberRoster.canonicalName, canonicalName),
    eq(memberRoster.phoneLookupHash, lookupHash),
  ];
  if (excludeId) conditions.push(ne(memberRoster.id, excludeId));

  const [duplicate] = await getDb()
    .select({ id: memberRoster.id })
    .from(memberRoster)
    .where(and(...conditions))
    .limit(1);
  return Boolean(duplicate);
}

export async function createRosterMember(input: AdminRosterInput): Promise<string> {
  const values = prepareAdminRosterValues(input);
  if (await duplicateExists(values.canonicalName, values.phoneLookupHash)) {
    throw new DomainError("ROSTER_DUPLICATE", 409);
  }

  try {
    return await getDb().transaction(async tx=>{
    const [created] = await tx
      .insert(memberRoster)
      .values({
        ...values,
        source: "admin",
        sourceRow: null,
      })
      .returning({ id: memberRoster.id });
    await reconcileUnboundLeaders(tx);
    return created.id;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new DomainError("ROSTER_DUPLICATE", 409);
    }
    throw error;
  }
}

export async function updateRosterMember(
  id: string,
  input: AdminRosterInput,
): Promise<void> {
  const values = prepareAdminRosterValues(input);
  const db = getDb();

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: memberRoster.id,
        canonicalName: memberRoster.canonicalName,
        phoneLookupHash: memberRoster.phoneLookupHash,
        isActive: memberRoster.isActive,
        isAdmin: memberRoster.isAdmin,
      })
      .from(memberRoster)
      .where(eq(memberRoster.id, id))
      .limit(1);
    if (!existing) throw new DomainError("ROSTER_NOT_FOUND", 404);

    if (existing.isAdmin && (!values.isAdmin || !values.isActive)) {
      const others = await tx
        .select({ id: memberRoster.id })
        .from(memberRoster)
        .where(
          and(
            eq(memberRoster.isAdmin, true),
            eq(memberRoster.isActive, true),
            ne(memberRoster.id, id),
          ),
        )
        .limit(1);
      assertAdminRemains({
        wasAdmin: existing.isAdmin,
        willBeAdmin: values.isAdmin,
        willBeActive: values.isActive,
        otherActiveAdmins: others.length,
      });
    }

    if (values.phoneLookupHash) {
      const [duplicate] = await tx
        .select({ id: memberRoster.id })
        .from(memberRoster)
        .where(
          and(
            eq(memberRoster.canonicalName, values.canonicalName),
            eq(memberRoster.phoneLookupHash, values.phoneLookupHash),
            ne(memberRoster.id, id),
          ),
        )
        .limit(1);
      if (duplicate) throw new DomainError("ROSTER_DUPLICATE", 409);
    }

    await tx
      .update(memberRoster)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(memberRoster.id, id));

    const [linked] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.rosterId, id))
      .limit(1);

    await reconcileUnboundLeaders(tx);
    if (!linked) return;

    const userUpdate: {
      displayName: string;
      normalizedName: string;
      role: "member" | "admin";
      isActive: boolean;
      updatedAt: Date;
      phoneLookupHash?: string;
    } = {
      displayName: values.canonicalName,
      normalizedName: normalizeName(values.canonicalName),
      role: values.isAdmin ? "admin" : "member",
      isActive: values.isActive,
      updatedAt: new Date(),
    };
    if (values.phoneLookupHash) {
      userUpdate.phoneLookupHash = values.phoneLookupHash;
    }

    await tx.update(users).set(userUpdate).where(eq(users.id, linked.id));

    if (rosterAuthIdentityChanged(existing, values)) {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, linked.id), isNull(sessions.revokedAt)));
    }
  });
}


async function passwordConflictsForSameName(
  rosterId: string,
  canonicalName: string,
  password: string,
): Promise<boolean> {
  const rows = await getDb()
    .select({
      phoneLookupHash: memberRoster.phoneLookupHash,
      passwordHash: memberRoster.passwordHash,
    })
    .from(memberRoster)
    .where(
      and(
        eq(memberRoster.canonicalName, canonicalName),
        eq(memberRoster.isActive, true),
        ne(memberRoster.id, rosterId),
      ),
    );

  for (const row of rows) {
    if (row.passwordHash && await verifyPassword(row.passwordHash, password)) {
      return true;
    }
    if (!row.passwordHash && row.phoneLookupHash) {
      try {
        if (phoneLookupHash(password) === row.phoneLookupHash) return true;
      } catch {
        // Non-phone custom passwords cannot match an initial phone password.
      }
    }
  }
  return false;
}

export async function resetRosterPassword(
  id: string,
  password: string | null,
): Promise<"initial" | "custom"> {
  const db = getDb();
  const [target] = await db
    .select({
      id: memberRoster.id,
      canonicalName: memberRoster.canonicalName,
      phoneLookupHash: memberRoster.phoneLookupHash,
      phoneCiphertext: memberRoster.phoneCiphertext,
      userId: users.id,
    })
    .from(memberRoster)
    .leftJoin(users, eq(users.rosterId, memberRoster.id))
    .where(eq(memberRoster.id, id))
    .limit(1);

  if (!target) throw new DomainError("ROSTER_NOT_FOUND", 404);

  let rosterPasswordHash: string | null;
  let userPasswordHash: string | null = null;

  if (password === null) {
    if (!target.phoneLookupHash || !target.phoneCiphertext) {
      throw new DomainError("PHONE_REQUIRED_FOR_INITIAL_PASSWORD", 409);
    }
    const phone = decryptRosterPhone(target.phoneCiphertext);
    rosterPasswordHash = null;
    userPasswordHash = await hashPhonePassword(phone);
  } else {
    if (!password) throw new DomainError("INVALID_PASSWORD", 400);
    if (await passwordConflictsForSameName(id, target.canonicalName, password)) {
      throw new DomainError("PASSWORD_CONFLICT_SAME_NAME", 409);
    }
    rosterPasswordHash = await hashPassword(password);
    userPasswordHash = rosterPasswordHash;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(memberRoster)
      .set({ passwordHash: rosterPasswordHash, updatedAt: new Date() })
      .where(eq(memberRoster.id, id));

    if (target.userId && userPasswordHash) {
      await tx
        .update(users)
        .set({ phonePasswordHash: userPasswordHash, updatedAt: new Date() })
        .where(eq(users.id, target.userId));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.userId, target.userId),
            isNull(sessions.revokedAt),
          ),
        );
    }
  });

  return rosterPasswordHash ? "custom" : "initial";
}

export async function deleteRosterMembers(
  ids: string[],
  actingUserId: string,
): Promise<number> {
  const rosterIds = uniqueRosterIds(ids);
  if (rosterIds.length === 0) {
    throw new DomainError("ROSTER_SELECTION_REQUIRED", 400);
  }

  const db = getDb();
  const linkedUsers = await db
    .select({ id: users.id, rosterId: users.rosterId })
    .from(users)
    .where(inArray(users.rosterId, rosterIds));

  assertActorNotSelectedForDeletion(linkedUsers, actingUserId);
  const targets = await db
    .select({ id: memberRoster.id, isAdmin: memberRoster.isAdmin })
    .from(memberRoster)
    .where(inArray(memberRoster.id, rosterIds));
  assertNoAdminSelectedForDeletion(targets);
  const userIds = linkedUsers.map((row) => row.id);

  return db.transaction(async (tx) => {
    if (userIds.length > 0) {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            inArray(sessions.userId, userIds),
            isNull(sessions.revokedAt),
          ),
        );
      await tx
        .update(users)
        .set({
          rosterId: null,
          isActive: false,
          updatedAt: new Date(),
        })
        .where(inArray(users.id, userIds));
    }

    const deleted = await tx
      .delete(memberRoster)
      .where(inArray(memberRoster.id, rosterIds))
      .returning({ id: memberRoster.id });
    return deleted.length;
  });
}
