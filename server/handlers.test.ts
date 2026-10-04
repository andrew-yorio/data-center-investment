import { describe, expect, it, vi } from "vitest";
import { handleConfirm, handleSignup, type Deps } from "./handlers";
import { flagSignup, looksFake } from "./flags";
import { sha256Hex } from "./crypto";
import type { Env } from "./env";

const env: Env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", TURNSTILE_SECRET_KEY: "s" };

const good = { name: "Ada Lovelace", email: "ada@example.com", investmentRange: "500_2500", acknowledged: true, turnstileToken: "tok" };

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://site.test/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://site.test", "cf-connecting-ip": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deps(over: Partial<Record<string, unknown>> = {}): Deps & { calls: { fn: string; args: Record<string, unknown> }[] } {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: vi.fn(async (_e: Env, fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "check_signup_rate_limit") return over.allowed ?? true;
      if (fn === "register_signup") return over.outcome ?? "created";
      if (fn === "confirm_signup") return over.confirm ?? "confirmed";
      throw new Error(fn);
    }) as unknown as Deps["rpc"],
    verifyTurnstile: vi.fn(async () => (over.human ?? true) as boolean),
    sendConfirmationEmail: vi.fn(async () => {}),
  };
}

describe("handleSignup", () => {
  it("creates a sign-up, stores only the token hash, and emails the raw token", async () => {
    const d = deps();
    const res = await handleSignup(req(good), env, d);
    expect(res.status).toBe(200);
    const reg = d.calls.find((c) => c.fn === "register_signup")!;
    expect(reg.args.p_ip).toBe("203.0.113.7");
    expect(reg.args.p_flagged).toBe(false);
    const url = (d.sendConfirmationEmail as ReturnType<typeof vi.fn>).mock.calls[0][3] as string;
    const token = new URL(url).searchParams.get("token")!;
    expect(reg.args.p_token_hash).toBe(await sha256Hex(token));
    expect(JSON.stringify(reg.args)).not.toContain(token);
  });

  it("returns an identical response for duplicates and sends no email on noop", async () => {
    const a = await (await handleSignup(req(good), env, deps())).json();
    const d = deps({ outcome: "noop" });
    const res = await handleSignup(req(good), env, d);
    expect(await res.json()).toEqual(a);
    expect(d.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("still returns success if the email provider fails", async () => {
    const d = deps();
    d.sendConfirmationEmail = vi.fn(async () => { throw new Error("down"); });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await handleSignup(req(good), env, d)).status).toBe(200);
    err.mockRestore();
  });

  it("rejects a failed Turnstile check without touching the signups table", async () => {
    const d = deps({ human: false });
    const res = await handleSignup(req(good), env, d);
    expect(res.status).toBe(400);
    expect(d.calls.map((c) => c.fn)).toEqual(["check_signup_rate_limit"]);
  });

  it("rate limits before doing anything else", async () => {
    const d = deps({ allowed: false });
    const res = await handleSignup(req(good), env, d);
    expect(res.status).toBe(429);
    expect(d.verifyTurnstile).not.toHaveBeenCalled();
  });

  it("validates fields", async () => {
    const res = await handleSignup(req({ ...good, name: "", email: "nope", investmentRange: "1m", acknowledged: false }), env, deps());
    expect(res.status).toBe(422);
    const body = (await res.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields).sort()).toEqual(["acknowledged", "email", "investmentRange", "name"]);
  });

  it("rejects names over 120 characters", async () => {
    const res = await handleSignup(req({ ...good, name: "a".repeat(121) }), env, deps());
    expect(res.status).toBe(422);
  });

  it("rejects cross-origin posts, non-JSON and oversized bodies", async () => {
    expect((await handleSignup(req(good, { origin: "https://evil.test" }), env, deps())).status).toBe(403);
    expect((await handleSignup(req(good, { "content-type": "text/plain" }), env, deps())).status).toBe(415);
    expect((await handleSignup(req({ ...good, pad: "x".repeat(5000) }), env, deps())).status).toBe(413);
  });

  it("flags but does not reject disposable emails and fake high-range names", async () => {
    const d = deps();
    const res = await handleSignup(req({ ...good, name: "asdf asdf", email: "x@mailinator.com", investmentRange: "10000_plus" }), env, d);
    expect(res.status).toBe(200);
    const reg = d.calls.find((c) => c.fn === "register_signup")!;
    expect(reg.args.p_flagged).toBe(true);
    expect(reg.args.p_flag_reason).toBe("disposable_email_domain,high_range_suspicious_name");
  });
});

describe("flags", () => {
  it("does not flag ordinary names", () => {
    for (const n of ["Ada Lovelace", "Nguyễn Văn An", "José María O'Neil", "Li Wu", "Siobhán Ní Bhriain", "Zhang Wei"]) {
      expect(looksFake(n), n).toBe(false);
    }
  });
  it("flags obvious fakes", () => {
    for (const n of ["test", "asdfgh", "aaaaaa", "xkcdqwrt", "Elon Musk", "user123", "x"]) expect(looksFake(n), n).toBe(true);
  });
  it("only flags fake names on the $10,000+ range", () => {
    expect(flagSignup("test", "a@example.com", "under_500")).toBeNull();
    expect(flagSignup("test", "a@example.com", "10000_plus")).toBe("high_range_suspicious_name");
  });
});

describe("handleConfirm", () => {
  const get = (t: string) => new Request(`https://site.test/api/confirm?token=${t}`);
  const token = "A".repeat(43);
  it("redirects with the confirmation status", async () => {
    for (const r of ["confirmed", "already", "expired", "invalid"]) {
      const res = await handleConfirm(get(token), env, deps({ confirm: r }));
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`https://site.test/?confirmed=${r}#signup`);
    }
  });
  it("rejects malformed tokens without a database call", async () => {
    const d = deps();
    const res = await handleConfirm(get("bad'token"), env, d);
    expect(res.headers.get("location")).toContain("confirmed=invalid");
    expect(d.calls).toHaveLength(0);
  });
});
