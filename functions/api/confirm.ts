import type { Env } from "../../server/env";
import { handleConfirm } from "../../server/handlers";

export const onRequestGet: PagesFunction<Env> = ({ request, env }) => handleConfirm(request, env);
