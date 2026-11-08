import { Request, Response } from "express";
import { GAMES, PROFILE, UI, Lang } from "../models/data";
import { CHALLENGES } from "../models/challenges";
import { TWITCH_URL } from "../services/stream-schedule";

export const ChallengeController = {
  show(req: Request, res: Response): void {
    const lang: Lang = req.query.lang === "es" ? "es" : "en";
    const challenge = CHALLENGES.find((entry) => entry.slug === req.params.slug);
    const game = challenge && GAMES.find((entry) => entry.title === challenge.gameTitle && entry.type === "challenge" && entry.status !== "upcoming");
    if (!challenge || !game) {
      res.status(404).render("challenge-not-found", { lang, profile: PROFILE });
      return;
    }
    res.render("challenge", { lang, profile: PROFILE, ui: UI, challenge, game, twitchUrl: TWITCH_URL });
  },
};
