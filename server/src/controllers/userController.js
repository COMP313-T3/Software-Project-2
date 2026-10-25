import { createClimberAccount } from "../services/userService.js";

/**
 * Creates a climber account from a validated sign-up request.
 *
 * @param {import("express").Request} req Request whose body passed the sign-up checks.
 * @param {import("express").Response} res Responds 201 with { userId, status, role }.
 */
export async function registerClimber(req, res) {
  const user = await createClimberAccount(req.body);
  res.status(201).json({ userId: user.id, status: "created", role: user.role });
}
