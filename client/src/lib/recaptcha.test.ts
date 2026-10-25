import { afterEach, describe, expect, it, vi } from "vitest";

const SCRIPT_URL =
  "https://www.google.com/recaptcha/api.js?render=explicit&hl=en&onload=topsendRecaptchaReady";

async function freshModule() {
  vi.resetModules();
  return import("./recaptcha.ts");
}

function scripts() {
  return document.head.querySelectorAll("script");
}

afterEach(() => {
  scripts().forEach((script) => script.remove());
  delete window.grecaptcha;
  delete window.topsendRecaptchaReady;
});

describe("loadRecaptcha", () => {
  it("adds Google's script once and resolves when it is ready", async () => {
    const { loadRecaptcha } = await freshModule();

    const first = loadRecaptcha();
    const second = loadRecaptcha();
    const api = { render: vi.fn(), reset: vi.fn() };
    window.grecaptcha = api;
    window.topsendRecaptchaReady?.();

    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].src).toBe(SCRIPT_URL);
    expect(second).toBe(first);
    await expect(first).resolves.toBe(api);
  });

  it("tries again after the script fails to load", async () => {
    const { loadRecaptcha } = await freshModule();

    const failed = loadRecaptcha();
    scripts()[0].dispatchEvent(new Event("error"));

    await expect(failed).rejects.toThrow(
      "The reCAPTCHA script failed to load.",
    );
    expect(scripts()).toHaveLength(0);

    void loadRecaptcha().catch(() => undefined);
    expect(scripts()).toHaveLength(1);
  });

  it("uses Google's test site key in development when none is set", async () => {
    const { RECAPTCHA_SITE_KEY } = await freshModule();

    expect(RECAPTCHA_SITE_KEY).toBe("6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI");
  });
});
