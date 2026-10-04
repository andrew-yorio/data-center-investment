/** Workers rate limiting binding (see wrangler.jsonc). */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /** Optional so tests and local runs without the binding still work; Postgres enforces the limit regardless. */
  SIGNUP_RATE_LIMITER?: RateLimiter;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Optional override for local testing against a bare PostgREST. Defaults to `${SUPABASE_URL}/rest/v1`. */
  SUPABASE_REST_URL?: string;
  TURNSTILE_SECRET_KEY: string;
  /** Resend API key. Used when SMTP isn't configured. */
  EMAIL_API_KEY?: string;
  /** e.g. `ComputeStake <hello@yourdomain.com>`. With Resend, the domain must be verified there; with Gmail SMTP, use the Gmail address itself. */
  EMAIL_FROM?: string;
  /** SMTP sending, e.g. Gmail: host smtp.gmail.com, user the Gmail address, pass a Google app password. Takes precedence over Resend when all three are set. */
  SMTP_HOST?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  /** Defaults to 465 (implicit TLS). */
  SMTP_PORT?: string;
  /** "1" to log confirmation links instead of sending when EMAIL_API_KEY is unset (local dev only). */
  DEV_LOG_EMAILS?: string;
}
