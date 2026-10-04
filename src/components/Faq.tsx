import type { ReactNode } from "react";
import { CONTACT_EMAIL } from "../../shared/brand";
import { Section } from "./Section";

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "Is this an investment offer?",
    a: "No. This site only gauges interest. No securities are being offered or sold here, and we can't accept any money. If an offering happens, it will open later through a registered funding portal.",
  },
  {
    q: "Am I committing to anything?",
    a: "No. Joining the list is a non-binding indication of interest. You're not obligated to invest, and you can ask us to remove your information at any time.",
  },
  {
    q: "What happens after I sign up?",
    a: "We email you a link to confirm your address. Once you confirm, you're on the list. We'll send updates as project details are finalized, and first notice if an official round opens. You decide then, with the full offering documents in front of you.",
  },
  {
    q: "Who will be able to invest, and is there a minimum?",
    a: "To be announced. Eligibility, any minimum amount and any limits will be set out in the official offering documents, and the funding portal will run its own identity checks.",
  },
  {
    q: "Where and when will the data center be built?",
    a: "Site selection is underway and the timeline is still to be announced. We'll share both with the list once they're settled.",
  },
  {
    q: "How is my information used and protected?",
    a: (
      <>
        We store your name, email, interest range and the IP address and browser details your sign-up came from. We use your IP address to
        prevent spam and abuse. We only use your details to contact you about this project, and we don't sell them. Data is stored in an
        access-restricted database. The <a href="/privacy.html" className="font-semibold text-ink underline underline-offset-4">privacy policy</a> has the full details.
      </>
    ),
  },
  {
    q: "How do I remove my information?",
    a: (
      <>
        Email <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-ink underline underline-offset-4">{CONTACT_EMAIL}</a> from the address you
        signed up with and ask us to delete your information. We'll confirm when it's done.
      </>
    ),
  },
];

export function Faq() {
  return (
    <Section id="faq" title="Questions" intro="Straight answers. If yours isn't here, email us.">
      <div className="border-b border-rule">
        {FAQS.map((f) => (
          <details key={f.q} className="group border-t border-rule">
            <summary className="flex cursor-pointer items-start justify-between gap-6 py-6 font-heading text-h3 hover:text-night-600">
              <span>{f.q}</span>
              <span aria-hidden="true" className="relative mt-2 size-4 shrink-0">
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-current" />
                <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-current group-open:hidden" />
              </span>
            </summary>
            <div className="measure pb-7 text-body-lg text-ink-muted">{f.a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}
