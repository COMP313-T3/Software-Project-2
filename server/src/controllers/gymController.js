import * as gymService from "../services/gymService.js";

const GYM_STATUSES = ["PENDING", "ACTIVE", "INACTIVE"];

export async function createGym(req, res, next) {
  try {
    const { name, location, status } = req.body;

    if (!name?.trim() || !location?.trim()) {
      return res.status(400).json({ message: "name and location are required" });
    }
    if (status && !GYM_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of ${GYM_STATUSES.join(", ")}` });
    }

    const gym = await gymService.createGym({
      name: name.trim(),
      location: location.trim(),
      status,
    });
    res.status(201).json(gym);
  } catch (err) {
    next(err);
  }
}

export async function listGyms(req, res, next) {
  try {
    const { status } = req.query;
    if (status && !GYM_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status filter" });
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    res.json(await gymService.listGyms({ status, page, limit }));
  } catch (err) {
    next(err);
  }
}

export async function getGym(req, res, next) {
  try {
    res.json(await gymService.getGymById(req.params.gymId));
  } catch (err) {
    next(err);
  }
}