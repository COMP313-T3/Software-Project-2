import { afterEach, describe, expect, it, vi } from "vitest";
import { toLatLngLiteral } from "./googleMaps.ts";

async function freshModule() {
  vi.resetModules();
  return import("./googleMaps.ts");
}

afterEach(() => {
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

    await expect(loadGoogleMaps()).rejects.toThrow(
      "No Google Maps key is set.",
    );
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

  it("tries again after Google refuses the key", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "key-for-tests");
    const { loadGoogleMaps } = await freshModule();

    const refused = loadGoogleMaps();
    window.gm_authFailure?.();

    await expect(refused).rejects.toThrow("Google Maps refused the key.");
    void loadGoogleMaps().catch(() => undefined);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });
});
