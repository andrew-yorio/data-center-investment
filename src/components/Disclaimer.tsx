import { disclaimer } from "../../shared/brand";

export function Disclaimer({ className = "", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <p
      className={`text-small ${tone === "light" ? "border-l-4 border-ink bg-surface p-5 text-ink sm:p-6" : "text-white/80"} ${className}`}
    >
      {disclaimer()}
    </p>
  );
}
