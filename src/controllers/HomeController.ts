import { Request, Response } from "express";
import {
  PROFILE, SOCIALS, SCHEDULE, GAMES, CAT_COLORS, CAT_LABELS, UI, Lang
} from "../models/data";

import { CHALLENGE_SLUGS } from "../models/challenges";
import { getMadridDayIndex, getScheduledSpotlight, getTimeZoneLabel, TWITCH_URL } from "../services/stream-schedule";

export const HomeController = {
  index(req: Request, res: Response): void {
    /* Idioma: ?lang=es lo fuerza; por defecto inglés */
    const q = (req.query.lang as string) || "";
    const lang: Lang = q === "es" ? "es" : "en";

    res.render("index", {
      lang,
      profile: PROFILE,
      challengeSlugs: CHALLENGE_SLUGS,
      spotlight: getScheduledSpotlight(lang),
      twitchUrl: TWITCH_URL,
      timeZoneLabel: getTimeZoneLabel(),
      socials: SOCIALS,
      schedule: SCHEDULE,
      nowPlayingGames: GAMES.filter((game) => game.status === "playing"),
      challengeGames: GAMES.filter((game) => game.type === "challenge" && game.status !== "upcoming"),
      playthroughGames: GAMES.filter((game) => game.type === "playthrough" && game.status !== "upcoming"),
      catColors: CAT_COLORS,
      catLabels: CAT_LABELS,
      ui: UI,
      todayIndex: getMadridDayIndex(),
    });
  },
};
