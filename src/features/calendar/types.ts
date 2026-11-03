export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  location: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD, same as startDate for a single-day event */
  endDate: string;
  /** HH:MM, null for an all-day event */
  startTime: string | null;
  endTime: string | null;
  /** Highlighted in red for members. */
  isImportant: boolean;
};

export type CalendarEventInput = {
  title: string;
  description: string;
  location: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  isImportant: boolean;
  notify: boolean;
};

export type PushStatus = "sent" | "failed" | "skipped";
