import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { addressFromComponents } from "../src/services/geocodingService.js";

const KEY = "maps-key-for-tests";
const PLACE_ID = "ChIJ81rnZsw0K4gRfWj9dnRHEiQ";

function part(longText, shortText, ...types) {
  return { longText, shortText, types };
}

const QUEEN_STREET = [
  part("100", "100", "street_number"),
  part("Queen Street West", "Queen St W", "route"),
  part("Old Toronto", "Old Toronto", "political", "sublocality"),
  part("Toronto", "Toronto", "locality", "political"),
  part("Ontario", "ON", "administrative_area_level_1", "political"),
  part("Canada", "CA", "country", "political"),
  part("M5H 2N1", "M5H 2N1", "postal_code"),
];

const CITY_HALL = {
  placeId: PLACE_ID,
  location: { latitude: 43.6533437, longitude: -79.3838262 },
  formattedAddress: "100 Queen St W, Toronto, ON M5H 2N1, Canada",
  addressComponents: QUEEN_STREET,
};

const FOUND = {
  address: "100 Queen Street West, Toronto, ON",
  postalCode: "M5H 2N1",
  country: "CA",
  location: { lat: 43.6533437, lng: -79.3838262 },
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeApp(options = {}) {
  return createApp({
    clientOrigins: ["http://localhost:5173"],
    googleMapsServerKey: KEY,
    ...options,
  });
}

function googleAnswers(body, status = 200) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GET /api/geocode/place", () => {
  it("returns the address, postal code, country, and location of a suggested place", async () => {
    const fetchMock = googleAnswers(CITY_HALL);

    const response = await request(makeApp())
      .get("/api/geocode/place")
      .query({ id: PLACE_ID });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(FOUND);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://geocode.googleapis.com/v4/geocode/places/${PLACE_ID}?languageCode=en`,
    );
    expect(init.headers).toEqual({ "X-Goog-Api-Key": KEY });
  });

  it("answers 404 when Google doesn't know the place", async () => {
    googleAnswers({ error: { code: 404, status: "NOT_FOUND" } }, 404);

    const response = await request(makeApp())
      .get("/api/geocode/place")
      .query({ id: PLACE_ID });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("ADDRESS_NOT_FOUND");
  });

  it("rejects a missing or odd place ID without asking Google", async () => {
    const fetchMock = googleAnswers(CITY_HALL);

    for (const query of [{}, { id: "" }, { id: "../places/x" }]) {
      const response = await request(makeApp())
        .get("/api/geocode/place")
        .query(query);
      expect(response.status).toBe(400);
      expect(response.body.fields).toEqual({
        id: "Choose an address from the list.",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/geocode/location", () => {
  it("returns the address at a point on the map", async () => {
    const fetchMock = googleAnswers({ results: [CITY_HALL] });

    const response = await request(makeApp())
      .get("/api/geocode/location")
      .query({ lat: "43.653400", lng: "-79.383900" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(FOUND);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://geocode.googleapis.com/v4/geocode/location/43.6534,-79.3839?languageCode=en",
    );
  });

  it("prefers the building's own address over a unit listed at the same point", async () => {
    const unitElsewhere = {
      types: ["street_address", "subpremise"],
      location: { latitude: 43.65348, longitude: -79.38409 },
      addressComponents: [
        part("3080", "3080", "street_number"),
        part("Bayview Avenue", "Bayview Ave", "route"),
        part("Toronto", "Toronto", "locality"),
        part("Ontario", "ON", "administrative_area_level_1"),
        part("Canada", "CA", "country"),
      ],
    };
    const plusCode = { types: ["plus_code"], location: CITY_HALL.location };
    googleAnswers({
      results: [
        unitElsewhere,
        { ...CITY_HALL, types: ["premise", "street_address"] },
        plusCode,
      ],
    });

    const response = await request(makeApp())
      .get("/api/geocode/location")
      .query({ lat: "43.65345", lng: "-79.3839" });

    expect(response.body.address).toBe("100 Queen Street West, Toronto, ON");
  });

  it("answers 404 when there is no address at that spot", async () => {
    googleAnswers({ results: [] });

    const response = await request(makeApp())
      .get("/api/geocode/location")
      .query({ lat: "0", lng: "-160" });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("ADDRESS_NOT_FOUND");
  });

  it("rejects points that aren't on the map", async () => {
    const fetchMock = googleAnswers({ results: [CITY_HALL] });

    for (const query of [
      { lat: "91", lng: "0" },
      { lat: "0", lng: "-180.5" },
      { lat: "north", lng: "0" },
      { lat: "", lng: "" },
      { lng: "0" },
    ]) {
      const response = await request(makeApp())
        .get("/api/geocode/location")
        .query(query);
      expect(response.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("when Google can't help", () => {
  it("answers 503 without asking Google when no key is set", async () => {
    const fetchMock = googleAnswers(CITY_HALL);

    const response = await request(makeApp({ googleMapsServerKey: "" }))
      .get("/api/geocode/place")
      .query({ id: PLACE_ID });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe("GEOCODING_UNAVAILABLE");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when Google refuses the key or doesn't answer in time", async () => {
    googleAnswers({ error: { message: "API key not valid." } }, 400);
    const refused = await request(makeApp())
      .get("/api/geocode/place")
      .query({ id: PLACE_ID });
    expect(refused.status).toBe(503);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );
    const timedOut = await request(makeApp())
      .get("/api/geocode/location")
      .query({ lat: "43.65", lng: "-79.38" });
    expect(timedOut.status).toBe(503);
    expect(timedOut.body.message).toBe(
      "Address lookup isn't working right now. You can still type your address.",
    );
  });
});

it("limits address lookups per IP address", async () => {
  googleAnswers(CITY_HALL);
  const app = makeApp({ geocodeLimitPerHour: 2 });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request(app)
      .get("/api/geocode/place")
      .query({ id: PLACE_ID });
    expect(response.status).toBe(200);
  }
  const limited = await request(app)
    .get("/api/geocode/place")
    .query({ id: PLACE_ID });

  expect(limited.status).toBe(429);
  expect(limited.body.error).toBe("TOO_MANY_REQUESTS");
  expect(limited.headers["retry-after"]).toBeDefined();
});

describe("addressFromComponents", () => {
  it("puts a unit number in front of the street", () => {
    expect(
      addressFromComponents([
        part("1204", "1204", "subpremise"),
        ...QUEEN_STREET,
      ]).address,
    ).toBe("1204-100 Queen Street West, Toronto, ON");
  });

  it("works with only a city", () => {
    expect(
      addressFromComponents([
        part("Hamilton", "Hamilton", "locality"),
        part("Ontario", "ON", "administrative_area_level_1"),
        part("Canada", "CA", "country"),
      ]),
    ).toEqual({ address: "Hamilton, ON", postalCode: "", country: "CA" });
  });
});
