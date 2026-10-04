import { Section } from "./Section";

const STEPS = [
  {
    title: "Register interest",
    body: "Tell us roughly how much you might invest. Nothing is paid and nothing is binding.",
  },
  {
    title: "Get the details",
    body: "We share project details, including location, timeline and terms, as they're finalized.",
  },
  {
    title: "Decide when it's real",
    body: "If an official round opens, it will be through a registered funding portal. We'll let you know, and you decide then.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" title="How it works" intro="Three steps. Only the last one involves a decision, and it can't happen on this site.">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[4.5rem_1fr] gap-x-6 border-t border-rule py-8 first:border-ink first:border-t-2 sm:grid-cols-[7rem_1fr] md:py-10">
            <span aria-hidden="true" className="font-condensed text-[3.5rem] leading-none text-ink sm:text-[5rem]">
              {i + 1}
            </span>
            <div className="pt-1">
              <h3 className="font-heading text-h3">
                <span className="sr-only">Step {i + 1}: </span>
                {s.title}
              </h3>
              <p className="measure mt-3 text-body-lg text-ink-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t-2 border-ink pt-6 font-heading text-h3">No money changes hands here. Not now, and not through this site.</p>
    </Section>
  );
}
