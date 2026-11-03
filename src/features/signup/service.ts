import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../../db/client";
import { memberRoster, signupRequests } from "../../db/schema";
import { DomainError } from "../../lib/http";
import { createRosterMember } from "../admin/roster-service";
import { phoneLookupHash } from "../auth/crypto";
import { decryptRosterPhone, encryptRosterPhone } from "../roster/crypto";
import { formatPhoneForDisplay } from "../roster/normalize";
import { MAX_PENDING_REQUESTS } from "./input";
import type {
  AdminSignupList,
  SignupApproval,
  SignupRequestInput,
  SignupRequestRow,
  SignupStatus,
} from "./types";

/**
 * Stores a pending request. Always resolves quietly for duplicates so the
 * caller cannot learn whether someone is already pending or on the roster.
 */
export async function submitSignupRequest(input: SignupRequestInput): Promise<void> {
  const db = getDb();
  const [pending] = await db
    .select({ value: count() })
    .from(signupRequests)
    .where(eq(signupRequests.status, "pending"));
  if ((pending?.value ?? 0) >= MAX_PENDING_REQUESTS) {
    throw new DomainError("SIGNUP_UNAVAILABLE", 503);
  }

  await db
    .insert(signupRequests)
    .values({
      name: input.name,
      canonicalName: input.canonicalName,
      phoneLookupHash: phoneLookupHash(input.phone),
      phoneCiphertext: encryptRosterPhone(input.phone),
      memo: input.memo,
    })
    .onConflictDoNothing();
}

export async function countPendingSignupRequests(): Promise<number> {
  const [row] = await getDb()
    .select({ value: count() })
    .from(signupRequests)
    .where(eq(signupRequests.status, "pending"));
  return row?.value ?? 0;
}

function displayPhone(ciphertext: string | null): string | null {
  if (!ciphertext) return null;
  try {
    return formatPhoneForDisplay(decryptRosterPhone(ciphertext));
  } catch {
    return null;
  }
}

const columns = {
  id: signupRequests.id,
  name: signupRequests.name,
  canonicalName: signupRequests.canonicalName,
  phoneLookupHash: signupRequests.phoneLookupHash,
  phoneCiphertext: signupRequests.phoneCiphertext,
  memo: signupRequests.memo,
  status: signupRequests.status,
  createdAt: signupRequests.createdAt,
  decidedAt: signupRequests.decidedAt,
};

export async function listSignupRequestsForAdmin(): Promise<AdminSignupList> {
  const db = getDb();
  const pendingRows = await db
    .select(columns)
    .from(signupRequests)
    .where(eq(signupRequests.status, "pending"))
    .orderBy(asc(signupRequests.createdAt));
  const recentRows = await db
    .select(columns)
    .from(signupRequests)
    .where(ne(signupRequests.status, "pending"))
    .orderBy(desc(signupRequests.decidedAt))
    .limit(20);

  const hashes = [...new Set(pendingRows.map((row) => row.phoneLookupHash))];
  const existing =
    hashes.length === 0
      ? []
      : await db
          .select({
            canonicalName: memberRoster.canonicalName,
            phoneLookupHash: memberRoster.phoneLookupHash,
          })
          .from(memberRoster)
          .where(inArray(memberRoster.phoneLookupHash, hashes));
  const existingKeys = new Set(
    existing.map((row) => `${row.canonicalName}\n${row.phoneLookupHash}`),
  );

  const toRow = (row: (typeof pendingRows)[number], inRoster: boolean): SignupRequestRow => ({
    id: row.id,
    name: row.name,
    phone: displayPhone(row.phoneCiphertext),
    memo: row.memo,
    status: row.status as SignupStatus,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    alreadyInRoster: inRoster,
  });

  return {
    pending: pendingRows.map((row) =>
      toRow(row, existingKeys.has(`${row.canonicalName}\n${row.phoneLookupHash}`)),
    ),
    recent: recentRows.map((row) => toRow(row, false)),
  };
}

/** Approves a pending request by adding the person to the roster as a regular member. */
export async function approveSignupRequest(
  id: string,
  actorId: string,
  approval: SignupApproval,
): Promise<void> {
  const db = getDb();
  // Claim the request first so two admins cannot approve it twice.
  const [claimed] = await db
    .update(signupRequests)
    .set({ status: "approved", decidedAt: new Date(), decidedBy: actorId })
    .where(and(eq(signupRequests.id, id), eq(signupRequests.status, "pending")))
    .returning({ name: signupRequests.name, phoneCiphertext: signupRequests.phoneCiphertext });
  if (!claimed) throw new DomainError("SIGNUP_NOT_PENDING", 409);

  let rosterId: string;
  try {
    rosterId = await createRosterMember({
      name: claimed.name,
      position: approval.position,
      phone: claimed.phoneCiphertext ? decryptRosterPhone(claimed.phoneCiphertext) : null,
      village: approval.village,
      sam: approval.sam,
      isActive: true,
      isAdmin: false,
    });
  } catch (error) {
    // Put the request back so it can be handled again (e.g. ROSTER_DUPLICATE).
    await db
      .update(signupRequests)
      .set({ status: "pending", decidedAt: null, decidedBy: null })
      .where(eq(signupRequests.id, id))
      .catch(() => undefined);
    throw error;
  }

  await db
    .update(signupRequests)
    .set({ rosterId, phoneCiphertext: null })
    .where(eq(signupRequests.id, id));
}

export async function rejectSignupRequest(id: string, actorId: string): Promise<void> {
  const rejected = await getDb()
    .update(signupRequests)
    .set({ status: "rejected", decidedAt: new Date(), decidedBy: actorId, phoneCiphertext: null })
    .where(and(eq(signupRequests.id, id), eq(signupRequests.status, "pending")))
    .returning({ id: signupRequests.id });
  if (rejected.length === 0) throw new DomainError("SIGNUP_NOT_PENDING", 409);
}
