import content from "./quest-content.json";

export interface QuestContent {
  key: string;
  number: number;
  gameSlug: string;
  isSecret: boolean;
  title: { en: string; es: string };
  description: { en: string; es: string };
}

// Shared by seeding, the content-update command and the mandatory unit suite.
export function validateQuestContent(value: unknown): asserts value is QuestContent[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Quest content must be a nonempty array.");
  const keys = new Set(), numbers = new Set();
  for (const [index, quest] of value.entries()) {
    const label = `Quest content #${index + 1}`;
    if (!quest || typeof quest.key !== "string" || !/^[a-z0-9-]+$/.test(quest.key) || keys.has(quest.key) ||
        !Number.isInteger(quest.number) || quest.number < 1 || numbers.has(quest.number) ||
        !["ff5", "ff6", "ff9"].includes(quest.gameSlug) || typeof quest.isSecret !== "boolean") {
      throw new Error(`${label}: invalid/duplicate identity or game.`);
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
