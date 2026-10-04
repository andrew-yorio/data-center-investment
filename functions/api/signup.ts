import type { Env } from "../../server/env";
import { handleSignup } from "../../server/handlers";

export const onRequestPost: PagesFunction<Env> = ({ request, env }) => handleSignup(request, env);

/** Any other method gets a 405 instead of falling through to the HTML page. */
export const onRequest: PagesFunction<Env> = () =>
  new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
