import { DomainError } from "../../lib/http";
import {
  importRosterCandidates,
  parseRosterWorkbookBuffer,
  previewRosterImport,
  type ImportSummary,
  type RosterImportPreview,
  type RosterImportRepository,
} from "../roster/import";

export const MAX_ROSTER_FILE_BYTES = 2 * 1024 * 1024;

export function validateRosterUploadMeta({
  name,
  size,
}: {
  name: string;
  size: number;
}): void {
  if (!/\.xlsx?$/i.test(name)) {
    throw new DomainError("ROSTER_FILE_TYPE", 400);
  }
  if (size <= 0 || size > MAX_ROSTER_FILE_BYTES) {
    throw new DomainError("ROSTER_FILE_TOO_LARGE", 413);
  }
}

export async function importRosterUploadBuffer({
  buffer,
  repository,
}: {
  buffer: Buffer;
  repository?: RosterImportRepository;
}): Promise<ImportSummary> {
  return importRosterCandidates(parseRosterWorkbookBuffer(buffer), { repository });
}

export async function previewRosterUploadBuffer({
  buffer,
  repository,
}: {
  buffer: Buffer;
  repository?: RosterImportRepository;
}): Promise<RosterImportPreview> {
  return previewRosterImport(parseRosterWorkbookBuffer(buffer), { repository });
}
