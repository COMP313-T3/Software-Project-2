import { afterEach, describe, expect, it, vi } from "vitest";
import { createAddressPoints } from "../src/services/addressPoints.js";
import { lookUpAddress } from "../src/services/geocodingService.js";
import { logger } from "../src/utils/logger.js";

const KEY = "maps-key-for-tests";
const DAY_MS = 24 * 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const HOGTOWN = { lat: 43.6383, lng: -79.4006 };

function result(granularity, types, { latitude = 43.6383, longitude = -79.4006 } = {}) {
  return { location: { latitude, longitude }, granularity, types };
}

const BUILDING = result("ROOFTOP", ["street_address"]);
const INTERPOLATED = result("RANGE_INTERPOLATED", ["street_address"]);
const GYM = result("GEOMETRIC_CENTER", ["establishment", "gym", "point_of_interest"]);
const CITY = result("APPROXIMATE", ["locality", "political"], {
  latitude: 43.6532,
  longitude: -79.3832,
});
const STREET = result("GEOMETRIC_CENTER", ["route"]);
const POSTAL_CODE = result("APPROXIMATE", ["postal_code"]);

function googleAnswers(body, status = 200) {
  const fetchMock = vi.fn(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lookUpAddress", () => {
  it("finds an address Google places at a building, asking with the server key", async () => {
    const fetchMock = googleAnswers({ results: [BUILDING] });

    await expect(lookUpAddress(KEY, "1 Bathurst St, Toronto")).resolves.toEqual(HOGTOWN);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://geocode.googleapis.com/v4/geocode/address/1%20Bathurst%20St%2C%20Toronto?languageCode=en&regionCode=CA",
    );
    expect(init.headers).toEqual({ "X-Goog-Api-Key": KEY });
  });

  it.each([
    ["a street number Google interpolates", INTERPOLATED],
    ["a named place, such as a gym", GYM],
  ])("finds %s", async (_, found) => {
    googleAnswers({ results: [found] });

    await expect(lookUpAddress(KEY, "Hogtown Bouldering")).resolves.toEqual(HOGTOWN);
  });

  it.each([
    ["a city", CITY],
    ["a street", STREET],
    ["a postal code", POSTAL_CODE],
  ])("doesn't place %s on its own", async (_, vague) => {
    googleAnswers({ results: [vague] });

    await expect(lookUpAddress(KEY, "Toronto")).resolves.toBeNull();
  });

  it("uses only Google's best match", async () => {
    googleAnswers({ results: [CITY, BUILDING] });

    await expect(lookUpAddress(KEY, "Bathurst")).resolves.toBeNull();
  });

  it("finds nothing when Google has no match", async () => {
    googleAnswers({});

    await expect(lookUpAddress(KEY, "Nowhere at all")).resolves.toBeNull();
  });

  it("throws when Google refuses the request", async () => {
    googleAnswers({ error: { message: "API key not valid." } }, 400);

    await expect(lookUpAddress(KEY, "1 Bathurst St, Toronto")).rejects.toThrow(
      "Geocoding returned HTTP 400: API key not valid.",
    );
  });
});

