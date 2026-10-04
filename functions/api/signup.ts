import type { Env } from "../../server/env";
import { handleSignup } from "../../server/handlers";

export const onRequestPost: PagesFunction<Env> = ({ request, env }) => handleSignup(request, env);
