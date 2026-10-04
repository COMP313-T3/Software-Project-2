import { Router } from "express";
import { healthRoutes } from "./healthRoutes.js";

/**
 * Every route under /api. Each feature mounts its own router here.
 */
export const apiRoutes = Router();

apiRoutes.use("/health", healthRoutes);
