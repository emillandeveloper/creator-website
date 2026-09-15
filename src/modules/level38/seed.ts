import { PrismaClient } from "@prisma/client";
import { EVENT_SLUG } from "./service";
import { QUEST_CONTENT, questTextData } from "./quest-content";

const games = [
  { slug: "ff5", title: "Final Fantasy V" },
  { slug: "ff6", title: "Final Fantasy VI" },
  { slug: "ff9", title: "Final Fantasy IX" },
];
export async function seedLevel38(db: PrismaClient): Promise<boolean> {
  return db.$transaction(async (tx) => {
    // Seed only a new event. Rerunning this command must never reset a live event.
    if (await tx.event.findUnique({ where: { slug: EVENT_SLUG } })) return false;
    const event = await tx.event.create({ data: { slug: EVENT_SLUG, title: "LEVEL 38", target: 38 } });
    let firstGameId: string | undefined;
    for (const sample of games) {
      const game = await tx.game.create({ data: { ...sample, eventId: event.id, sortOrder: games.indexOf(sample) } });
      firstGameId ??= game.id;
      await tx.quest.createMany({ data: QUEST_CONTENT.filter(quest => quest.gameSlug === sample.slug).map(quest => ({
        eventId: event.id, gameId: game.id, number: quest.number, ...questTextData(quest),
        isSecret: quest.isSecret,
        status: quest.isSecret ? "SECRET" : "AVAILABLE",
        initialStatus: quest.isSecret ? "SECRET" : "AVAILABLE",
      })) });
    }
    await tx.event.update({ where: { id: event.id }, data: { currentGameId: firstGameId } });
    return true;
  });
}
