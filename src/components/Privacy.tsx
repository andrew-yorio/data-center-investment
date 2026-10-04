import type { ReactNode } from "react";
import { BRAND_NAME, CONTACT_EMAIL, LEGAL_ENTITY } from "../../shared/brand";
import { Footer } from "./Footer";
import { Logo } from "./Logo";

const LAST_UPDATED = "October 3, 2026";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule py-8">
      <h2 className="font-heading text-h3">{title}</h2>
      <div className="mt-3 space-y-4 text-body-lg text-ink-muted [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </section>
  );
}

export function Privacy() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <>
      <header className="gutter border-b border-rule py-4">
        <a href="/"><Logo /></a>
      </header>
      <main className="gutter section-pad">
        <div className="mx-auto max-w-[72ch]">
          <h1 className="font-heading text-h2">Privacy policy</h1>
          <p className="mt-4 text-ink-muted">Last updated {LAST_UPDATED}.</p>
          <p className="mt-8 text-body-lg">
            This policy explains what {BRAND_NAME} collects when you register interest on this site, why, and how to have it deleted.
          </p>

          <Block title="What we collect">
            <ul>
              <li>Your name and email address.</li>
              <li>The investment range you chose, and your acknowledgment that this is non-binding.</li>
              <li>The IP address your sign-up came from, taken from the connection by our hosting provider. We never ask you for it. It is stored with your sign-up and deleted with it.</li>
              <li>Your browser's user-agent string (the browser and operating system name it reports).</li>
              <li>Whether and when you confirmed your email address.</li>
            </ul>
            <p>We do not collect payment details, Social Security numbers or any government ID. If an offering opens, identity checks happen on the registered funding portal, under that portal's own privacy policy.</p>
          </Block>

          <Block title="Why we collect it">
            <ul>
              <li>Your name, email and range let us gauge interest in the project and contact you about it.</li>
              <li>IP addresses and user-agent strings help us prevent spam, automated sign-ups and abuse, including limiting how many sign-ups come from one address.</li>
              <li>Email confirmation makes sure the person who signed up controls that email address.</li>
            </ul>
            <p>We only email you about this project. We don't sell or rent your information, and we don't use it for advertising.</p>
          </Block>

          <Block title="Who processes it">
            <p>We use a small number of service providers to run this site, and each one only handles data needed for its job:</p>
            <ul>
              <li>Cloudflare hosts the site and runs Turnstile, a check that tells people from bots. Turnstile processes technical data about your browser.</li>
              <li>Supabase stores sign-ups in an access-restricted database.</li>
              <li>An email delivery provider sends the confirmation email and updates.</li>
            </ul>
            <p>This site does not use analytics or advertising cookies. Fonts are served from our own domain.</p>
          </Block>

          <Block title="How long we keep it">
            <p>Unconfirmed sign-ups are deleted after 30 days. Confirmed sign-ups, including the stored IP address, are kept until this interest-gauging phase ends (when an offering opens or the project is abandoned) or until you ask us to delete them, whichever comes first. Rate-limiting records of IP addresses are deleted after 24 hours.</p>
          </Block>

          <Block title="Deleting or correcting your information">
            <p>Email {mail} from the address you signed up with and tell us what you'd like deleted or corrected. We'll confirm when it's done. You can also reply to any email from us to stop further messages.</p>
          </Block>

          <Block title="Your rights">
            <p>Depending on where you live, including California and other US states with privacy laws, you may have the right to know what personal information we hold about you, get a copy of it, correct it, and have it deleted. We don't sell or share personal information for advertising. To use any of these rights, email {mail}. We won't treat you differently for doing so.</p>
          </Block>

          <Block title="Contact">
            <p>This site is operated by {LEGAL_ENTITY}. Questions about this policy: {mail}.</p>
          </Block>
        </div>
      </main>
      <Footer />
    </>
  );
}
