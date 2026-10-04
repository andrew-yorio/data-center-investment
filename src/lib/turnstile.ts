import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Cloudflare's always-pass test key is only used in dev builds. Production builds need a real key.
const SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? (import.meta.env.DEV ? "1x00000000000000000000AA" : undefined);
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | null = null;
function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Renders the Turnstile widget into `container` once the form comes near the
 * viewport or receives focus, so the third-party script never delays first paint.
 */
export function useTurnstile(container: RefObject<HTMLElement | null>, form: RefObject<HTMLElement | null>) {
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    const formEl = form.current;
    if (!formEl) return;
    let cancelled = false;
    const mount = () => {
      if (widgetId.current || cancelled) return;
      if (!SITE_KEY) {
        console.error("VITE_TURNSTILE_SITE_KEY is not set");
        setFailed(true);
        return;
      }
      loadScript()
        .then((ts) => {
          if (cancelled || !container.current || widgetId.current) return;
          widgetId.current = ts.render(container.current, {
            sitekey: SITE_KEY,
            theme: "light",
            size: "flexible",
            action: "signup",
            callback: (t: string) => setToken(t),
            "expired-callback": () => setToken(""),
            "error-callback": () => {
              setToken("");
              setFailed(true);
            },
          });
        })
        .catch(() => setFailed(true));
    };
    const io = new IntersectionObserver(([e]) => e.isIntersecting && mount(), { rootMargin: "800px 0px" });
    io.observe(formEl);
    formEl.addEventListener("focusin", mount);
    return () => {
      cancelled = true;
      io.disconnect();
      formEl.removeEventListener("focusin", mount);
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [container, form]);

  const reset = useCallback(() => {
    setToken("");
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, []);

  const remove = useCallback(() => {
    if (widgetId.current) window.turnstile?.remove(widgetId.current);
    widgetId.current = null;
  }, []);

  return { token, reset, remove, failed };
}
