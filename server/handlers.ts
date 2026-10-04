import type { Env } from "./env";
import { validateSignup } from "./validate";
import { flagSignup } from "./flags";
import { generateToken, sha256Hex } from "./crypto";
import { rpc } from "./supabase";
import { verifyTurnstile } from "./turnstile";
import { sendConfirmationEmail } from "./email";
import { domainAcceptsMail, typoDomainSuggestion } from "./mx";

/** Seams for tests. Production uses the real implementations. */
export interface Deps {
  rpc: typeof rpc;
  verifyTurnstile: typeof verifyTurnstile;
  sendConfirmationEmail: typeof sendConfirmationEmail;
  domainAcceptsMail: (email: string) => Promise<boolean>;
}

const realDeps: Deps = { rpc, verifyTurnstile, sendConfirmationEmail, domainAcceptsMail: (email) => domainAcceptsMail(email) };

const MAX_BODY_BYTES = 4096;

function json(status: number, body: unknown, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

/** Same body for new, duplicate and already-confirmed emails, so the form can't reveal who signed up. */
const SUCCESS_CONFIRM = { ok: true, confirmEmail: true, message: "Check your email for a confirmation link to finish joining the list." };
const SUCCESS_JOINED = { ok: true, confirmEmail: false, message: "You're on the list." };

export async function handleSignup(request: Request, env: Env, deps: Deps = realDeps): Promise<Response> {
  const url = new URL(request.url);

  // Only accept same-origin JSON posts from our own form.
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return json(403, { ok: false, error: "forbidden" });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json(415, { ok: false, error: "unsupported_media_type" });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "too_large" });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) {
    // Cloudflare always sets this in production; without it we can't rate limit.
    return json(400, { ok: false, error: "missing_client_ip" });
  }

  try {
    const edgeOk = env.SIGNUP_RATE_LIMITER ? (await env.SIGNUP_RATE_LIMITER.limit({ key: ip })).success : true;
    const allowed = edgeOk && (await deps.rpc<boolean>(env, "check_signup_rate_limit", { p_ip: ip }));
    if (!allowed) {
      return json(429, { ok: false, error: "rate_limited", message: "Too many attempts. Please wait a few minutes and try again." }, { "retry-after": "600" });
    }

    const parsed = validateSignup(body);
    if (!parsed.ok) return json(422, { ok: false, error: "validation", fields: parsed.errors });
    const input = parsed.value;

    const suggestion = typoDomainSuggestion(input.email);
    if (suggestion) {
      return json(422, { ok: false, error: "validation", fields: { email: `Did you mean ${input.email.slice(0, input.email.lastIndexOf("@"))}@${suggestion}?` } });
    }
    if (env.EMAIL_DOMAIN_CHECK !== "0" && !(await deps.domainAcceptsMail(input.email))) {
      return json(422, { ok: false, error: "validation", fields: { email: "That email address can't receive mail. Check it for typos." } });
    }

    const human = await deps.verifyTurnstile(env.TURNSTILE_SECRET_KEY, input.turnstileToken, ip);
    if (!human) {
      return json(400, { ok: false, error: "turnstile_failed", fields: { turnstileToken: "Verification failed. Please try again." } });
    }

    const confirmByEmail = env.REQUIRE_EMAIL_CONFIRMATION === "1";
    const token = generateToken();
    const flagReason = flagSignup(input.name, input.email, input.investmentRange);
    const outcome = await deps.rpc<"created" | "resend" | "noop">(env, "register_signup", {
      p_name: input.name,
      p_email: input.email,
      p_investment_range: input.investmentRange,
      p_ip: ip,
      p_user_agent: request.headers.get("user-agent") ?? "",
      p_token_hash: await sha256Hex(token),
      p_flagged: flagReason !== null,
      p_flag_reason: flagReason,
    });

    if (!confirmByEmail) {
      // No confirmation email: the sign-up counts as soon as it passes the checks above.
      if (outcome === "created" || outcome === "resend") {
        await deps.rpc<string>(env, "confirm_signup", { p_token_hash: await sha256Hex(token) });
      }
      return json(200, SUCCESS_JOINED);
    }

    if (outcome === "created" || outcome === "resend") {
      const confirmUrl = `${url.origin}/api/confirm?token=${encodeURIComponent(token)}`;
      try {
        await deps.sendConfirmationEmail(env, input.email, input.name, confirmUrl);
      } catch (err) {
        // Don't change the response: a different reply here would reveal that the email was new.
        console.error("confirmation email failed", err);
      }
    }
    return json(200, SUCCESS_CONFIRM);
  } catch (err) {
    console.error("signup failed", err);
    return json(500, { ok: false, error: "server", message: "Something went wrong on our side. Please try again shortly." });
  }
}

export async function handleConfirm(request: Request, env: Env, deps: Pick<Deps, "rpc"> = realDeps): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const redirect = (status: string) =>
    new Response(null, {
      status: 303,
      headers: { location: `${url.origin}/?confirmed=${status}#signup`, "cache-control": "no-store", "referrer-policy": "no-referrer" },
    });

  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return redirect("invalid");
  try {
    const result = await deps.rpc<string>(env, "confirm_signup", { p_token_hash: await sha256Hex(token) });
    return redirect(["confirmed", "already", "expired"].includes(result) ? result : "invalid");
  } catch (err) {
    console.error("confirm failed", err);
    return redirect("error");
  }
}
