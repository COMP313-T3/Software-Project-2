import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CurrentLocationError,
  findCurrentLocation,
  forgetCurrentLocation,
  freshLocation,
  LOCATION_KEEP_MS,
  locationProblem,
  locationSnapshot,
  subscribeToLocation,
} from "./currentLocation.ts";

type Answer = { coords: { latitude: number; longitude: number } } | { code: number };

function browserAnswers(...answers: Answer[]) {
  const getCurrentPosition = vi.fn((found: PositionCallback, failed?: PositionErrorCallback | null, _options?: PositionOptions) => {
    const answer = answers.shift() ?? { code: 2 };
    if ("coords" in answer) found({ coords: answer.coords } as GeolocationPosition);
    else failed?.({ code: answer.code, message: "" } as GeolocationPositionError);
  });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

/** A browser that waits to answer, so a test can answer each question when it chooses. */
function browserWaits() {
  const questions: { found: PositionCallback; failed?: PositionErrorCallback | null }[] = [];
  const getCurrentPosition = vi.fn((found: PositionCallback, failed?: PositionErrorCallback | null) => {
    questions.push({ found, failed });
  });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return {
    getCurrentPosition,
    answer(index: number, latitude: number, longitude: number) {
      questions[index].found({ coords: { latitude, longitude } } as GeolocationPosition);
    },
    refuse(index: number) {
      questions[index].failed?.({ code: 1, message: "" } as GeolocationPositionError);
    },
  };
}

afterEach(() => {
  forgetCurrentLocation();
  Reflect.deleteProperty(navigator, "geolocation");
  vi.useRealTimers();
});

describe("US-025 criterion 6: where the Climber is", () => {
  it("rounds the location to about 110 m and asks without high accuracy", async () => {
    const ask = browserAnswers({ coords: { latitude: 43.653215, longitude: -79.383249 } });

    await expect(findCurrentLocation("climber")).resolves.toEqual({ lat: 43.653, lng: -79.383 });
    expect(ask.mock.calls[0][2]).toEqual({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    expect(locationSnapshot()).toMatchObject({ userId: "climber", point: { lat: 43.653, lng: -79.383 }, problem: null, finding: false });
  });

  it("uses the same location again for 10 minutes, only for the same Climber", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const ask = browserAnswers(
      { coords: { latitude: 43.65, longitude: -79.38 } },
      { coords: { latitude: 43.7, longitude: -79.4 } },
      { coords: { latitude: 43.71, longitude: -79.41 } },
    );

    await findCurrentLocation("climber");
    await expect(findCurrentLocation("climber")).resolves.toEqual({ lat: 43.65, lng: -79.38 });
    expect(ask).toHaveBeenCalledOnce();
    expect(freshLocation("climber", Date.now() + LOCATION_KEEP_MS - 1)).toEqual({ lat: 43.65, lng: -79.38 });
    expect(freshLocation("climber", Date.now() + LOCATION_KEEP_MS)).toBeNull();
    expect(freshLocation("someone-else")).toBeNull();

    await expect(findCurrentLocation("someone-else")).resolves.toEqual({ lat: 43.7, lng: -79.4 });
    expect(freshLocation("climber")).toBeNull();

    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(freshLocation("someone-else")).toBeNull();
    await expect(findCurrentLocation("someone-else")).resolves.toEqual({ lat: 43.71, lng: -79.41 });
    expect(ask).toHaveBeenCalledTimes(3);
  });

  it("asks the browser once for searches that start at the same moment", async () => {
    const browser = browserWaits();

    const first = findCurrentLocation("climber");
    const second = findCurrentLocation("climber");
    expect(locationSnapshot()).toMatchObject({ userId: "climber", finding: true });
    browser.answer(0, 43.6, -79.3);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { lat: 43.6, lng: -79.3 },
      { lat: 43.6, lng: -79.3 },
    ]);
    expect(browser.getCurrentPosition).toHaveBeenCalledOnce();
  });

  it("keeps the newest location when an older question is answered last", async () => {
    const browser = browserWaits();

    const older = findCurrentLocation("climber");
    forgetCurrentLocation();
    const newer = findCurrentLocation("climber");
    browser.answer(1, 43.7, -79.4);
    browser.answer(0, 43.6, -79.3);

    await expect(newer).resolves.toEqual({ lat: 43.7, lng: -79.4 });
    await expect(older).resolves.toEqual({ lat: 43.6, lng: -79.3 });
    expect(freshLocation("climber")).toEqual({ lat: 43.7, lng: -79.4 });
    expect(locationSnapshot()).toMatchObject({ problem: null, finding: false });
  });

  it("doesn't let an older question's problem replace a newer location", async () => {
    const browser = browserWaits();

    const older = findCurrentLocation("climber").catch((caught: unknown) => caught);
    forgetCurrentLocation();
    const newer = findCurrentLocation("climber");
    browser.answer(1, 43.7, -79.4);
    browser.refuse(0);

    await expect(newer).resolves.toEqual({ lat: 43.7, lng: -79.4 });
    await expect(older).resolves.toMatchObject({ reason: "denied" });
    expect(locationSnapshot()).toMatchObject({ point: { lat: 43.7, lng: -79.4 }, problem: null, finding: false });
  });

  it("tells the page each time what's known changes, until it stops listening", async () => {
    const browser = browserWaits();
    const listener = vi.fn();
    const stop = subscribeToLocation(listener);

    const found = findCurrentLocation("climber");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(locationSnapshot().finding).toBe(true);
    browser.answer(0, 43.6, -79.3);
    await found;
    expect(listener).toHaveBeenCalledTimes(2);
    const before = locationSnapshot();
    expect(locationSnapshot()).toBe(before);

    stop();
    forgetCurrentLocation();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(locationSnapshot()).not.toBe(before);
  });

  it.each([
    [1, "denied", "TopSend isn't allowed to use your location. Allow it in your browser's site settings, or search for a place instead."],
    [2, "unavailable", "Your location couldn't be found. Try again, or search for a place instead."],
    [3, "timeout", "Finding your location took too long. Try again, or search for a place instead."],
  ])("explains the browser's code %i as %s", async (code, reason, message) => {
    browserAnswers({ code });

    const error = await findCurrentLocation("climber").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CurrentLocationError);
    expect(error).toMatchObject({ reason, message });
    expect(locationProblem(error)).toBe(message);
    expect(freshLocation("climber")).toBeNull();
    expect(locationSnapshot()).toMatchObject({ userId: "climber", problem: message, finding: false });
  });

  it("drops a location older than 10 minutes as soon as it asks again, even if that fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    browserAnswers({ coords: { latitude: 43.65, longitude: -79.38 } }, { code: 1 });
    await findCurrentLocation("climber");

    vi.setSystemTime(Date.now() + LOCATION_KEEP_MS);
    await findCurrentLocation("climber").catch(() => undefined);

    expect(locationSnapshot()).toMatchObject({ userId: "climber", point: null, foundAt: 0, finding: false });
    expect(locationSnapshot().problem).not.toBeNull();
  });

  it("forgets a problem once the browser is asked again", async () => {
    browserAnswers({ code: 1 }, { coords: { latitude: 43.65, longitude: -79.38 } });

    await findCurrentLocation("climber").catch(() => undefined);
    expect(locationSnapshot().problem).not.toBeNull();

    await expect(findCurrentLocation("climber")).resolves.toEqual({ lat: 43.65, lng: -79.38 });
    expect(locationSnapshot()).toMatchObject({ problem: null, finding: false });
  });

  it("stops waiting when the browser's question is never answered, and ignores a late answer", async () => {
    vi.useFakeTimers();
    const browser = browserWaits();
    const failed = vi.fn();

    findCurrentLocation("climber").catch(failed);
    await vi.advanceTimersByTimeAsync(44_999);
    expect(failed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ reason: "timeout" }));
    browser.answer(0, 43.6, -79.3);
    expect(freshLocation("climber")).toBeNull();
    expect(locationSnapshot()).toMatchObject({ problem: "Finding your location took too long. Try again, or search for a place instead.", finding: false });
  });

  it("says so when the browser can't share a location at all", async () => {
    await expect(findCurrentLocation("climber")).rejects.toMatchObject({
      reason: "unsupported",
      message: "This browser can't share your location. Search for a place instead.",
    });
    expect(locationSnapshot()).toMatchObject({ userId: "climber", problem: "This browser can't share your location. Search for a place instead.", finding: false });
  });

  it("forgets the location on request, so the next search asks again", async () => {
    const ask = browserAnswers(
      { coords: { latitude: 43.65, longitude: -79.38 } },
      { coords: { latitude: 43.66, longitude: -79.39 } },
    );

    await findCurrentLocation("climber");
    forgetCurrentLocation();

    expect(freshLocation("climber")).toBeNull();
    expect(locationSnapshot()).toMatchObject({ userId: null, point: null, problem: null, finding: false });
    await expect(findCurrentLocation("climber")).resolves.toEqual({ lat: 43.66, lng: -79.39 });
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
