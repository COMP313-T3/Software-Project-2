import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import {
  loadRecaptcha,
  RECAPTCHA_SITE_KEY,
  type RecaptchaApi,
} from "../../lib/recaptcha.ts";
import styles from "./AuthForm.module.css";

/** Width of Google's normal-size box. Its size is fixed, so narrow screens scale it down. */
const WIDGET_WIDTH = 304;

/** Lets the form clear the box after a failed sign-up, since each token works only once. */
export interface ReCaptchaBoxHandle {
  reset(): void;
}

interface ReCaptchaBoxProps {
  ref?: Ref<ReCaptchaBoxHandle>;
  /** Called with the token when the box is ticked, and with "" when it expires or is reset. */
  onTokenChange: (token: string) => void;
}

/**
 * Google's "I'm not a robot" box in its dark style. On screens narrower than the box, it is
 * scaled down to fit.
 */
export default function ReCaptchaBox({
  ref,
  onTokenChange,
}: ReCaptchaBoxProps) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: RecaptchaApi; id: number } | null>(null);
  const tokenChange = useRef(onTokenChange);
  const [failed, setFailed] = useState(!RECAPTCHA_SITE_KEY);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    tokenChange.current = onTokenChange;
  });

  useImperativeHandle(
    ref,
    () => ({
      reset() {
        if (widget.current) widget.current.api.reset(widget.current.id);
        tokenChange.current("");
      },
    }),
    [],
  );

  useEffect(() => {
    const box = container.current;
    if (!box) return;

    const holder = document.createElement("div");
    box.append(holder);
    let active = true;

    loadRecaptcha().then(
      (api) => {
        if (!active) return;
        const id = api.render(holder, {
          sitekey: RECAPTCHA_SITE_KEY,
          theme: "dark",
          callback: (token) => tokenChange.current(token),
          "expired-callback": () => tokenChange.current(""),
          "error-callback": () => tokenChange.current(""),
        });
        widget.current = { api, id };
      },
      () => {
        if (active) setFailed(true);
      },
    );

    const resize = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / WIDGET_WIDTH));
    });
    resize.observe(box);

    return () => {
      active = false;
      widget.current = null;
      resize.disconnect();
      holder.remove();
    };
  }, []);

  if (failed) {
    return (
      <p className={styles.error} role="alert">
        The reCAPTCHA couldn't load. Refresh the page or try again later.
      </p>
    );
  }

  return (
    <div
      ref={container}
      className={styles.captcha}
      style={{ "--captcha-scale": scale } as CSSProperties}
    />
  );
}
