/** Shared by the server and the browser; keep it free of server-only imports. */
export const ATTENDANCE_STATUSES = ["present", "absent", "worship_only"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "출석",
  absent: "불참",
  worship_only: "예배",
};

export type AttendanceMember = { id: string; name: string; status: AttendanceStatus | null };

export type AttendanceSamOption = { id: string; name: string; village: string };

export type AttendanceView = {
  sams: AttendanceSamOption[];
  sam: { id: string; name: string } | null;
  date: string;
  range: { min: string; max: string };
  members: AttendanceMember[];
  /** ISO time of the last save for this sam and date; null when nothing was saved yet. */
  savedAt: string | null;
};
