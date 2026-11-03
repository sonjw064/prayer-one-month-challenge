export type SignupStatus = "pending" | "approved" | "rejected";

export type SignupRequestRow = {
  id: string;
  name: string;
  /** Formatted phone number; null once the request has been decided. */
  phone: string | null;
  memo: string;
  status: SignupStatus;
  createdAt: string;
  decidedAt: string | null;
  /** A roster entry with the same name and phone already exists. */
  alreadyInRoster: boolean;
};

export type AdminSignupList = {
  pending: SignupRequestRow[];
  recent: SignupRequestRow[];
};

export type SignupRequestInput = {
  name: string;
  canonicalName: string;
  /** Digits only. */
  phone: string;
  memo: string;
  /** The hidden bot-trap field was filled in. */
  honeypot: boolean;
};

export type SignupApproval = {
  position: string | null;
  village: string | null;
  sam: string | null;
};

export type SignupDecision =
  | { action: "approve"; approval: SignupApproval }
  | { action: "reject" };
