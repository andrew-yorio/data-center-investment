import type { InvestmentRange } from "../shared/brand";

// Common disposable / throwaway inbox providers. Flagged for review, never rejected.
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "anonaddy.me", "burnermail.io",
  "byom.de", "dispostable.com", "discard.email", "dropmail.me", "emailondeck.com", "fakeinbox.com",
  "fakemail.net", "getairmail.com", "getnada.com", "guerrillamail.biz", "guerrillamail.com",
  "guerrillamail.de", "guerrillamail.info", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "harakirimail.com", "inboxbear.com", "inboxkitten.com", "incognitomail.org", "jetable.org", "mail.tm",
  "mail-temp.com", "mailcatch.com", "maildrop.cc", "mailinator.com", "mailinator.net", "mailinator2.com",
  "mailnesia.com", "mailpoof.com", "mailsac.com", "mintemail.com", "moakt.com", "mohmal.com", "mytemp.email",
  "nada.email", "sharklasers.com", "spam4.me", "spambog.com", "spamgourmet.com", "temp-mail.io",
  "temp-mail.org", "tempail.com", "tempinbox.com", "tempmail.com", "tempmail.dev", "tempmail.net",
  "tempmailo.com", "tempr.email", "throwawaymail.com", "trash-mail.com", "trashmail.com", "trashmail.de",
  "trashmail.net", "wegwerfmail.de", "yopmail.com", "yopmail.fr", "yopmail.net", "grr.la", "emailfake.com",
  "fakemailgenerator.com", "minutemail.com", "tmail.ws", "tmpmail.org", "tmpmail.net", "1secmail.com",
  "1secmail.net", "1secmail.org", "linshiyouxiang.net", "spamdecoy.net", "mailforspam.com",
]);

const JOKE_NAMES = new Set([
  "test", "testing", "tester", "asdf", "asdfgh", "qwerty", "foo", "bar", "foobar", "john doe", "jane doe",
  "fake", "fake name", "no name", "noname", "anonymous", "anon", "user", "admin", "null", "undefined", "none",
  "n/a", "na", "abc", "xxx", "aaa", "elon musk", "mickey mouse", "donald duck", "bruce wayne", "tony stark",
  "batman", "santa claus", "your mom", "ur mom", "deez nuts", "joe mama", "ligma", "hugh jass", "ben dover",
  "mike hunt", "mike oxlong", "seymour butts", "amanda hugginkiss", "bob", "lol", "lmao",
]);

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // Catch subdomains of known providers, e.g. foo.mailinator.com.
  return [...DISPOSABLE_DOMAINS].some((d) => domain.endsWith(`.${d}`));
}

/** Heuristic only. Real names are wildly varied, so this errs toward missing fakes rather than flagging real people. */
export function looksFake(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (JOKE_NAMES.has(n)) return true;
  const letters = n.replace(/[^\p{L}]/gu, "");
  if (letters.length < 2) return true;
  if (/\d/.test(n)) return true;
  if (/(.)\1{3,}/u.test(n)) return true; // aaaa, zzzzz
  if (/(asdf|qwer|zxcv|hjkl|jkl;|uiop)/.test(n)) return true;
  // Long run of Latin consonants with no vowel, e.g. "xkcdqwrt".
  if (/^[a-z]+$/.test(letters) && letters.length >= 6 && !/[aeiouy]/.test(letters)) return true;
  return false;
}

export function flagSignup(name: string, email: string, range: InvestmentRange): string | null {
  const reasons: string[] = [];
  if (isDisposableEmail(email)) reasons.push("disposable_email_domain");
  if (range === "10000_plus" && looksFake(name)) reasons.push("high_range_suspicious_name");
  return reasons.length ? reasons.join(",") : null;
}
