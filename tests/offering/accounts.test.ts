import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_ACCOUNTS, getOfferingConfig, parseOfferingAccounts } from "../../src/features/offering/accounts";

// Fake numbers only: real account numbers must never be written in this repository.
const A = { title: "주일헌금", bank: "테스트은행", number: "111-22-333333-4", holder: "테스트교회" };
const B = { title: "십일조", bank: "테스트은행", number: "555-66-777777", holder: "테스트교회" };
const json = (value: unknown) => JSON.stringify(value);

describe("OFFERING_ACCOUNTS parsing", () => {
  it("reads a valid list and keeps the order and the exact number text", () => {
    expect(parseOfferingAccounts(json([A, B]))).toEqual({ status: "ready", accounts: [A, B] });
  });

  it("trims and collapses whitespace in the text fields", () => {
    const parsed = parseOfferingAccounts(json([{ ...A, title: "  주일   헌금 ", bank: " 테스트은행 ", number: " 111-22-333333-4 " }]));
    expect(parsed).toMatchObject({ status: "ready" });
    if (parsed.status === "ready") {
      expect(parsed.accounts[0]).toMatchObject({ title: "주일 헌금", bank: "테스트은행", number: "111-22-333333-4" });
    }
  });

  it("is 'missing' when the variable is not set or blank", () => {
    for (const value of [undefined, null, "", "   ", "\n"]) {
      expect(parseOfferingAccounts(value as string | undefined)).toEqual({ status: "missing" });
    }
  });

  it("is 'invalid' for broken JSON or the wrong shape, so nothing is shown", () => {
    const invalid = [
      "not json",
      "[{",
      "{}",
      "null",
      '"text"',
      json([]),
      json({ title: "x" }),
      json([A, "x"]),
      json([1]),
      json([null]),
    ];
    for (const value of invalid) expect(parseOfferingAccounts(value), value).toEqual({ status: "invalid" });
  });

  it("rejects missing, empty, misspelled and extra fields", () => {
    for (const field of ["title", "bank", "number", "holder"] as const) {
      expect(parseOfferingAccounts(json([{ ...A, [field]: "" }])), `empty ${field}`).toEqual({ status: "invalid" });
      expect(parseOfferingAccounts(json([{ ...A, [field]: "   " }])), `blank ${field}`).toEqual({ status: "invalid" });
      const { [field]: _omitted, ...rest } = A;
      void _omitted;
      expect(parseOfferingAccounts(json([rest])), `missing ${field}`).toEqual({ status: "invalid" });
      expect(parseOfferingAccounts(json([{ ...A, [field]: 123 }])), `number ${field}`).toEqual({ status: "invalid" });
    }
    const { number: _n, ...withoutNumber } = A;
    void _n;
    expect(parseOfferingAccounts(json([{ ...withoutNumber, nubmer: "111-22-333333-4" }]))).toEqual({ status: "invalid" });
    expect(parseOfferingAccounts(json([{ ...A, memo: "extra" }]))).toEqual({ status: "invalid" });
  });

  it("only accepts account numbers made of digits and single hyphens, 8 to 20 digits", () => {
    const ok = ["12345678", "111-22-333333-4", "1-2345-6789", "12345678901234567890"];
    for (const number of ok) expect(parseOfferingAccounts(json([{ ...A, number }])), number).toMatchObject({ status: "ready" });
    const bad = ["1234567", "123456789012345678901", "111-22-", "-111-22", "111--22-3333", "111 22 3333", "111-22-33a333", "abc", "１１１-22-3333", "111.22.3333", "+82-111-2222"];
    for (const number of bad) expect(parseOfferingAccounts(json([{ ...A, number }])), number).toEqual({ status: "invalid" });
  });

  it("limits the text lengths and the number of accounts", () => {
    expect(parseOfferingAccounts(json([{ ...A, title: "가".repeat(30) }]))).toMatchObject({ status: "ready" });
    expect(parseOfferingAccounts(json([{ ...A, title: "가".repeat(31) }]))).toEqual({ status: "invalid" });
    expect(parseOfferingAccounts(json([{ ...A, bank: "가".repeat(21) }]))).toEqual({ status: "invalid" });
    expect(parseOfferingAccounts(json([{ ...A, holder: "가".repeat(31) }]))).toEqual({ status: "invalid" });
    const many = (count: number) => Array.from({ length: count }, (_, i) => ({ ...A, title: `종류${i}`, number: `1234-56-${String(i).padStart(6, "0")}` }));
    expect(parseOfferingAccounts(json(many(MAX_ACCOUNTS)))).toMatchObject({ status: "ready" });
    expect(parseOfferingAccounts(json(many(MAX_ACCOUNTS + 1)))).toEqual({ status: "invalid" });
  });

  it("rejects a duplicated number or title (a copy-and-paste slip)", () => {
    expect(parseOfferingAccounts(json([A, { ...B, number: A.number }]))).toEqual({ status: "invalid" });
    expect(parseOfferingAccounts(json([A, { ...B, title: A.title }]))).toEqual({ status: "invalid" });
  });

  it("reads the variable at request time and never leaks the value when it is wrong", () => {
    const previous = process.env.OFFERING_ACCOUNTS;
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    try {
      process.env.OFFERING_ACCOUNTS = json([A]);
      expect(getOfferingConfig()).toMatchObject({ status: "ready" });
      process.env.OFFERING_ACCOUNTS = `[{"secret":"${A.number}"`;
      expect(getOfferingConfig()).toEqual({ status: "invalid" });
      expect(JSON.stringify(warnings)).not.toContain(A.number);
      delete process.env.OFFERING_ACCOUNTS;
      expect(getOfferingConfig()).toEqual({ status: "missing" });
    } finally {
      console.warn = original;
      if (previous === undefined) delete process.env.OFFERING_ACCOUNTS;
      else process.env.OFFERING_ACCOUNTS = previous;
    }
  });
});

