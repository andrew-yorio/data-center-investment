import type { Env } from "../../server/env";
import { handleConfirm } from "../../server/handlers";

export const onRequestGet: PagesFunction<Env> = ({ request, env }) => handleConfirm(request, env);

/** Any other method gets a 405 instead of falling through to the HTML page. */
export const onRequest: PagesFunction<Env> = () =>
  new Response("Method Not Allowed", { status: 405, headers: { allow: "GET" } });
