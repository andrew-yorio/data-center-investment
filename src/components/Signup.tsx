import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ACKNOWLEDGMENT_TEXT, CONTACT_EMAIL, INVESTMENT_RANGES, NAME_MAX } from "../../shared/brand";
import { Disclaimer } from "./Disclaimer";
import { useTurnstile } from "../lib/turnstile";

type Field = "name" | "email" | "investmentRange" | "acknowledged" | "turnstileToken";
type Errors = Partial<Record<Field, string>>;
type Values = { name: string; email: string; investmentRange: string; acknowledged: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v: Values): Errors {
  const e: Errors = {};
  const name = v.name.trim();
  if (!name) e.name = "Please enter your name.";
  else if (name.length > NAME_MAX) e.name = `Please keep your name under ${NAME_MAX} characters.`;
  const email = v.email.trim();
  if (!email) e.email = "Please enter your email address.";
  else if (!EMAIL_RE.test(email)) e.email = "Please enter a valid email address, like name@example.com.";
  if (!v.investmentRange) e.investmentRange = "Please choose a range. \"Not sure yet\" is fine.";
  if (!v.acknowledged) e.acknowledged = "Please confirm you understand this is non-binding.";
  return e;
}

const CONFIRM_MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  confirmed: { tone: "ok", text: "Your email is confirmed. You're on the list, and we'll be in touch as details are finalized." },
  already: { tone: "ok", text: "Your email was already confirmed. You're on the list." },
  expired: { tone: "warn", text: "That confirmation link has expired. Sign up again below and we'll send a fresh one." },
  invalid: { tone: "warn", text: "That confirmation link isn't valid. It may have been used already. Sign up again below if you need a new one." },
  error: { tone: "warn", text: "We couldn't confirm your email just now. Please try the link again in a few minutes." },
};

function useConfirmStatus() {
  const [status] = useState(() => new URLSearchParams(window.location.search).get("confirmed"));
  useEffect(() => {
    if (!status) return;
    // Clean the URL so a refresh or share doesn't repeat the message.
    const url = new URL(window.location.href);
    url.searchParams.delete("confirmed");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    document.getElementById("signup")?.scrollIntoView({ block: "start" });
  }, [status]);
  return status ? CONFIRM_MESSAGES[status] ?? null : null;
}

