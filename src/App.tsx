import { useEffect } from "react";
import { Header } from "./components/Header";
import { Intro } from "./components/Intro";
import { HowItWorks } from "./components/HowItWorks";
import { Risks } from "./components/Risks";
import { Faq } from "./components/Faq";
import { Signup } from "./components/Signup";
import { Footer } from "./components/Footer";
import { startLenis } from "./lib/scroll";
import { usePrefersReducedMotion } from "./lib/motion";

export default function App() {
  const reduced = usePrefersReducedMotion();
  useEffect(() => (reduced ? undefined : startLenis()), [reduced]);

  return (
    <>
      <a href="#main" className="sr-only z-[60] bg-white px-4 py-3 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Header />
      <Intro />
      <main id="main" tabIndex={-1} className="outline-none">
        <HowItWorks />
        <Risks />
        <Faq />
        <Signup />
      </main>
      <Footer />
    </>
  );
}
