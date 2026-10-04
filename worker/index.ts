import type { Env } from "../server/env";
import { handleConfirm, handleSignup } from "../server/handlers";

/**
 * Worker entry. `run_worker_first` in wrangler.jsonc sends only /api/* here;
 * every other path is served straight from the static assets in dist/.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/signup") {
      return request.method === "POST" ? handleSignup(request, env) : methodNotAllowed("POST");
    }
    if (pathname === "/api/confirm") {
      return request.method === "GET" ? handleConfirm(request, env) : methodNotAllowed("GET");
    }
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

function methodNotAllowed(allow: string): Response {
  return new Response("Method Not Allowed", { status: 405, headers: { allow } });
}
