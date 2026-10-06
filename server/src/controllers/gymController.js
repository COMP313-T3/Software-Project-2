import * as gymService from "../services/gymService.js";
import {
  createGymSchema,
  gymIdParamsSchema,
  listGymsQuerySchema,
} from "../schemas/gymSchemas.js";

/** Returns the parsed data, or sends a 400 and returns null. */
function parseOrReject(schema, data, res) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const issues = result.error.issues;
  res.status(400).json({
    message: issues[0].message,
    errors: issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  });
  return null;
}

export async function createGym(req, res, next) {
  try {
    const input = parseOrReject(createGymSchema, req.body, res);
    if (!input) return;

    res.status(201).json(await gymService.createGym(input));
  } catch (err) {
    next(err);
  }
}

export async function listGyms(req, res, next) {
  try {
    const query = parseOrReject(listGymsQuerySchema, req.query, res);
    if (!query) return;

    res.json(await gymService.listGyms(query));
  } catch (err) {
    next(err);
  }
}

export async function getGym(req, res, next) {
  try {
    const params = parseOrReject(gymIdParamsSchema, req.params, res);
    if (!params) return;

    res.json(await gymService.getGymById(params.gymId));
  } catch (err) {
    next(err);
  }
}