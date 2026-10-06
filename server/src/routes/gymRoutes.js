import { Router } from "express";
import * as gymController from "../controllers/gymController.js";
// Names below are guesses: use your teammates' actual middleware/constants
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

// Every gym-management route is ADMIN only (FR-003, AC-006)
router.use(authenticate, requireRole("ADMIN"));

router.get("/", gymController.listGyms);        // AC-1: view list
router.post("/", gymController.createGym);      // AC-2: add gym
router.get("/:gymId", gymController.getGym);    // AC-3/4: select a gym, open details

export default router;