import { reconcileUnboundLeaders } from "../sams/identity-service";
import * as fs from "node:fs";
import { eq, isNull } from "drizzle-orm";
import * as XLSX from "xlsx";
import * as cptable from "xlsx/dist/cpexcel.full.mjs";

XLSX.set_fs(fs);
XLSX.set_cptable(cptable);
import { getDb } from "../../db/client";
import { memberRoster, users } from "../../db/schema";
import { phoneLookupHash } from "../auth/crypto";
import { encryptRosterPhone } from "./crypto";
import {
  canonicalizeRosterName,
  makeSamLabel,
  normalizeOptionalPhone,
  normalizeRosterPhone,
} from "./normalize";

export type ImportCandidate = {
  sourceRow: number;
  sourceName: string;
  canonicalName: string;
  position: string | null;
  phone: string | null;
  village: string | null;
  sam: string | null;
  samLabel: string | null;
};

export type ImportValidationError = {
  code: "DUPLICATE_CREDENTIAL" | "MISSING_NAME";
  sourceRows: number[];
};

export type ImportValidation = {
  missingPhone: number;
  errors: ImportValidationError[];
};

export type PreparedRosterRow = {
  sourceRow: number;
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
  source: "xls";
};

export type ImportSummary = {
  /** Rows read from the file. */
  total: number;
  added: number;
  /** Existing people whose position/village/sam changed. */
  updated: number;
  unchanged: number;
  /** Rows skipped because the person could not be identified safely. */
  skipped: number;
  /** Existing roster entries that are not in the file (they are kept as they are). */
  notInFile: number;
  missingPhone: number;
};

export type ExistingRosterRow = {
  id: string;
  canonicalName: string;
  phoneLookupHash: string | null;
  position: string | null;
  village: string | null;
  sam: string | null;
  samLabel: string | null;
  isActive: boolean;
  isAdmin: boolean;
};

export type RosterChange = {
  field: "position" | "village" | "sam";
  before: string | null;
  after: string;
};

export type PlannedUpdate = {
  existing: ExistingRosterRow;
  values: {
    position: string | null;
    village: string | null;
    sam: string | null;
    samLabel: string | null;
  };
  changes: RosterChange[];
  /** The file marks this person as the initial administrator (promote only, never demote). */
  promote: boolean;
};

export type RosterImportPlan = {
  adds: PreparedRosterRow[];
  updates: PlannedUpdate[];
  unchanged: Array<{ existing: ExistingRosterRow }>;
  skipped: PreparedRosterRow[];
  notInFile: number;
};

export type RosterImportRepository = {
  loadRoster(): Promise<ExistingRosterRow[]>;
  /** Applies the plan in one transaction and returns what was done. */
  applyRoster(rows: PreparedRosterRow[]): Promise<RosterImportPlan>;
};

export class RosterValidationError extends Error {
  constructor(public errors: ImportValidationError[]) {
    super("ROSTER_VALIDATION_FAILED");
  }
}

const HEADER_ALIASES = {
  name: ["이름"],
  position: ["교회직분", "직분"],
  phone: ["핸드폰", "핸드폰 번호", "핸드폰번호", "전화번호"],
  village: ["마을"],
  sam: ["샘"],
} as const;

function cellText(value: unknown): string {
  return String(value ?? "").trim().normalize("NFC");
}

function findHeaderIndex(row: string[], aliases: readonly string[]): number {
  return row.findIndex((value) => aliases.includes(value));
}

