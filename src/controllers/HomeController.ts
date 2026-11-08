import { Request, Response } from "express";
import {
  PROFILE, SOCIALS, SCHEDULE, CAT_COLORS, CAT_LABELS, UI, Lang
} from "../models/data";

import { CHALLENGE_SLUGS } from "../models/challenges";
import { DEFAULT_CATALOG, CatalogEntry } from "../services/catalog";
import { getMadridDayIndex, getScheduledSpotlight, getTimeZoneLabel, TWITCH_URL } from "../services/stream-schedule";

export const HomeController = {
  index(req: Request, res: Response): void {
    /* Idioma: ?lang=es lo fuerza; por defecto inglés */
    const q = (req.query.lang as string) || "";
    const lang: Lang = q === "es" ? "es" : "en";
    const games: CatalogEntry[] = res.locals?.catalogGames ?? DEFAULT_CATALOG;

    res.render("index", {
      lang,
      profile: PROFILE,
      challengeSlugs: CHALLENGE_SLUGS,
      spotlight: getScheduledSpotlight(lang),
      twitchUrl: TWITCH_URL,
      timeZoneLabel: getTimeZoneLabel(),
      socials: SOCIALS,
      schedule: SCHEDULE,
      nowPlayingGames: games.filter((game) => game.status === "playing"),
      challengeGames: games.filter((game) => game.type === "challenge" && game.status !== "upcoming"),
      playthroughGames: games.filter((game) => game.type === "playthrough" && game.status !== "upcoming"),
      catColors: CAT_COLORS,
      catLabels: CAT_LABELS,
      ui: UI,
      todayIndex: getMadridDayIndex(),
    });
  },
};