describe("createAddressPoints", () => {
  function setUp(lookUp = vi.fn(async () => HOGTOWN)) {
    let time = 1_000_000;
    const clock = {
      now: () => time,
      pass: (ms) => {
        time += ms;
      },
    };
    const pointsFor = createAddressPoints(KEY, { lookUp, now: clock.now });
    return { pointsFor, lookUp, clock };
  }

  it("finds each address once and remembers it for a day", async () => {
    const { pointsFor, lookUp, clock } = setUp();
    const address = "1 Bathurst St, Toronto";

    expect(await pointsFor([address])).toEqual(new Map([[address, HOGTOWN]]));
    clock.pass(DAY_MS - 1);
    expect(await pointsFor([address])).toEqual(new Map([[address, HOGTOWN]]));
    expect(lookUp).toHaveBeenCalledTimes(1);
    expect(lookUp).toHaveBeenCalledWith(KEY, address);

    clock.pass(1);
    await pointsFor([address]);
    expect(lookUp).toHaveBeenCalledTimes(2);
  });

  it("remembers an address Google can't place, and answers it without a point", async () => {
    const { pointsFor, lookUp } = setUp(vi.fn(async () => null));

    expect(await pointsFor(["Toronto"])).toEqual(new Map([["Toronto", null]]));
    expect(await pointsFor(["Toronto"])).toEqual(new Map([["Toronto", null]]));
    expect(lookUp).toHaveBeenCalledTimes(1);
  });

  it("finds the same address once, however it's spaced or capitalised", async () => {
    const { pointsFor, lookUp } = setUp();
    const typed = "1 Bathurst St, Toronto";
    const retyped = "  1  bathurst st, TORONTO ";

    const found = await pointsFor([typed, retyped, typed]);

    expect(found).toEqual(
      new Map([
        [typed, HOGTOWN],
        [retyped, HOGTOWN],
      ]),
    );
    expect(lookUp).toHaveBeenCalledTimes(1);
  });

  it("shares a lookup that's still running", async () => {
    const { pointsFor, lookUp } = setUp();
    const address = "1 Bathurst St, Toronto";

    const [first, second] = await Promise.all([pointsFor([address]), pointsFor([address])]);

    expect(first.get(address)).toEqual(HOGTOWN);
    expect(second.get(address)).toEqual(HOGTOWN);
    expect(lookUp).toHaveBeenCalledTimes(1);
  });

  it("tries a failed lookup again after 5 minutes, and logs the failure once", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const lookUp = vi.fn(async () => {
      throw new Error("Geocoding returned HTTP 403");
    });
    const { pointsFor, clock } = setUp(lookUp);
    const addresses = ["1 Bathurst St, Toronto", "2700 Dundas St W, Toronto"];

    expect(await pointsFor(addresses)).toEqual(
      new Map(addresses.map((address) => [address, null])),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Couldn't look up competition addresses for the map", {
      error: "Geocoding returned HTTP 403",
    });

    clock.pass(FIVE_MINUTES_MS - 1);
    await pointsFor(addresses);
    expect(lookUp).toHaveBeenCalledTimes(2);

    lookUp.mockResolvedValue(HOGTOWN);
    clock.pass(1);
    expect(await pointsFor(addresses)).toEqual(
      new Map(addresses.map((address) => [address, HOGTOWN])),
    );
    expect(lookUp).toHaveBeenCalledTimes(4);
  });

  it("starts at most 20 new lookups at a time, and the rest on the next search", async () => {
    const { pointsFor, lookUp } = setUp();
    const addresses = Array.from({ length: 25 }, (_, index) => `${index + 1} Queen St W, Toronto`);

    const first = await pointsFor(addresses);
    expect(first.size).toBe(20);
    expect(addresses.slice(20).some((address) => first.has(address))).toBe(false);
    expect(lookUp).toHaveBeenCalledTimes(20);

    expect((await pointsFor(addresses)).size).toBe(25);
    expect(lookUp).toHaveBeenCalledTimes(25);
  });

  it("skips blank addresses", async () => {
    const { pointsFor, lookUp } = setUp();

    expect(await pointsFor(["", "   "])).toEqual(new Map());
    expect(lookUp).not.toHaveBeenCalled();
  });

  it("forgets the oldest address once it remembers 1,000", async () => {
    const { pointsFor, lookUp } = setUp();
    const addresses = Array.from({ length: 1_001 }, (_, index) => `${index + 1} King St W`);
    for (let start = 0; start < addresses.length; start += 20) {
      await pointsFor(addresses.slice(start, start + 20));
    }
    expect(lookUp).toHaveBeenCalledTimes(1_001);

    await pointsFor([addresses[1_000], addresses[1]]);
    expect(lookUp).toHaveBeenCalledTimes(1_001);

    await pointsFor([addresses[0]]);
    expect(lookUp).toHaveBeenCalledTimes(1_002);
  });
});
