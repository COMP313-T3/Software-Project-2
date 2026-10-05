import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiClient.ts";
import { findAddressAt, findPlace } from "./geocodeApi.ts";

const FOUND = {
  address: "100 Queen Street West, Toronto, ON",
  postalCode: "M5H 2N1",
  country: "CA",
  location: { lat: 43.6533437, lng: -79.3838262 },
};

function apiAnswers(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestedUrl(fetchMock: ReturnType<typeof apiAnswers>) {
  return String((fetchMock.mock.calls[0] as unknown[])[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findPlace", () => {
  it("asks the API about the picked suggestion's place", async () => {
    const fetchMock = apiAnswers(FOUND);

    await expect(findPlace("ChIJ81rnZsw0K4g")).resolves.toEqual(FOUND);
    expect(requestedUrl(fetchMock)).toBe(
      "/api/geocode/place?id=ChIJ81rnZsw0K4g",
    );
  });

  it("gives null when the address isn't found", async () => {
    apiAnswers({ error: "ADDRESS_NOT_FOUND", message: "Not found." }, 404);

    await expect(findPlace("unknown")).resolves.toBeNull();
  });
});

describe("findAddressAt", () => {
  it("sends the point with six decimal places", async () => {
    const fetchMock = apiAnswers(FOUND);

    await expect(
      findAddressAt({ lat: 43.65344999, lng: -79.3839 }),
    ).resolves.toEqual(FOUND);
    expect(requestedUrl(fetchMock)).toBe(
      "/api/geocode/location?lat=43.653450&lng=-79.383900",
    );
  });

  it("passes on other errors", async () => {
    apiAnswers(
      { error: "VALIDATION_ERROR", message: "Check the fields and try again." },
      400,
    );

    await expect(findAddressAt({ lat: 0, lng: 0 })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
