import { Router } from "express";
import { HomeController } from "../controllers/HomeController";
import { PortfolioController } from "../controllers/PortfolioController";
import { ChallengeController } from "../controllers/ChallengeController";
import { StreamController } from "../controllers/StreamController";

const router = Router();

router.get("/", HomeController.index);
router.get("/challenges/:slug", ChallengeController.show);
router.get("/api/stream-status", StreamController.status);
router.get("/portfolio", PortfolioController.index);

export default router;
