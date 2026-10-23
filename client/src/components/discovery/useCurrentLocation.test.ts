import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findCurrentLocation, forgetCurrentLocation } from "../../lib/currentLocation.ts";
import { useCurrentLocation } from "./useCurrentLocation.ts";

type Answer = { coords: { latitude: number; longitude: number } } | { code: number };

const DENIED = "TopSend isn't allowed to use your location. Allow it in your browser's site settings, or search for a place instead.";

function browserAnswers(...answers: Answer[]) {
  const getCurrentPosition = vi.fn((found: PositionCallback, failed?: PositionErrorCallback | null) => {
    const answer = answers.shift() ?? { code: 2 };
    if ("coords" in answer) found({ coords: answer.coords } as GeolocationPosition);
    else failed?.({ code: answer.code, message: "" } as GeolocationPositionError);
  });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

afterEach(() => {
  cleanup();
  forgetCurrentLocation();
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("US-025 criterion 6: the location a search starts from", () => {
  it("only asks the browser while the search starts from the location", async () => {
    const ask = browserAnswers({ coords: { latitude: 43.653215, longitude: -79.383249 } });
    const { result, rerender } = renderHook(({ wanted }) => useCurrentLocation(wanted, "climber"), { initialProps: { wanted: false } });

    expect(result.current).toMatchObject({ point: null, problem: null });
    expect(ask).not.toHaveBeenCalled();
    rerender({ wanted: true });

    await waitFor(() => expect(result.current.point).toEqual({ lat: 43.653, lng: -79.383 }));
    expect(ask).toHaveBeenCalledOnce();
  });

  it("uses a location found in the last 10 minutes without asking again", async () => {
    const ask = browserAnswers({ coords: { latitude: 43.65, longitude: -79.38 } });
    await findCurrentLocation("climber");

    const { result } = renderHook(() => useCurrentLocation(true, "climber"));

    expect(result.current.point).toEqual({ lat: 43.65, lng: -79.38 });
    expect(ask).toHaveBeenCalledOnce();
  });

  it("never gives one Climber another Climber's location", async () => {
    const ask = browserAnswers({ coords: { latitude: 43.65, longitude: -79.38 } }, { coords: { latitude: 45.42, longitude: -75.7 } });
    await findCurrentLocation("someone-else");
    const seen: unknown[] = [];

    const { result } = renderHook(() => {
      const here = useCurrentLocation(true, "climber");
      seen.push(here.point);
      return here;
    });

    await waitFor(() => expect(result.current.point).toEqual({ lat: 45.42, lng: -75.7 }));
    expect(seen[0]).toBeNull();
    expect(seen).not.toContainEqual({ lat: 43.65, lng: -79.38 });
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("shows its own problem, and only asks again when told to", async () => {
    const ask = browserAnswers({ code: 1 }, { coords: { latitude: 43.65, longitude: -79.38 } });
    const { result, rerender } = renderHook(() => useCurrentLocation(true, "climber"));

    await waitFor(() => expect(result.current.problem).toBe(DENIED));
    rerender();
    expect(ask).toHaveBeenCalledOnce();

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.point).toEqual({ lat: 43.65, lng: -79.38 }));
    expect(result.current.problem).toBeNull();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("asks again instead of showing a problem from before the search started from the location", async () => {
    const ask = browserAnswers({ code: 1 }, { coords: { latitude: 43.65, longitude: -79.38 } });
    await findCurrentLocation("climber").catch(() => undefined);
    const { result, rerender } = renderHook(({ wanted }) => useCurrentLocation(wanted, "climber"), { initialProps: { wanted: false } });

    rerender({ wanted: true });

    expect(result.current.problem).toBeNull();
    await waitFor(() => expect(result.current.point).toEqual({ lat: 43.65, lng: -79.38 }));
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("asks again when it opens with a problem from an earlier question", async () => {
    const ask = browserAnswers({ code: 3 }, { coords: { latitude: 43.65, longitude: -79.38 } });
    await findCurrentLocation("climber").catch(() => undefined);

    const { result } = renderHook(() => useCurrentLocation(true, "climber"));

    expect(result.current.problem).toBeNull();
    await waitFor(() => expect(result.current.point).toEqual({ lat: 43.65, lng: -79.38 }));
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("waits for a question that's already being asked instead of asking twice", async () => {
    let answer!: PositionCallback;
    const getCurrentPosition = vi.fn((found: PositionCallback) => { answer = found; });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    const asked = findCurrentLocation("climber");

    const { result } = renderHook(() => useCurrentLocation(true, "climber"));
    act(() => answer({ coords: { latitude: 43.65, longitude: -79.38 } } as GeolocationPosition));

    await expect(asked).resolves.toEqual({ lat: 43.65, lng: -79.38 });
    expect(result.current.point).toEqual({ lat: 43.65, lng: -79.38 });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });
});
