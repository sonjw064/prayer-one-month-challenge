/** Shared by the server and the browser; keep it free of server-only imports. */
export type SamRegistration = {
  id: string;
  name: string;
  leaderName: string;
  isActive: boolean;
  /** Active people whose roster sam is this sam. */
  members: number;
  /** Pastoral reports submitted for this sam. A sam with reports cannot be deleted (only archived). */
  reports: number;
  /** Saved attendance sheets. They are kept when the sam is deleted. */
  attendanceSessions: number;
};

export type VillageRegistration = {
  id: string;
  name: string;
  village: string;
  leaderName: string;
  isActive: boolean;
  members: number;
};

export type RegistrationList = {
  sams: SamRegistration[];
  villages: VillageRegistration[];
};

export type RegistrationKind = "sam" | "village";
export type RegistrationAction = "delete" | "archive" | "restore";

export type RegistrationResult = { processed: number; skipped: number };

export const CONFIRM_DELETE = "삭제";
export const CONFIRM_RESET = "초기화";

export function canDeleteSam(sam: Pick<SamRegistration, "reports">): boolean {
  return sam.reports === 0;
}
