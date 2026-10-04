import type { ReactNode } from "react";

/** Shared editorial layout: heading anchored in the left columns, content in the right. */
export function Section({
  id,
  title,
  intro,
  children,
  className = "",
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`section-pad gutter scroll-mt-16 ${className}`}>
      <div className="mx-auto grid max-w-[96rem] gap-x-8 gap-y-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 id={`${id}-title`} tabIndex={-1} className="font-heading text-h2 outline-none">
            {title}
          </h2>
          {intro && <div className="measure mt-6 text-body-lg text-ink-muted">{intro}</div>}
        </div>
        <div className="lg:col-span-7 lg:col-start-6">{children}</div>
      </div>
    </section>
  );
}
