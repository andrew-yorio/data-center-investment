/**
 * Checks that an email address's domain is set up to receive mail (has an MX
 * record), using Cloudflare's DNS-over-HTTPS resolver. This catches typo and
 * made-up domains; it can't tell whether the mailbox itself exists.
 *
 * Fails open: if the lookup itself errors or times out, the address is allowed.
 */
export async function domainAcceptsMail(email: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  try {
    const res = await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return true;
    const data = (await res.json()) as { Status: number; Answer?: { type: number; data: string }[] };
    if (data.Status === 3) return false; // NXDOMAIN: the domain doesn't exist
    if (data.Status !== 0) return true; // resolver trouble (SERVFAIL etc.): don't block on it
    const mx = (data.Answer ?? []).filter((a) => a.type === 15).map((a) => a.data.trim());
    // "0 ." is a null MX (RFC 7505): the domain explicitly accepts no mail.
    return mx.some((rr) => !/^\d+\s+\.$/.test(rr));
  } catch {
    return true;
  }
}

/** Common misspellings of big providers. Some of these have MX records (typosquatters), so the MX check alone won't catch them. */
const TYPO_DOMAINS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmaill.com": "gmail.com", "gnail.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmal.com": "gmail.com", "gmali.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.co": "hotmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.co": "yahoo.com", "yhoo.com": "yahoo.com",
  "outlok.com": "outlook.com", "outllok.com": "outlook.com", "outlook.co": "outlook.com",
  "iclod.com": "icloud.com", "icoud.com": "icloud.com", "icloud.co": "icloud.com",
};

/** The intended domain if the address uses a known misspelling of a big provider, e.g. gmial.com → gmail.com. */
export function typoDomainSuggestion(email: string): string | null {
  return TYPO_DOMAINS[email.slice(email.lastIndexOf("@") + 1).toLowerCase()] ?? null;
}
