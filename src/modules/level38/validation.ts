import { PollType } from "@prisma/client";
import { Level38Error } from "./errors";

export function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Level38Error(400, "Expected a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function nickname(value: unknown): string {
  if (typeof value !== "string") throw new Level38Error(400, "Enter a nickname.");
  const cleaned = value.normalize("NFKC").trim();
  if ([...cleaned].length < 2 || [...cleaned].length > 24 || /[\p{C}<>]/u.test(cleaned)) {
    throw new Level38Error(400, "Use 2–24 characters without control characters or angle brackets.");
  }
  return cleaned;
}

export function revision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Level38Error(400, "A valid state revision is required.");
  }
  return value;
}

export function identifier(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new Level38Error(400, "Invalid identifier.");
  }
  return value;
}

export const QUEST_ACTIONS = ["activate", "complete", "fail", "skip", "reveal", "available"] as const;
export type QuestAction = typeof QUEST_ACTIONS[number];

export function questAction(value: unknown): QuestAction {
  if (typeof value !== "string" || !QUEST_ACTIONS.includes(value as QuestAction)) {
    throw new Level38Error(400, "Invalid quest action.");
  }
  return value as QuestAction;
}

export function textInput(value: unknown, label: string, max = 160): string {
  if (typeof value !== "string") throw new Level38Error(400, `${label} is required.`);
  const text = value.normalize("NFKC").trim();
  if (text.length < 2 || text.length > max || /[\p{C}<>]/u.test(text)) {
    throw new Level38Error(400, `${label} must be 2–${max} characters without control characters or angle brackets.`);
  }
  return text;
}

export interface PollInput {
  title: string;
  type: PollType;
  options: { label?: string; questId?: string; gameId?: string }[];
}

export function pollInput(value: unknown): PollInput {
  const body = bodyObject(value);
  if (typeof body.type !== "string" || !Object.values(PollType).includes(body.type as PollType)) {
    throw new Level38Error(400, "Invalid poll type.");
  }
  const type = body.type as PollType;
  if (!Array.isArray(body.options) || body.options.length > 8) throw new Level38Error(400, "Use up to 8 poll options.");
  const options = body.options.map((value: unknown) => {
    const option = bodyObject(value);
    if (type === "NEXT_QUEST") return { questId: identifier(option.questId) };
    if (type === "NEXT_GAME") return { gameId: identifier(option.gameId) };
    return { label: textInput(option.label, "Option", 100) };
  });
  return { title: textInput(body.title, "Poll question"), type, options: type === "YES_NO" ? [{ label: "Yes" }, { label: "No" }] : options };
}

export function pollAction(value: unknown): "open" | "close" {
  if (value !== "open" && value !== "close") throw new Level38Error(400, "Choose open or close.");
  return value;
}
