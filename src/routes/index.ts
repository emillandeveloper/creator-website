import { RequestHandler, Router } from "express";
import { HomeController } from "../controllers/HomeController";
import { PortfolioController } from "../controllers/PortfolioController";
import { ChallengeController } from "../controllers/ChallengeController";
import { StreamController } from "../controllers/StreamController";
import { CatalogStore } from "../services/catalog";

export default function createRoutes(catalog: CatalogStore) {
  const router = Router();
  const loadCatalog: RequestHandler = (_req, res, next) => {
    catalog.list().then(games => { res.locals.catalogGames = games; next(); }).catch(() => {
      res.status(503).send("El catálogo no está disponible temporalmente. Vuelve a intentarlo en unos momentos.");
    });
  };

  router.get("/", loadCatalog, HomeController.index);
  router.get("/challenges/:slug", loadCatalog, ChallengeController.show);
  router.get("/api/stream-status", StreamController.status);
  router.get("/portfolio", PortfolioController.index);

  return router;
}
