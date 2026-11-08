import { Lang, SCHEDULE } from "../models/data";

export const STREAM_TIME_ZONE = "Europe/Madrid";
export const TWITCH_LOGIN = "leonifelheim";
export const TWITCH_URL = `https://www.twitch.tv/${TWITCH_LOGIN}`;

export interface StreamSpotlight {
  mode: "live" | "upcoming" | "scheduled";
  label: string;
  game: string;
  detail: string;
  linkLabel: string;
}

function localParts(date: Date) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: STREAM_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

export function getMadridDayIndex(now = new Date()): number {
  const parts = localParts(now);
  const day = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day)).getUTCDay();
  return (day + 6) % 7;
}

export function getTimeZoneLabel(now = new Date()): string {
  const offset = new Intl.DateTimeFormat("en", {
    timeZone: STREAM_TIME_ZONE, timeZoneName: "shortOffset",
  }).formatToParts(now).find((part) => part.type === "timeZoneName")!.value;
  return `Madrid · ${offset.replace("GMT", "UTC")}`;
}

// Convert a Madrid wall-clock time into an instant without assuming a fixed
// UTC offset. The two seasonal offsets are resolved through Intl's IANA data.
function madridInstant(date: Date, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute);
  let instant = target;
  for (let pass = 0; pass < 3; pass++) {
    const parts = localParts(new Date(instant));
    const rendered = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    instant += target - rendered;
  }
  return new Date(instant);
}

export function getScheduledSpotlight(lang: Lang, now = new Date()): StreamSpotlight {
  const parts = localParts(now);
  const today = Date.UTC(+parts.year, +parts.month - 1, +parts.day);
  for (let offset = 0; offset < 8; offset++) {
    const date = new Date(today + offset * 86400000);
    const day = SCHEDULE[(date.getUTCDay() + 6) % 7];
    const start = madridInstant(date, day.timeStart);
    const end = madridInstant(date, day.timeEnd);
    if (now >= end) continue;
    const scheduled = now >= start;
    const dayLabel = offset === 0 ? (lang === "es" ? "Hoy" : "Today")
      : offset === 1 ? (lang === "es" ? "Mañana" : "Tomorrow") : day.name[lang];
    return {
      mode: scheduled ? "scheduled" : "upcoming",
      label: scheduled ? (lang === "es" ? "Horario de hoy" : "Today's schedule")
        : (lang === "es" ? "Próximo directo previsto" : "Next scheduled stream"),
      game: day.subtitle[lang] === day.game ? day.game : `${day.game} · ${day.subtitle[lang]}`,
      detail: `${dayLabel} · ${day.timeStart}–${day.timeEnd} · ${getTimeZoneLabel(start)}`,
      linkLabel: lang === "es" ? "Ver en Twitch" : "Watch on Twitch",
    };
  }
  throw new Error("The weekly stream schedule is empty.");
}
