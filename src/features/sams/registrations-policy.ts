import { z } from "zod";
import { DomainError } from "../../lib/http";
import {
  CONFIRM_DELETE,
  CONFIRM_RESET,
  type RegistrationAction,
  type RegistrationKind,
} from "./registrations-types";

export const MAX_IDS = 500;

export type RegistrationChange = {
  kind: RegistrationKind;
  action: RegistrationAction;
  ids: string[];
  confirm: string;
};

const changeSchema = z.object({
  kind: z.enum(["sam", "village"]),
  action: z.enum(["delete", "archive", "restore"]),
  ids: z.array(z.string().uuid()).min(1).max(MAX_IDS),
  confirm: z.string().max(20).nullish(),
});

export function parseRegistrationChange(raw: unknown): RegistrationChange {
  const parsed = changeSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("INVALID_INPUT", 400);
  const ids = [...new Set(parsed.data.ids)];
  const change = { ...parsed.data, ids, confirm: (parsed.data.confirm ?? "").trim() };
  assertConfirmed(change);
  return change;
}

/** Deleting more than one registration needs the typed confirmation word, enforced on the server too. */
export function assertConfirmed(change: Pick<RegistrationChange, "action" | "ids" | "confirm">): void {
  if (change.action === "delete" && change.ids.length > 1 && change.confirm !== CONFIRM_DELETE) {
    throw new DomainError("CONFIRM_REQUIRED", 400);
  }
}

export function parseResetRequest(raw: unknown): void {
  const parsed = z.object({ confirm: z.string().max(20) }).safeParse(raw);
  if (!parsed.success || parsed.data.confirm.trim() !== CONFIRM_RESET) {
    throw new DomainError("CONFIRM_REQUIRED", 400);
  }
}
