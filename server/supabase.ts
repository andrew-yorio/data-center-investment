import type { Env } from "./env";

/** Calls a Postgres function through PostgREST with the service role key. The browser never sees this key. */
export async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
  const base = env.SUPABASE_REST_URL ?? `${env.SUPABASE_URL.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "")}/rest/v1`;
  const key = env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const headers: Record<string, string> = { "content-type": "application/json", apikey: key };
  // Legacy service_role keys are JWTs and also go in Authorization. New sb_secret_ keys are not JWTs and only go in apikey.
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
  const res = await fetch(`${base}/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`Supabase rpc ${fn} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}