function parseWorkbook(workbook: XLSX.WorkBook): ImportCandidate[] {
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("ROSTER_SHEET_MISSING");

  const sheet = workbook.Sheets[firstSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }).map((row) => row.map(cellText));

  let headerRow = -1;
  let columns:
    | { name: number; position: number; phone: number; village: number; sam: number }
    | undefined;

  for (let index = 0; index < Math.min(20, matrix.length); index += 1) {
    const row = matrix[index];
    const candidate = {
      name: findHeaderIndex(row, HEADER_ALIASES.name),
      position: findHeaderIndex(row, HEADER_ALIASES.position),
      phone: findHeaderIndex(row, HEADER_ALIASES.phone),
      village: findHeaderIndex(row, HEADER_ALIASES.village),
      sam: findHeaderIndex(row, HEADER_ALIASES.sam),
    };
    if (Object.values(candidate).every((value) => value >= 0)) {
      headerRow = index;
      columns = candidate;
      break;
    }
  }

  if (headerRow < 0 || !columns) throw new Error("ROSTER_HEADERS_MISSING");

  const result: ImportCandidate[] = [];
  for (let index = headerRow + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    if (row.every((value) => !value)) continue;

    const sourceName = row[columns.name] ?? "";
    const position = row[columns.position] || null;
    const phoneText = row[columns.phone] ?? "";
    const village = row[columns.village] || null;
    const sam = row[columns.sam] || null;

    let canonicalName = "";
    try {
      canonicalName = canonicalizeRosterName(sourceName);
    } catch {
      canonicalName = "";
    }

    result.push({
      sourceRow: index + 1,
      sourceName,
      canonicalName,
      position,
      phone: normalizeOptionalPhone(phoneText),
      village,
      sam,
      samLabel: makeSamLabel(village, sam),
    });
  }

  return result;
}

export function parseRosterWorkbook(filePath: string): ImportCandidate[] {
  return parseWorkbook(XLSX.readFile(filePath, { cellText: true }));
}

export function parseRosterWorkbookBuffer(buffer: Buffer): ImportCandidate[] {
  return parseWorkbook(XLSX.read(buffer, { type: "buffer", cellText: true }));
}

export function validateRosterCandidates(rows: ImportCandidate[]): ImportValidation {
  const errors: ImportValidationError[] = [];
  const byCredential = new Map<string, number[]>();
  let missingPhone = 0;

  for (const row of rows) {
    if (!row.canonicalName) {
      errors.push({ code: "MISSING_NAME", sourceRows: [row.sourceRow] });
      continue;
    }
    if (!row.phone) {
      missingPhone += 1;
      continue;
    }

    const key = `${row.canonicalName}\u0000${row.phone}`;
    const list = byCredential.get(key) ?? [];
    list.push(row.sourceRow);
    byCredential.set(key, list);
  }

  for (const sourceRows of byCredential.values()) {
    if (sourceRows.length > 1) {
      errors.push({ code: "DUPLICATE_CREDENTIAL", sourceRows });
    }
  }

  return { missingPhone, errors };
}

function credentialKey(name: string, hash: string): string {
  return `${name}\u0000${hash}`;
}

/**
 * Decides what an upload would do. Uploading never deletes anyone and never touches
 * administrator or active state; it only adds people and fills in position/village/sam.
 * Blank cells in the file never erase existing values.
 */
export function planRosterImport(
  existing: ExistingRosterRow[],
  prepared: PreparedRosterRow[],
): RosterImportPlan {
  const byCredential = new Map<string, ExistingRosterRow>();
  const phonelessByName = new Map<string, ExistingRosterRow[]>();
  for (const row of existing) {
    if (row.phoneLookupHash) {
      byCredential.set(credentialKey(row.canonicalName, row.phoneLookupHash), row);
    } else {
      const list = phonelessByName.get(row.canonicalName) ?? [];
      list.push(row);
      phonelessByName.set(row.canonicalName, list);
    }
  }
  const phonelessInFile = new Map<string, number>();
  for (const row of prepared) {
    if (!row.phoneLookupHash) {
      phonelessInFile.set(row.canonicalName, (phonelessInFile.get(row.canonicalName) ?? 0) + 1);
    }
  }

  const plan: RosterImportPlan = { adds: [], updates: [], unchanged: [], skipped: [], notInFile: 0 };
  const matchedIds = new Set<string>();

  for (const row of prepared) {
    let match: ExistingRosterRow | undefined;
    if (row.phoneLookupHash) {
      match = byCredential.get(credentialKey(row.canonicalName, row.phoneLookupHash));
    } else {
      // Without a phone number the name is the only identity: match only when it is unambiguous.
      const candidates = phonelessByName.get(row.canonicalName) ?? [];
      if ((phonelessInFile.get(row.canonicalName) ?? 0) > 1 || candidates.length > 1) {
        plan.skipped.push(row);
        continue;
      }
      match = candidates[0];
    }

    if (!match) {
      plan.adds.push(row);
      continue;
    }
    matchedIds.add(match.id);

    const position = row.position ?? match.position;
    const village = row.village ?? match.village;
    const sam = row.sam ?? match.sam;
    const changes: RosterChange[] = [];
    if (position !== match.position) changes.push({ field: "position", before: match.position, after: position! });
    if (village !== match.village) changes.push({ field: "village", before: match.village, after: village! });
    if (sam !== match.sam) changes.push({ field: "sam", before: match.sam, after: sam! });
    const promote = row.isAdmin && !match.isAdmin;

    if (changes.length === 0 && !promote) {
      plan.unchanged.push({ existing: match });
    } else {
      plan.updates.push({
        existing: match,
        values: { position, village, sam, samLabel: makeSamLabel(village, sam) },
        changes,
        promote,
      });
    }
  }

  plan.notInFile = existing.filter((row) => !matchedIds.has(row.id)).length;
  return plan;
}

