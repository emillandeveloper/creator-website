import { PrismaClient } from "@prisma/client";
import { EVENT_SLUG } from "./state";
import { GAME_CONTENT, QUEST_CONTENT, questTextData } from "./quest-content";

export async function seedLevel38(db: PrismaClient): Promise<boolean> {
  return db.$transaction(async tx => {
    // Existing events must use the reviewed dry-run/apply sync; seeding never resets them.
    if (await tx.event.findUnique({ where: { slug: EVENT_SLUG } })) return false;
    const event = await tx.event.create({ data: { slug: EVENT_SLUG, title: "LEVEL 38", target: 38 } });
    const games = new Map<string, string>();
    for (const [sortOrder, source] of GAME_CONTENT.entries()) {
      const game = await tx.game.create({ data: { eventId: event.id, slug: source.slug, title: source.title, sortOrder } });
      games.set(source.slug, game.id);
    }
    for (const source of QUEST_CONTENT) {
      const quest = await tx.quest.create({ data: { eventId: event.id, gameId: games.get(source.gameSlug)!,
        catalogKey: source.key, number: source.number, category: source.category, ...questTextData(source),
        isSecret: source.isSecret, status: source.isSecret ? "SECRET" : "AVAILABLE", initialStatus: source.isSecret ? "SECRET" : "AVAILABLE" } });
      await tx.questGame.createMany({ data: source.eligibleGameSlugs.map(slug => ({ eventId: event.id, questId: quest.id, gameId: games.get(slug)! })) });
    }
    await tx.event.update({ where: { id: event.id }, data: { currentGameId: games.get("ff5") ?? games.values().next().value } });
    return true;
  }, { maxWait: 10000, timeout: 30000 });
}
