/** Swap the brand here. Everything (page, emails, disclaimer, footer) reads from this file. */
export const BRAND_NAME = "Placeholder";

/** Public contact address shown in the footer, FAQ and privacy policy. */
export const CONTACT_EMAIL = "hello@example.com";

/** Legal operator named in the privacy policy. Replace before launch. */
export const LEGAL_ENTITY = "[Legal entity name], [postal address]";

/** Values stored in signups.investment_range, with their display labels. */
export const INVESTMENT_RANGES = [
  { value: "under_500", label: "Under $500" },
  { value: "500_2500", label: "$500 – $2,500" },
  { value: "2500_10000", label: "$2,500 – $10,000" },
  { value: "10000_plus", label: "$10,000+" },
  { value: "not_sure", label: "Not sure yet" },
] as const;

export type InvestmentRange = (typeof INVESTMENT_RANGES)[number]["value"];

export const NAME_MAX = 120;

export const ACKNOWLEDGMENT_TEXT = "I understand this is a non-binding indication of interest.";

export function disclaimer(brand: string = BRAND_NAME): string {
  return `${brand} is considering a securities offering and is testing interest. No money or other consideration is being solicited, and if sent, it will not be accepted. No offer to buy securities will be accepted and no part of the purchase price will be received until an offering statement is filed and only through a registered intermediary's platform. An indication of interest involves no obligation or commitment of any kind. Investing involves risk, including possible loss of your entire investment.`;
}
