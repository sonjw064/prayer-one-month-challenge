import { asc } from "drizzle-orm";
import { getDb } from "../../db/client";
import { memberRoster } from "../../db/schema";
import { DomainError } from "../../lib/http";
import { decryptRosterPhone } from "../roster/crypto";
import { formatPhoneForDisplay } from "../roster/normalize";
import type { RosterExportRow } from "./roster-workbook";

/** Every roster entry (uploaded or added by an administrator), regardless of any search filter. */
export async function listRosterForExport(): Promise<RosterExportRow[]> {
  const rows = await getDb()
    .select({
      sourceName: memberRoster.sourceName,
      canonicalName: memberRoster.canonicalName,
      position: memberRoster.position,
      phoneCiphertext: memberRoster.phoneCiphertext,
      village: memberRoster.village,
      sam: memberRoster.sam,
    })
    .from(memberRoster)
    .orderBy(asc(memberRoster.canonicalName), asc(memberRoster.sourceName));

  return rows.map((row) => {
    let phone: string | null = null;
    if (row.phoneCiphertext) {
      try {
        phone = formatPhoneForDisplay(decryptRosterPhone(row.phoneCiphertext));
      } catch {
        // Never silently blank a phone number: re-uploading would remove that person's login.
        throw new DomainError("ROSTER_PHONE_DECRYPT_FAILED", 500);
      }
    }
    return {
      name: row.sourceName || row.canonicalName,
      position: row.position,
      phone,
      village: row.village,
      sam: row.sam,
    };
  });
}
