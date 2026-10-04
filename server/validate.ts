import { INVESTMENT_RANGES, NAME_MAX, type InvestmentRange } from "../shared/brand";

export interface SignupInput {
  name: string;
  email: string;
  investmentRange: InvestmentRange;
  acknowledged: true;
  turnstileToken: string;
}

export type FieldErrors = Partial<Record<"name" | "email" | "investmentRange" | "acknowledged" | "turnstileToken", string>>;

// Deliberately simple: one @, no spaces, a dot in the domain. The confirmation email is the real check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RANGE_VALUES = new Set<string>(INVESTMENT_RANGES.map((r) => r.value));

export function validateSignup(body: unknown): { ok: true; value: SignupInput } | { ok: false; errors: FieldErrors } {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const name = typeof b.name === "string" ? b.name.trim().replace(/\s+/g, " ") : "";
  if (!name) errors.name = "Please enter your name.";
  else if (name.length > NAME_MAX) errors.name = `Please keep your name under ${NAME_MAX} characters.`;

  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (!email) errors.email = "Please enter your email address.";
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = "Please enter a valid email address.";

  const investmentRange = typeof b.investmentRange === "string" ? b.investmentRange : "";
  if (!RANGE_VALUES.has(investmentRange)) errors.investmentRange = "Please choose a range.";

  if (b.acknowledged !== true) errors.acknowledged = "Please confirm you understand this is non-binding.";

  const turnstileToken = typeof b.turnstileToken === "string" ? b.turnstileToken : "";
  if (!turnstileToken || turnstileToken.length > 2048) errors.turnstileToken = "Please complete the verification.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, email, investmentRange: investmentRange as InvestmentRange, acknowledged: true, turnstileToken },
  };
}