const read = (path: string) => readFileSync(path, "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next" || name === "vendor") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|md|mjs|json|sql|css|env|example)$/.test(name) ? [path] : [];
  });
}

describe("offering page contracts", () => {
  it("never commits an account number: only code and docs are scanned, tests use fake numbers", () => {
    // Korean bank accounts look like 3-2-6 digits (+ an optional check digit); phone numbers (3-4-4) do not match.
    const accountLike = /\b\d{3}-\d{2}-\d{5,8}(?:-\d{1,2})?\b/g;
    // The only numbers allowed in docs and the example file are these obvious placeholders.
    const placeholders = ["000-00-000000", "000-00-000001"];
    const roots = ["app", "components", "src", "docs", "drizzle", "scripts", "public"];
    const offenders = [...roots.flatMap((root) => sourceFiles(root)), ".env.example"]
      .filter((file) => !file.includes("docs/superpowers"))
      .filter((file) => {
        const text = placeholders.reduce((acc, value) => acc.split(value).join(""), read(file));
        return accountLike.test(text);
      });
    expect(offenders).toEqual([]);
  });

  it("is public, dynamic, and has no way to change an account from the web", () => {
    const page = read("app/offering/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).not.toMatch(/requireAdmin|getCurrentSessionUser|redirect\(/);
    expect(read("app/offering/layout.tsx")).not.toMatch(/redirect\(/);
    expect(statSync("app/offering").isDirectory()).toBe(true);
    // No API route and no admin screen for offering accounts exist.
    expect(() => statSync("app/api/offering")).toThrow();
    expect(() => statSync("app/api/admin/offering")).toThrow();
    expect(() => statSync("app/admin/offering")).toThrow();
  });

  it("shows nothing but a notice when the accounts are not ready", () => {
    const page = read("app/offering/page.tsx");
    expect(page).toContain('config.status === "ready"');
    expect(page).toContain("준비 중");
  });

  it("the copy button copies only the account number", () => {
    const button = read("components/offering/CopyAccountButton.tsx");
    expect(button).toContain("copyText(number)");
    expect(read("app/offering/page.tsx")).toContain("<CopyAccountButton number={account.number}");
    const copy = read("src/features/offering/copy.ts");
    expect(copy).toContain("navigator.clipboard");
    expect(copy).toContain('execCommand("copy")');
  });

  it("the menus, public header and login page link to it", () => {
    expect(read("components/app/MemberSidebar.tsx")).toContain('href: "/offering"');
    expect(read("app/(public)/layout.tsx")).toContain('href="/offering"');
    expect(read("app/login/page.tsx")).toContain('href="/offering"');
  });

  it("the variable is documented by name only", () => {
    expect(read(".env.example")).toContain("OFFERING_ACCOUNTS=");
  });
});
