import { Request, Response } from "express";
import { PROFILE, UI, Lang } from "../models/data";
import { DEFAULT_CATALOG, CatalogEntry } from "../services/catalog";
import { TWITCH_URL } from "../services/stream-schedule";

export const ChallengeController = {
  show(req: Request, res: Response): void {
    const lang: Lang = req.query.lang === "es" ? "es" : "en";
    const games: CatalogEntry[] = res.locals?.catalogGames ?? DEFAULT_CATALOG;
    const game = games.find(entry => entry.challengeSlug === req.params.slug && entry.type === "challenge" && entry.status !== "upcoming");
    if (!game) {
      res.status(404).render("challenge-not-found", { lang, profile: PROFILE });
      return;
    }
    const challenge = { ...game.details, format: { en: game.details.format.en || "Challenge", es: game.details.format.es || "Desafío" } };
    res.render("challenge", { lang, profile: PROFILE, ui: UI, challenge, game, twitchUrl: TWITCH_URL });
  },
};
