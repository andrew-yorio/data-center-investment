import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { scrollToId } from "../lib/scroll";

/** Fixed header. The "Join the list" control stays reachable through the whole 3D sequence. */
export function Header() {
  const [onDark, setOnDark] = useState(true);

  useEffect(() => {
    const intro = document.getElementById("intro");
    if (!intro) return;
    // Dark treatment while the intro stage is behind the header, light afterwards.
    const io = new IntersectionObserver(([entry]) => setOnDark(entry.isIntersecting), {
      rootMargin: "0px 0px -100% 0px",
    });
    io.observe(intro);
    return () => io.disconnect();
  }, []);

  return (
    <header
      className={`gutter fixed inset-x-0 top-0 z-50 flex items-center justify-between py-4 transition-colors duration-150 ${
        onDark ? "on-dark bg-night-950/70 text-white backdrop-blur-sm" : "bg-paper/92 text-ink shadow-[0_1px_0_var(--color-rule)] backdrop-blur-sm"
      }`}
    >
      <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }); }}>
        <Logo />
      </a>
      <nav aria-label="Primary" className="flex items-center gap-6">
        <a href="#how-it-works" className="hidden text-small underline-offset-4 hover:underline md:inline" onClick={(e) => { e.preventDefault(); scrollToId("how-it-works"); }}>
          How it works
        </a>
        <a href="#risks" className="hidden text-small underline-offset-4 hover:underline md:inline" onClick={(e) => { e.preventDefault(); scrollToId("risks"); }}>
          Risks
        </a>
        <a href="#faq" className="hidden text-small underline-offset-4 hover:underline md:inline" onClick={(e) => { e.preventDefault(); scrollToId("faq"); }}>
          FAQ
        </a>
        <a
          href="#signup"
          onClick={(e) => { e.preventDefault(); scrollToId("signup"); }}
          className={`rounded-full px-5 py-2.5 text-small font-semibold transition-[background-color,color] duration-150 ease-crisp ${
            onDark ? "bg-white text-ink hover:bg-paper" : "bg-ink text-white hover:bg-night-800"
          }`}
        >
          Join the list
        </a>
      </nav>
    </header>
  );
}
