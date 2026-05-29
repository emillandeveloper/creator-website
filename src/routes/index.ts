import { Router } from "express";
import { HomeController } from "../controllers/HomeController";
import { PortfolioController } from "../controllers/PortfolioController";

const router = Router();

router.get("/", HomeController.index);
router.get("/portfolio", PortfolioController.index);

export default router;
