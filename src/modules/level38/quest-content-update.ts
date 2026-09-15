import { PrismaClient } from "@prisma/client";
import { QUEST_CONTENT, questTextData } from "./quest-content";
import { EVENT_SLUG } from "./state";

const legacyDescription = "Starter challenge: agree on a suitable objective for the current save before activating.";
const legacyDescriptionEs = "Misión de prueba: acordad un objetivo adecuado para la partida actual antes de activarla.";

// Deliberately limited to recognizable untouched starters, never a general content importer.
// Dry run by default. One transaction + event lock protects concurrent operator actions.
export async function updateStarterQuestContent(db: PrismaClient, apply = false) {
  return db.$transaction(async tx => {
    const [event] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Event" WHERE slug = ${EVENT_SLUG} FOR UPDATE`;
    if (!event) throw new Error("Seed LEVEL 38 before updating starter content.");
    const quests = await tx.quest.findMany({ where: { eventId: event.id }, include: { game: true }, orderBy: { number: "asc" } });
    const result = { apply, updated: [] as number[], unchanged: [] as number[], skipped: [] as number[] };
    for (const quest of quests) {
      const source = QUEST_CONTENT.find(item => item.number === quest.number && item.gameSlug === quest.game.slug);
      if (!source || quest.title !== source.title.en ||
          ![legacyDescription, source.description.en].includes(quest.description)) {
        result.skipped.push(quest.number); continue;
      }
      // Preserve bespoke Spanish edits. Known prior starter titles can differ from the polished catalog.
      const priorTitles: Record<number, string> = { 13: "Gana un combate contra un jefe", 17: "Búsqueda del tesoro secreta" };
      const priorTitle = priorTitles[(quest.number - 1) % 18 + 1];
      if ((quest.titleEs?.trim() && quest.titleEs !== source.title.es && quest.titleEs !== priorTitle) ||
          (quest.descriptionEs?.trim() && ![legacyDescriptionEs, source.description.es].includes(quest.descriptionEs))) {
        result.skipped.push(quest.number); continue;
      }
      const data = questTextData(source);
      if (Object.entries(data).every(([field, value]) => quest[field as keyof typeof data] === value)) {
        result.unchanged.push(quest.number); continue;
      }
      result.updated.push(quest.number);
      if (apply) await tx.quest.update({ where: { id: quest.id }, data });
    }
    if (apply && result.updated.length) await tx.event.update({ where: { id: event.id }, data: { revision: { increment: 1 }, controlRevision: { increment: 1 } } });
    return result;
  });
}
