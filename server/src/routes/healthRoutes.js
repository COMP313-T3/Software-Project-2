import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";

/**
 * Routes under /api/health.
 */
export const healthRoutes = Router();

healthRoutes.get("/", getHealth);
