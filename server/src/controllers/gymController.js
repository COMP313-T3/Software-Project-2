import * as gymService from "../services/gymService.js";
import { gymIdParamsSchema } from "../schemas/gymSchemas.js";
import { validationError } from "../middleware/validateBody.js";

function parseGymId(params) {
  const result = gymIdParamsSchema.safeParse(params);
  if (!result.success) throw validationError(result.error.issues);
  return result.data.gymId;
}

export async function createGym(req, res) {
  res.status(201).json(await gymService.createGym(req.body));
}

export async function listGyms(req, res) {
  res.json(await gymService.listGyms(res.locals.query));
}

export async function getGym(req, res) {
  res.json(await gymService.getGymById(parseGymId(req.params)));
}

export async function updateGym(req, res) {
  res.json(await gymService.updateGym(parseGymId(req.params), req.body));
}

export async function deactivateGym(req, res) {
  res.json(await gymService.deactivateGym(parseGymId(req.params)));
}