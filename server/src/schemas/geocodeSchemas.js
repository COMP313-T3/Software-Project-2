import { z } from "zod";

const PLACE_MESSAGE = "Choose an address from the list.";
const POINT_MESSAGE = "Choose a point on the map.";
const PLACE_ID = /^[\w-]{1,512}$/;
const DECIMAL = /^-?\d{1,3}(\.\d{1,15})?$/;

function coordinate(limit) {
  return z
    .string({ error: POINT_MESSAGE })
    .trim()
    .regex(DECIMAL, { error: POINT_MESSAGE })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(-limit, { error: POINT_MESSAGE })
        .max(limit, { error: POINT_MESSAGE }),
    );
}

/** Query for GET /api/geocode/place: a place ID from Google's address suggestions. */
export const placeLookupSchema = z.object({
  id: z
    .string({ error: PLACE_MESSAGE })
    .trim()
    .regex(PLACE_ID, { error: PLACE_MESSAGE }),
});

/** Query for GET /api/geocode/location: a point on the map, in decimal degrees. */
export const locationLookupSchema = z.object({
  lat: coordinate(90),
  lng: coordinate(180),
});
