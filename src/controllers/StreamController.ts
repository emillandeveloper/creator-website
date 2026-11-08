import { Request, Response } from "express";
import { Lang } from "../models/data";
import { getScheduledSpotlight } from "../services/stream-schedule";
import { twitchLiveStatus } from "../services/twitch-live";

export const StreamController = {
  async status(req: Request, res: Response): Promise<void> {
    const lang: Lang = req.query.lang === "es" ? "es" : "en";
    const live = await twitchLiveStatus.get();
    const schedule = getScheduledSpotlight(lang);
    res.set("Cache-Control", "no-store");
    res.json({
      ...(live ? {
        mode: "live", label: lang === "es" ? "En directo" : "Live now",
        game: live.game, detail: live.title,
        linkLabel: lang === "es" ? "Ver directo" : "Watch live",
      } : schedule),
      schedule,
    });
  },
};