export function Signup() {
  const [values, setValues] = useState<Values>({ name: "", email: "", investmentRange: "", acknowledged: false });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [formMessage, setFormMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirmStatus();
  const { token, reset: resetTurnstile, remove: removeTurnstile, failed: turnstileFailed } = useTurnstile(turnstileRef, formRef);
  const uid = useId();

  const clientErrors = validate(values);
  const shown = (f: Field) => (touched[f] || submitted ? (clientErrors[f] ?? serverErrors[f]) : serverErrors[f]);

  const set = <K extends keyof Values>(k: K, v: Values[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setServerErrors((prev) => ({ ...prev, [k]: undefined }));
  };
  const blur = (f: Field) => setTouched((t) => ({ ...t, [f]: true }));

  useEffect(() => {
    if (status === "success") successRef.current?.focus();
    if (status === "error") errorRef.current?.focus();
  }, [status, formMessage]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFormMessage("");
    const errs = validate(values);
    if (!token) errs.turnstileToken = turnstileFailed ? "Verification couldn't load. Please refresh the page and try again." : "Please wait a moment for the verification check to finish.";
    if (Object.keys(errs).length) {
      setServerErrors(errs.turnstileToken ? { turnstileToken: errs.turnstileToken } : {});
      const first = (["name", "email", "investmentRange", "acknowledged"] as const).find((f) => errs[f]);
      if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, name: values.name.trim(), email: values.email.trim(), turnstileToken: token }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; fields?: Errors; message?: string };
      if (res.ok && data.ok) {
        removeTurnstile();
        setStatus("success");
        return;
      }
      setStatus("error");
      resetTurnstile();
      if (data.fields) setServerErrors(data.fields);
      setFormMessage(data.message ?? (data.fields ? "Please check the highlighted fields." : "Something went wrong. Please try again."));
    } catch {
      setStatus("error");
      resetTurnstile();
      setFormMessage("We couldn't reach the server. Check your connection and try again.");
    }
  }

  const describedBy = (f: Field, hint?: string) => [hint, shown(f) ? `${uid}-${f}-error` : null].filter(Boolean).join(" ") || undefined;
  const errorText = (f: Field) =>
    shown(f) ? (
      <p id={`${uid}-${f}-error`} className="mt-2 text-small font-semibold text-danger">
        {shown(f)}
      </p>
    ) : null;

  const inputCls = (f: Field) =>
    `mt-2 block w-full rounded-control border bg-surface px-4 py-3 text-body text-ink transition-colors duration-150 placeholder:text-ink-muted/70 hover:border-ink focus-visible:border-ink ${
      shown(f) ? "border-danger" : "border-ink-muted"
    }`;

  return (
    <section id="signup" aria-labelledby="signup-title" className="section-pad gutter scroll-mt-16 border-t border-rule">
      <div className="mx-auto grid max-w-[96rem] gap-x-8 gap-y-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 id="signup-title" tabIndex={-1} className="font-heading text-h2 outline-none">
            Join the list
          </h2>
          <p className="measure mt-6 text-body-lg text-ink-muted">
            Register your interest and get notified as plans firm up. Nothing is paid, and nothing you tell us here is a commitment.
          </p>
          <ul className="mt-8 space-y-3 text-body">
            <li className="border-t border-rule pt-3">We'll email you a link to confirm your address.</li>
            <li className="border-t border-rule pt-3">We never ask for payment details or ID here.</li>
            <li className="border-t border-rule pt-3">
              Questions: <a className="font-semibold underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-7 lg:col-start-6">
          {confirm && (
            <div
              role="status"
              className={`mb-8 border-l-4 p-5 text-body ${confirm.tone === "ok" ? "border-share-700 bg-surface" : "border-danger bg-surface"}`}
            >
              {confirm.text}
            </div>
          )}

          {status === "success" ? (
            <div ref={successRef} tabIndex={-1} role="status" className="border-t-4 border-ink bg-surface p-6 outline-none sm:p-10">
              <h3 className="font-heading text-h3">Check your email</h3>
              <p className="measure mt-3 text-body-lg text-ink-muted">
                We've sent a confirmation link to <strong className="text-ink">{values.email.trim()}</strong>. Click it within 48 hours to finish
                joining the list. If you don't see it, check your spam folder.
              </p>
            </div>
          ) : (
            <form ref={formRef} noValidate onSubmit={onSubmit} className="border-t-4 border-ink bg-surface p-6 sm:p-10">
              <div className="grid gap-6">
                <div>
                  <label htmlFor={`${uid}-name`} className="font-semibold">Name</label>
                  <input
                    id={`${uid}-name`}
                    name="name"
                    type="text"
                    autoComplete="name"
                    maxLength={NAME_MAX}
                    required
                    aria-invalid={!!shown("name")}
                    aria-describedby={describedBy("name")}
                    value={values.name}
                    onChange={(e) => set("name", e.target.value)}
                    onBlur={() => blur("name")}
                    className={inputCls("name")}
                  />
                  {errorText("name")}
                </div>

                <div>
                  <label htmlFor={`${uid}-email`} className="font-semibold">Email</label>
                  <input
                    id={`${uid}-email`}
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    spellCheck={false}
                    required
                    aria-invalid={!!shown("email")}
                    aria-describedby={describedBy("email")}
                    value={values.email}
                    onChange={(e) => set("email", e.target.value)}
                    onBlur={() => blur("email")}
                    className={inputCls("email")}
                  />
                  {errorText("email")}
                </div>

                <div>
                  <label htmlFor={`${uid}-range`} className="font-semibold">How much might you invest?</label>
                  <p id={`${uid}-range-hint`} className="text-small text-ink-muted">A rough range is fine. This doesn't commit you to anything.</p>
                  <select
                    id={`${uid}-range`}
                    name="investmentRange"
                    required
                    aria-invalid={!!shown("investmentRange")}
                    aria-describedby={describedBy("investmentRange", `${uid}-range-hint`)}
                    value={values.investmentRange}
                    onChange={(e) => { set("investmentRange", e.target.value); blur("investmentRange"); }}
                    onBlur={() => blur("investmentRange")}
                    className={`${inputCls("investmentRange")} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none'%3E%3Cpath d='M1 1.5l5 5 5-5' stroke='%230D1626' stroke-width='1.75'/%3E%3C/svg%3E")] bg-[length:12px_8px] bg-[position:right_1rem_center] bg-no-repeat pr-10 font-mono`}
                  >
                    <option value="" disabled>
                      Choose a range
                    </option>
                    {INVESTMENT_RANGES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {errorText("investmentRange")}
                </div>

                <div>
                  <div className="flex items-start gap-3">
                    <input
                      id={`${uid}-ack`}
                      name="acknowledged"
                      type="checkbox"
                      required
                      aria-invalid={!!shown("acknowledged")}
                      aria-describedby={describedBy("acknowledged")}
                      checked={values.acknowledged}
                      onChange={(e) => { set("acknowledged", e.target.checked); blur("acknowledged"); }}
                      className="mt-1 size-5 shrink-0 accent-ink"
                    />
                    <label htmlFor={`${uid}-ack`} className="text-body">
                      {ACKNOWLEDGMENT_TEXT}
                    </label>
                  </div>
                  {errorText("acknowledged")}
                </div>

                <div>
                  <div ref={turnstileRef} className="min-h-[65px]" />
                  {errorText("turnstileToken")}
                </div>

                <div aria-live="polite" className="empty:hidden">
                  {formMessage && (
                    <p ref={errorRef} tabIndex={-1} className="border-l-4 border-danger bg-paper p-4 text-small font-semibold text-danger outline-none">
                      {formMessage}
                    </p>
                  )}
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="w-full rounded-control bg-ink px-6 py-4 font-semibold text-white transition-colors duration-150 ease-crisp hover:bg-night-800 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
                  >
                    {status === "submitting" ? "Sending…" : "Join the list"}
                  </button>
                  <p className="mt-3 text-small text-ink-muted">
                    By joining you agree to our <a href="/privacy.html" className="font-semibold text-ink underline underline-offset-4">privacy policy</a>.
                  </p>
                </div>
              </div>
            </form>
          )}

          <div className="mt-8">
            <Disclaimer className="bg-paper" />
          </div>
        </div>
      </div>
    </section>
  );
}
