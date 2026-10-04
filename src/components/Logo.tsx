import { BRAND_NAME, LOGO_SRC } from "../../shared/brand";

/** The brand mark. Renders the logo file when LOGO_SRC is set, otherwise the name as a wordmark. Height is fixed so swapping in the file doesn't shift layout. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-8 items-center ${className}`}>
      {LOGO_SRC ? (
        <img src={LOGO_SRC} alt={BRAND_NAME} className="h-full w-auto max-w-48 object-contain" />
      ) : (
        <span className="font-heading text-xl tracking-tight">{BRAND_NAME}</span>
      )}
    </span>
  );
}
