import { PrismaClient } from "@prisma/client";
import { EVENT_SLUG } from "./service";

const games = [
  { slug: "ff5", title: "Final Fantasy V" },
  { slug: "ff6", title: "Final Fantasy VI" },
  { slug: "ff9", title: "Final Fantasy IX" },
];
const challenges = [
  "Win the opening encounter", "Win without using items", "Find a hidden chest",
  "Visit a new town", "Defeat an optional enemy", "Win with the starting equipment",
  "Survive a difficult encounter", "Discover a new ability", "Finish a dungeon",
  "Win without fleeing", "Find a rare item", "Complete a side objective",
  "Win a boss encounter", "Explore an optional area", "Reach the next save point",
  "Let chat choose the party", "Secret treasure hunt", "Secret final encounter",
];

export async function seedLevel38(db: PrismaClient): Promise<boolean> {
  return db.$transaction(async (tx) => {
    // Seed only a new event. Rerunning this command must never reset a live event.
    if (await tx.event.findUnique({ where: { slug: EVENT_SLUG } })) return false;
    const event = await tx.event.create({ data: { slug: EVENT_SLUG, title: "LEVEL 38", target: 38 } });
    let number = 0;
    let firstGameId: string | undefined;
    for (const sample of games) {
      const game = await tx.game.create({ data: { ...sample, eventId: event.id, sortOrder: games.indexOf(sample) } });
      firstGameId ??= game.id;
      await tx.quest.createMany({ data: challenges.map((title, index) => ({
        eventId: event.id, gameId: game.id, number: ++number, title,
        description: "Starter challenge: agree on a suitable objective for the current save before activating.",
        isSecret: index >= 16,
        status: index >= 16 ? "SECRET" : "AVAILABLE",
      })) });
    }
    await tx.event.update({ where: { id: event.id }, data: { currentGameId: firstGameId } });
    return true;
  });
}