function summarize(plan: RosterImportPlan, total: number, missingPhone: number): ImportSummary {
  return {
    total,
    added: plan.adds.length,
    updated: plan.updates.length,
    unchanged: plan.unchanged.length,
    skipped: plan.skipped.length,
    notInFile: plan.notInFile,
    missingPhone,
  };
}

const existingColumns = {
  id: memberRoster.id,
  canonicalName: memberRoster.canonicalName,
  phoneLookupHash: memberRoster.phoneLookupHash,
  position: memberRoster.position,
  village: memberRoster.village,
  sam: memberRoster.sam,
  samLabel: memberRoster.samLabel,
  isActive: memberRoster.isActive,
  isAdmin: memberRoster.isAdmin,
};

export const dbRosterImportRepository: RosterImportRepository = {
  async loadRoster() {
    return getDb().select(existingColumns).from(memberRoster);
  },

  async applyRoster(rows) {
    return getDb().transaction(async (tx) => {
      const existing = await tx.select(existingColumns).from(memberRoster);
      const plan = planRosterImport(existing, rows);

      // People who can be matched to older login accounts that are not linked to a roster row yet.
      const rosterByCredential = new Map<
        string,
        { id: string; name: string; hash: string; isAdmin: boolean; isActive: boolean }
      >();

      for (const row of plan.adds) {
        const [inserted] = await tx
          .insert(memberRoster)
          .values(row)
          .returning({ id: memberRoster.id });
        if (row.phoneLookupHash) {
          rosterByCredential.set(credentialKey(row.canonicalName, row.phoneLookupHash), {
            id: inserted.id,
            name: row.canonicalName,
            hash: row.phoneLookupHash,
            isAdmin: row.isAdmin,
            isActive: row.isActive,
          });
        }
      }

      for (const update of plan.updates) {
        await tx
          .update(memberRoster)
          .set({
            ...update.values,
            ...(update.promote ? { isAdmin: true } : {}),
            updatedAt: new Date(),
          })
          .where(eq(memberRoster.id, update.existing.id));
      }

      for (const entry of [
        ...plan.updates.map((update) => ({ ...update.existing, isAdmin: update.existing.isAdmin || update.promote })),
        ...plan.unchanged.map((item) => item.existing),
      ]) {
        if (!entry.phoneLookupHash) continue;
        rosterByCredential.set(credentialKey(entry.canonicalName, entry.phoneLookupHash), {
          id: entry.id,
          name: entry.canonicalName,
          hash: entry.phoneLookupHash,
          isAdmin: entry.isAdmin,
          isActive: entry.isActive,
        });
      }

      const unlinkedUsers = await tx
        .select({ id: users.id, displayName: users.displayName, phoneLookupHash: users.phoneLookupHash })
        .from(users)
        .where(isNull(users.rosterId));
      for (const user of unlinkedUsers) {
        let canonicalName: string;
        try {
          canonicalName = canonicalizeRosterName(user.displayName);
        } catch {
          continue;
        }
        const match = rosterByCredential.get(credentialKey(canonicalName, user.phoneLookupHash));
        if (!match) continue;

        await tx
          .update(users)
          .set({
            rosterId: match.id,
            displayName: match.name,
            normalizedName: match.name.toLocaleLowerCase("ko-KR"),
            phoneLookupHash: match.hash,
            role: match.isAdmin ? "admin" : "member",
            isActive: match.isActive,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id));
      }

      await reconcileUnboundLeaders(tx);
      return plan;
    });
  },
};

