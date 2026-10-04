import type { Env } from "./env";

/** Calls a Postgres function through PostgREST with the service role key. The browser never sees this key. */
export async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
  const base = env.SUPABASE_REST_URL ?? `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;
  const res = await fetch(`${base}/rpc/${fn}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    throw new Error(`Supabase rpc ${fn} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}
