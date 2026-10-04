export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Optional override for local testing against a bare PostgREST. Defaults to `${SUPABASE_URL}/rest/v1`. */
  SUPABASE_REST_URL?: string;
  TURNSTILE_SECRET_KEY: string;
  EMAIL_API_KEY?: string;
  /** e.g. `Placeholder <hello@yourdomain.com>`; must be a domain verified with the email provider. */
  EMAIL_FROM?: string;
  /** "1" to log confirmation links instead of sending when EMAIL_API_KEY is unset (local dev only). */
  DEV_LOG_EMAILS?: string;
}
