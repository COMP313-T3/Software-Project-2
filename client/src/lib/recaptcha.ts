const ONLOAD_CALLBACK = "topsendRecaptchaReady";
const SCRIPT_URL = `https://www.google.com/recaptcha/api.js?render=explicit&hl=en&onload=${ONLOAD_CALLBACK}`;

/**
 * Google's published test site key for reCAPTCHA v2. Every check made with it passes and
 * the box says it is for testing only, so it is only used in development when no site key
 * is set.
 */
const TEST_SITE_KEY = "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";

/** Site key for the reCAPTCHA box, or an empty string when none is set outside development. */
export const RECAPTCHA_SITE_KEY =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
  (import.meta.env.DEV ? TEST_SITE_KEY : "");

export interface RecaptchaRenderOptions {
  sitekey: string;
  theme?: "dark" | "light";
  size?: "normal" | "compact";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
}

/** The part of Google's grecaptcha object the app uses. */
export interface RecaptchaApi {
  render(container: HTMLElement, options: RecaptchaRenderOptions): number;
  reset(widgetId?: number): void;
}

declare global {
  interface Window {
    grecaptcha?: RecaptchaApi;
    [ONLOAD_CALLBACK]?: () => void;
  }
}

let loading: Promise<RecaptchaApi> | null = null;

/**
 * Loads Google's reCAPTCHA script once and resolves with its API when it is ready. If the
 * script fails to load, the promise rejects and the next call tries again.
 *
 * @returns Google's reCAPTCHA API.
 */
export function loadRecaptcha(): Promise<RecaptchaApi> {
  loading ??= new Promise<RecaptchaApi>((resolve, reject) => {
    const script = document.createElement("script");

    window[ONLOAD_CALLBACK] = () => {
      if (window.grecaptcha) resolve(window.grecaptcha);
      else reject(new Error("The reCAPTCHA script loaded without its API."));
    };
    script.src = SCRIPT_URL;
    script.async = true;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("The reCAPTCHA script failed to load."));
    };

    document.head.append(script);
  });
  return loading;
}
