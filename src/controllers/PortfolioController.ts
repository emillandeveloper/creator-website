import { Request, Response } from "express";
import {
  DEV_PROFILE, DEV_PROJECTS, TECH_STACK, DEV_UI, Lang
} from "../models/data";

export const PortfolioController = {
  index(req: Request, res: Response): void {
    const q = (req.query.lang as string) || "";
    const lang: Lang = q === "es" ? "es" : "en";

    res.render("portfolio", {
      lang,
      dev: DEV_PROFILE,
      projects: DEV_PROJECTS,
      stack: TECH_STACK,
      ui: DEV_UI,
    });
  },
};
