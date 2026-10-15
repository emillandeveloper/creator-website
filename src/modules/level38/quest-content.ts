import content from "./quest-content.json";
import games from "./game-content.json";

export type QuestCategory = "MULTI_GAME" | "GAME_SPECIFIC" | "COOPERATIVE" | "SECRET";

export interface GameContent {
  slug: string;
  title: string;
  // Candidate eligibility is not evidence of save readiness. Every entry starts NOT CHECKED.
  technicalNotes: { en: string; es: string };
}

export interface QuestContent {
  key: string;
  number: number;
  /** Primary/default eligible game; a quest still awards exactly one completion. */
  gameSlug: string;
  eligibleGameSlugs: string[];
  category: QuestCategory;
  isSecret: boolean;
  title: { en: string; es: string };
  description: { en: string; es: string };
}

export function validateGameContent(value: unknown): asserts value is GameContent[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Game content must be a nonempty array.");
  const slugs = new Set<string>();
  for (const game of value) {
    if (!game || typeof game.slug !== "string" || !/^[a-z0-9-]+$/.test(game.slug) || slugs.has(game.slug) ||
        typeof game.title !== "string" || !game.title.trim() || /[\u0000-\u001f\uFFFD<>]/.test(game.title) ||
        ["en", "es"].some(locale => typeof game.technicalNotes?.[locale] !== "string" || !game.technicalNotes[locale].trim())) {
      throw new Error("Game content: invalid/duplicate game identity or missing technical notes.");
    }
    slugs.add(game.slug);
  }
}

validateGameContent(games);
export const GAME_CONTENT: readonly GameContent[] = games;

// Shared by seeding, catalog synchronization and the mandatory unit suite.
export function validateQuestContent(value: unknown): asserts value is QuestContent[] {
  if (!Array.isArray(value) || value.length !== 60) throw new Error("Quest content must contain exactly 60 quests.");
  const keys = new Set(), numbers = new Set();
  const gameSlugs = new Set(GAME_CONTENT.map(game => game.slug));
  for (const [index, quest] of value.entries()) {
    const label = `Quest content #${index + 1}`;
    if (!quest || typeof quest.key !== "string" || !/^q\d{2}-[a-z0-9-]+$/.test(quest.key) || keys.has(quest.key) ||
        !Number.isInteger(quest.number) || quest.number < 1 || quest.number > 60 || numbers.has(quest.number) ||
        !quest.key.startsWith(`q${String(quest.number).padStart(2, "0")}-`) ||
        !gameSlugs.has(quest.gameSlug) || typeof quest.isSecret !== "boolean") {
      throw new Error(`${label}: invalid/duplicate identity or game.`);
    }
    const expectedCategory: QuestCategory = quest.number <= 20 ? "MULTI_GAME" : quest.number <= 48 ? "GAME_SPECIFIC" : quest.number <= 54 ? "COOPERATIVE" : "SECRET";
    if (quest.category !== expectedCategory || quest.isSecret !== (expectedCategory === "SECRET")) {
      throw new Error(`${label}: category/secret flag does not match its canonical number.`);
    }
    if (!Array.isArray(quest.eligibleGameSlugs) || !quest.eligibleGameSlugs.length ||
        new Set(quest.eligibleGameSlugs).size !== quest.eligibleGameSlugs.length ||
        quest.eligibleGameSlugs.some((slug: unknown) => typeof slug !== "string" || !gameSlugs.has(slug)) ||
        !quest.eligibleGameSlugs.includes(quest.gameSlug) ||
        (quest.category === "MULTI_GAME" && quest.eligibleGameSlugs.length < 2) ||
        (["GAME_SPECIFIC", "COOPERATIVE"].includes(quest.category) && quest.eligibleGameSlugs.length !== 1)) {
      throw new Error(`${label}: invalid eligible games.`);
    }
    keys.add(quest.key); numbers.add(quest.number);
    for (const field of ["title", "description"] as const) for (const locale of ["en", "es"] as const) {
      const text = quest[field]?.[locale];
      const invalidCharacters = field === "title" ? /[\u0000-\u001f\uFFFD<>]/ : /[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFD<>]/;
      if (typeof text !== "string" || !text.trim() || text !== text.trim() || invalidCharacters.test(text)) {
        throw new Error(`${label} (${quest.key}): missing/invalid ${field}.${locale}.`);
      }
    }
  }
}

validateQuestContent(content);
export const QUEST_CONTENT: readonly QuestContent[] = content;
export const questTextData = (quest: QuestContent) => ({
  title: quest.title.en, titleEs: quest.title.es,
  description: quest.description.en, descriptionEs: quest.description.es,
});

const warned = new Set<string>();
export function warnMissingQuestTranslations(quest: { id: string; title: string; description: string; titleEs: string | null; descriptionEs: string | null }) {
  if (process.env.NODE_ENV === "production") return;
  const missing = ["title", "description", "titleEs", "descriptionEs"].filter(field => !quest[field as keyof typeof quest]?.trim());
  const key = `${quest.id}:${missing.join(",")}`;
  if (missing.length && !warned.has(key)) {
    if (warned.size >= 256) warned.clear();
    warned.add(key);
    // Log identifiers/field names only; never expose secret quest prose.
    console.warn(`[LEVEL 38] Quest ${quest.id} missing translations: ${missing.join(", ")}`);
  }
}
