import { afterEach, describe, expect, it, vi } from "vitest";
import { toLatLngLiteral } from "./googleMaps.ts";

async function freshModule() {
  vi.resetModules();
  return import("./googleMaps.ts");
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  document.head.querySelectorAll("script").forEach((script) => script.remove());
  delete window.google;
  delete window.topsendMapsReady;
  delete window.gm_authFailure;
});

describe("toLatLngLiteral", () => {
  it("reads Google's LatLng objects and plain positions", () => {
    expect(toLatLngLiteral({ lat: () => 43.6, lng: () => -79.4 })).toEqual({
      lat: 43.6,
      lng: -79.4,
    });
    expect(toLatLngLiteral({ lat: 43.6, lng: -79.4 })).toEqual({
      lat: 43.6,
      lng: -79.4,
    });
    expect(toLatLngLiteral(null)).toBeNull();
  });
});

describe("loadGoogleMaps", () => {
  it("doesn't load anything without a key", async () => {
    const { loadGoogleMaps } = await freshModule();

    await expect(loadGoogleMaps()).rejects.toMatchObject({
      reason: "no-key",
      message: "No Google Maps key is set.",
    });
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("loads Google's script once with the key and resolves when it is ready", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    const { loadGoogleMaps } = await freshModule();

    const first = loadGoogleMaps();
    const second = loadGoogleMaps();
    const maps = { importLibrary: vi.fn() };
    window.google = { maps };
    window.topsendMapsReady?.();

    const scripts = document.head.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    const url = new URL(scripts[0].src);
    expect(url.origin + url.pathname).toBe(
      "https://maps.googleapis.com/maps/api/js",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      key: "key-for-tests",
      loading: "async",
      callback: "topsendMapsReady",
    });
    expect(second).toBe(first);
    await expect(first).resolves.toBe(maps);
  });

  it("stops loading Google Maps once Google refuses the key", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    const { loadGoogleMaps } = await freshModule();

    const refused = loadGoogleMaps();
    window.google = { maps: { importLibrary: vi.fn() } };
    window.gm_authFailure?.();

    await expect(refused).rejects.toMatchObject({
      reason: "refused",
      message: "Google Maps refused the key.",
    });
    await expect(loadGoogleMaps()).rejects.toMatchObject({ reason: "refused" });
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("stops handing out a loaded Google Maps once Google refuses its key", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    const { loadGoogleMaps } = await freshModule();

    const loaded = loadGoogleMaps();
    window.google = { maps: { importLibrary: vi.fn() } };
    window.topsendMapsReady?.();
    await loaded;
    window.gm_authFailure?.();

    await expect(loadGoogleMaps()).rejects.toMatchObject({ reason: "refused" });
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });

  it("reports a script that fails to load, and tries again with a new one", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    const { loadGoogleMaps } = await freshModule();

    const failed = loadGoogleMaps();
    document.head.querySelector("script")?.dispatchEvent(new Event("error"));

    await expect(failed).rejects.toMatchObject({
      reason: "script",
      message: "The Google Maps script failed to load.",
    });
    expect(document.head.querySelector("script")).toBeNull();
    void loadGoogleMaps().catch(() => undefined);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });

  it("fails clearly when the Maps script isn't ready within 5 seconds", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    const { loadGoogleMaps } = await freshModule();

    let settled = false;
    const pending = loadGoogleMaps();
    void pending
      .catch(() => undefined)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).rejects.toMatchObject({
      reason: "timeout",
      message: "Google Maps took too long to load.",
    });
  });

  it("waits for the same script when tried again, and uses it once it arrives", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    const { loadGoogleMaps } = await freshModule();

    const late = loadGoogleMaps();
    const timedOut = expect(late).rejects.toThrow(
      "Google Maps took too long to load.",
    );
    await vi.advanceTimersByTimeAsync(5000);
    await timedOut;

    const retry = loadGoogleMaps();
    const maps = { importLibrary: vi.fn() };
    window.google = { maps };
    window.topsendMapsReady?.();

    await expect(retry).resolves.toBe(maps);
    await expect(loadGoogleMaps()).resolves.toBe(maps);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });

  it("uses Google Maps that is already on the page without adding the script", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    const maps = { importLibrary: vi.fn() };
    window.google = { maps };
    const { loadGoogleMaps } = await freshModule();

    await expect(loadGoogleMaps()).resolves.toBe(maps);
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("hears a refused key when Google Maps was already on the page", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    window.google = { maps: { importLibrary: vi.fn() } };
    const { loadGoogleMaps, onGoogleMapsKeyRefused } = await freshModule();
    const listener = vi.fn();
    onGoogleMapsKeyRefused(listener);

    await loadGoogleMaps();
    window.gm_authFailure?.();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("tells listeners when Google refuses the key after the map has loaded", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    const { loadGoogleMaps, onGoogleMapsKeyRefused } = await freshModule();
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = onGoogleMapsKeyRefused(first);
    onGoogleMapsKeyRefused(second);

    const loaded = loadGoogleMaps();
    window.google = { maps: { importLibrary: vi.fn() } };
    window.topsendMapsReady?.();
    await loaded;
    window.gm_authFailure?.();
    stopFirst();
    window.gm_authFailure?.();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});

describe("withinLoadTime", () => {
  it("passes on a step that finishes in time", async () => {
    const { withinLoadTime } = await freshModule();

    await expect(withinLoadTime(Promise.resolve("ready"))).resolves.toBe("ready");
  });

  it("fails a step that takes longer than 5 seconds", async () => {
    vi.useFakeTimers();
    const { withinLoadTime } = await freshModule();

    const step = withinLoadTime(new Promise(() => undefined));
    const timedOut = expect(step).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(5000);

    await timedOut;
  });
});
