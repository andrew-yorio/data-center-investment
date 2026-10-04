import { BRAND_NAME, CONTACT_EMAIL } from "../../shared/brand";
import { Disclaimer } from "./Disclaimer";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="on-dark gutter bg-night-950 py-16 text-white md:py-20">
      <div className="mx-auto grid max-w-[96rem] gap-10 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo />
          <p className="mt-4">
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4 hover:text-white/80">{CONTACT_EMAIL}</a>
          </p>
          <p className="mt-2">
            <a href="/privacy.html" className="underline underline-offset-4 hover:text-white/80">Privacy policy</a>
          </p>
        </div>
        <div className="md:col-span-8 lg:col-span-7 lg:col-start-6">
          <Disclaimer tone="dark" />
          <p className="mt-8 text-small text-white/65">© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
