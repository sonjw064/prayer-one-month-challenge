import { z } from "zod";

/**
 * Offering (헌금) accounts are NOT stored in the code or the database. They come from the
 * `OFFERING_ACCOUNTS` environment variable (set in the Vercel project settings), so only people with
 * access to that project can change them and no account number is ever committed to the repository.
 */
export type OfferingAccount = {
  /** Offering type, e.g. 주일헌금. */
  title: string;
  bank: string;
  /** Shown and copied exactly as written (digits and hyphens). */
  number: string;
  holder: string;
};

export type OfferingConfig =
  | { status: "ready"; accounts: OfferingAccount[] }
  /** The variable is not set (or empty). */
  | { status: "missing" }
  /** The variable is set but wrong: nothing is shown rather than a possibly wrong number. */
  | { status: "invalid" };

export const MAX_ACCOUNTS = 10;
export const MIN_DIGITS = 8;
export const MAX_DIGITS = 20;

const text = (max: number) =>
  z
    .string()
    .transform((value) => value.normalize("NFC").replace(/\s+/gu, " ").trim())
    .pipe(z.string().min(1).max(max));

const accountSchema = z
  .object({
    title: text(30),
    bank: text(20),
    number: z
      .string()
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .regex(/^\d+(?:-\d+)*$/u)
          .refine((value) => {
            const digits = value.replace(/-/gu, "").length;
            return digits >= MIN_DIGITS && digits <= MAX_DIGITS;
          }),
      ),
    holder: text(30),
  })
  // A misspelled field name (e.g. "nubmer") must fail loudly instead of being ignored.
  .strict();

const listSchema = z.array(accountSchema).min(1).max(MAX_ACCOUNTS);

export function parseOfferingAccounts(raw: string | null | undefined): OfferingConfig {
  if (raw === undefined || raw === null || raw.trim() === "") return { status: "missing" };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { status: "invalid" };
  }

  const parsed = listSchema.safeParse(json);
  if (!parsed.success) return { status: "invalid" };

  const accounts = parsed.data;
  // The same number or the same title twice is almost certainly a copy-and-paste mistake.
  const numbers = new Set(accounts.map((account) => account.number));
  const titles = new Set(accounts.map((account) => account.title));
  if (numbers.size !== accounts.length || titles.size !== accounts.length) return { status: "invalid" };

  return { status: "ready", accounts };
}

/** Read at request time so a redeploy with a new value is all that is needed. */
export function getOfferingConfig(): OfferingConfig {
  const config = parseOfferingAccounts(process.env.OFFERING_ACCOUNTS);
  if (config.status === "invalid") {
    // Visible in the Vercel logs for the maker; never shown to visitors and never includes the value.
    console.warn("OFFERING_ACCOUNTS is set but invalid; the offering page shows a preparing notice.");
  }
  return config;
}
