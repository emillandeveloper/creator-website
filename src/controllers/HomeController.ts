import { Request, Response } from "express";
import {
  PROFILE, SOCIALS, SCHEDULE, GAMES, CAT_COLORS, CAT_LABELS, UI, Lang
} from "../models/data";

function getTodayIndex(): number {
  const jsDay = new Date().getDay();
  const map = [6, 0, 1, 2, 3, 4, 5];
  return map[jsDay];
}

export const HomeController = {
  index(req: Request, res: Response): void {
    /* Idioma: ?lang=es lo fuerza; por defecto inglés */
    const q = (req.query.lang as string) || "";
    const lang: Lang = q === "es" ? "es" : "en";

    res.render("index", {
      lang,
      profile: PROFILE,
      socials: SOCIALS,
      schedule: SCHEDULE,
      nowPlayingGames: GAMES.filter((game) => game.status === "playing"),
      challengeGames: GAMES.filter((game) => game.type === "challenge" && game.status !== "upcoming"),
      playthroughGames: GAMES.filter((game) => game.type === "playthrough" && game.status !== "upcoming"),
      catColors: CAT_COLORS,
      catLabels: CAT_LABELS,
      ui: UI,
      todayIndex: getTodayIndex(),
    });
  },
};
