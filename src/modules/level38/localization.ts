import { RequestHandler } from "express";
import path from "path";
import { CLASS_CATALOG } from "./classes";

// One catalog/selection implementation is consumed by both EJS and browser scripts.
export const translations = require(path.join(__dirname, "../../../public/js/level38/translations.js")) as {
  translate(lang: string, key: string, params?: Record<string, unknown>): string;
  questText(quest: unknown, field: string, lang: string): string;
  language(preference: string | undefined, browser: string | undefined, control: boolean): string;
};
export const localization: RequestHandler = (req, res, next) => {
  const preference = req.headers.cookie?.match(/(?:^|;\s*)level38_lang=(es|en)(?:;|$)/)?.[1];
  const browser = req.get("Accept-Language")?.split(",")[0].split(";")[0].trim();
  const lang = translations.language(preference, browser, req.path.startsWith("/control"));
  res.locals.lang = lang;
  res.locals.t = (key: string, params?: Record<string, unknown>) => translations.translate(lang, key, params);
  res.locals.questText = (quest: unknown, field: string) => translations.questText(quest, field, lang);
  res.locals.classNames = Object.fromEntries(CLASS_CATALOG.map(job => [job.id, job.displayNames]));
  next();
};
