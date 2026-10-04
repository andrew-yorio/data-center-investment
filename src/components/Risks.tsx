import { Disclaimer } from "./Disclaimer";
import { Section } from "./Section";

const RISKS = [
  {
    title: "It's early.",
    body: "This project is at the planning stage. Plans, partners and costs can change, and the project might not go ahead at all.",
  },
  {
    title: "No site or timeline is final.",
    body: "Site selection is underway. We don't yet know where the data center will be built or when.",
  },
  {
    title: "Returns are not guaranteed.",
    body: "A data center can earn less than expected, take longer to become profitable, or never become profitable.",
  },
  {
    title: "You could lose money.",
    body: "If an offering opens and you invest, you could lose some or all of what you put in. Shares in a private project may also be hard to sell.",
  },
];

export function Risks() {
  return (
    <Section
      id="risks"
      title="Risks and disclosures"
      className="bg-surface"
      intro="Read this before you join the list. We'd rather you hear it now than later."
    >
      <dl className="grid gap-x-10 sm:grid-cols-2">
        {RISKS.map((r) => (
          <div key={r.title} className="border-t border-rule py-6">
            <dt className="font-heading text-h3">{r.title}</dt>
            <dd className="mt-2 text-body-lg text-ink-muted">{r.body}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-12 mb-4 font-heading text-h3">Required disclaimer</h3>
      <Disclaimer className="bg-paper" />
    </Section>
  );
}