type ImportOptions = {
  /** Initial setup only: this person is marked as the administrator. */
  adminName?: string;
  adminPhone?: string;
  adminCredential?: { canonicalName: string; phoneLookupHash: string };
  repository?: RosterImportRepository;
};

function prepareRows(
  rows: ImportCandidate[],
  options: ImportOptions,
): { prepared: PreparedRosterRow[]; adminProvided: boolean; adminMatches: number } {
  const rawAdmin = options.adminCredential
    ? {
        canonicalName: canonicalizeRosterName(options.adminCredential.canonicalName),
        phoneLookupHash: options.adminCredential.phoneLookupHash,
      }
    : options.adminName && options.adminPhone
      ? {
          canonicalName: canonicalizeRosterName(options.adminName),
          phoneLookupHash: phoneLookupHash(normalizeRosterPhone(options.adminPhone)),
        }
      : null;
  let adminMatches = 0;

  const prepared = rows.map((row): PreparedRosterRow => {
    const lookupHash = row.phone ? phoneLookupHash(row.phone) : null;
    const isAdmin =
      rawAdmin !== null &&
      row.canonicalName === rawAdmin.canonicalName &&
      lookupHash !== null &&
      lookupHash === rawAdmin.phoneLookupHash;
    if (isAdmin) adminMatches += 1;

    return {
      sourceRow: row.sourceRow,
      sourceName: row.sourceName,
      canonicalName: row.canonicalName,
      position: row.position,
      phoneLookupHash: lookupHash,
      phoneCiphertext: row.phone ? encryptRosterPhone(row.phone) : null,
      village: row.village,
      sam: row.sam,
      samLabel: row.samLabel,
      isActive: true,
      isAdmin,
      source: "xls",
    };
  });

  return { prepared, adminProvided: rawAdmin !== null, adminMatches };
}

function validateOrThrow(rows: ImportCandidate[]): ImportValidation {
  const validation = validateRosterCandidates(rows);
  if (validation.errors.length > 0) throw new RosterValidationError(validation.errors);
  return validation;
}

export type RosterImportPreview = {
  summary: ImportSummary;
  /** First entries only; the summary has the full counts. */
  added: Array<{ name: string }>;
  updated: Array<{ name: string; changes: string[] }>;
  skipped: Array<{ name: string; sourceRow: number }>;
};

export const PREVIEW_LIST_LIMIT = 30;

const FIELD_LABELS = { position: "직분", village: "마을", sam: "샘" } as const;

export function describeRosterChange(change: RosterChange): string {
  return `${FIELD_LABELS[change.field]}: ${change.before ?? "없음"} → ${change.after}`;
}

/** Shows what an upload would do without changing anything. */
export async function previewRosterImport(
  rows: ImportCandidate[],
  options: { repository?: RosterImportRepository } = {},
): Promise<RosterImportPreview> {
  const validation = validateOrThrow(rows);
  const { prepared } = prepareRows(rows, {});
  const repository = options.repository ?? dbRosterImportRepository;
  const plan = planRosterImport(await repository.loadRoster(), prepared);

  return {
    summary: summarize(plan, rows.length, validation.missingPhone),
    added: plan.adds.slice(0, PREVIEW_LIST_LIMIT).map((row) => ({ name: row.sourceName })),
    updated: plan.updates.slice(0, PREVIEW_LIST_LIMIT).map((update) => ({
      name: update.existing.canonicalName,
      changes: update.changes.map(describeRosterChange),
    })),
    skipped: plan.skipped
      .slice(0, PREVIEW_LIST_LIMIT)
      .map((row) => ({ name: row.sourceName, sourceRow: row.sourceRow })),
  };
}

export async function importRosterCandidates(
  rows: ImportCandidate[],
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const validation = validateOrThrow(rows);
  const { prepared, adminProvided, adminMatches } = prepareRows(rows, options);
  if (adminProvided && adminMatches !== 1) throw new Error("INITIAL_ADMIN_NOT_FOUND");

  const plan = await (options.repository ?? dbRosterImportRepository).applyRoster(prepared);
  return summarize(plan, rows.length, validation.missingPhone);
}
