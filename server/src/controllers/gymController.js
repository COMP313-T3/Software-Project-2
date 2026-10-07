import * as gymService from "../services/gymService.js";
import { gymIdParamsSchema } from "../schemas/gymSchemas.js";
import { validationError } from "../middleware/validateBody.js";

export async function createGym(req, res) {
  res.status(201).json(await gymService.createGym(req.body));
}

export async function listGyms(req, res) {
  res.json(await gymService.listGyms(res.locals.query));
}

export async function getGym(req, res) {
  const result = gymIdParamsSchema.safeParse(req.params);
  if (!result.success) throw validationError(result.error.issues);
  res.json(await gymService.getGymById(result.data.gymId));
}