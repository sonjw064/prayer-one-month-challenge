/** Shared by the server and the browser; keep it free of server-only imports. */
export const STREAK_ALERT = 5;

export type Totals = {
  /** Number of saved sam sheets (sam + date). */
  sessions: number;
  /** Sum of the sam head counts recorded at save time: the denominator for "of everyone" rates. */
  headcount: number;
  present: number;
  absent: number;
  worshipOnly: number;
  checked: number;
  unchecked: number;
  /** present / headcount */
  presentRate: number | null;
  /** present / checked */
  presentRateOfChecked: number | null;
  /** (present + worship only) / headcount */
  attendRate: number | null;
};

export type GroupTotals = { key: string; name: string; village: string; totals: Totals };
export type MonthTotals = { month: string; totals: Totals };

export type SubmissionRow = { samId: string; name: string; village: string; weeks: boolean[] };

export type PersonStat = {
  rosterId: string;
  name: string;
  samLabel: string | null;
  present: number;
  absent: number;
  worshipOnly: number;
  checked: number;
  /** Most recent run of consecutive recorded absences. */
  streak: number;
  lastDate: string;
  lastMemo: string;
  alert: boolean;
};

export type AttendanceStats = {
  range: { from: string; to: string };
  filters: { villages: string[]; sams: Array<{ id: string; name: string; village: string }> };
  totals: Totals;
  monthly: MonthTotals[];
  villages: GroupTotals[];
  sams: GroupTotals[];
  submission: { weeks: string[]; rows: SubmissionRow[] };
  people: { threshold: number; alerts: PersonStat[]; rows: PersonStat[] };
};

export function formatRate(value: number | null): string {
  return value === null ? "-" : `${(value * 100).toFixed(1)}%`;
}
