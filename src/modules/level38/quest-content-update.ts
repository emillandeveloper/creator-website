import { PrismaClient } from "@prisma/client";
import { GAME_CONTENT, QUEST_CONTENT, questTextData } from "./quest-content";
import legacy from "./legacy-quest-content.json";
import { EVENT_SLUG } from "./state";

const legacyDescription = "Starter challenge: agree on a suitable objective for the current save before activating.";
const legacyDescriptionEs = "Misión de prueba: acordad un objetivo adecuado para la partida actual antes de activarla.";
const distribution = { MULTI_GAME: 20, GAME_SPECIFIC: 28, COOPERATIVE: 6, SECRET: 6 };
const gameTitleIdentity = (title: string) => title.normalize("NFKC").toLowerCase()
  .replace(/\s*\((?:single-player|original)\)\s*/g, " ").replace(/\s+/g, " ").trim();

export interface CatalogSyncPlan {
  apply: boolean; canApply: boolean; blocked: string[];
  retire: { id: string; number: number }[]; create: number[]; update: number[]; unchanged: number[];
  createGames: string[]; activeAfter: number; distribution: typeof distribution;
}

/** Dry-run by default. The event lock serializes sync with operator actions and votes.
 * Legacy rows and foreign keys are never repurposed. Activity requires reconciliation.
 */
export async function syncQuestCatalog(db: PrismaClient, apply = false): Promise<CatalogSyncPlan> {
  return db.$transaction(async tx => {
    const [event] = await tx.$queryRaw<{ id: string; target: number }[]>`SELECT id, target FROM "Event" WHERE slug = ${EVENT_SLUG} FOR UPDATE`;
    if (!event) throw new Error("Seed LEVEL 38 before synchronizing the catalog.");
    const quests = await tx.quest.findMany({ where: { eventId: event.id }, include: { game: true, _count: { select: { pollOptions: true } } }, orderBy: { number: "asc" } });
    const games = await tx.game.findMany({ where: { eventId: event.id } });
    const plan: CatalogSyncPlan = { apply, canApply: false, blocked: [], retire: [], create: [], update: [], unchanged: [], createGames: [], activeAfter: 60, distribution };
    if (event.target !== 38) plan.blocked.push("The event target is not 38. Review the event configuration before applying.");
    const old = quests.filter(q => !q.catalogKey && !q.retiredAt);
    if (old.length && old.length !== legacy.length) plan.blocked.push(`Expected the complete 54-quest legacy catalog; found ${old.length} active unkeyed rows. Operator reconciliation required.`);
    for (const quest of old) {
      const source = legacy.find(item => item.number === quest.number && item.gameSlug === quest.game.slug);
      const priorTitle = ({ 13: "Gana un combate contra un jefe", 17: "Búsqueda del tesoro secreta" } as Record<number, string>)[(quest.number - 1) % 18 + 1];
      const recognized = source && quest.title === source.title.en && [source.description.en, legacyDescription].includes(quest.description) &&
        (!quest.titleEs || quest.titleEs === source.title.es || quest.titleEs === priorTitle) &&
        (!quest.descriptionEs || [source.description.es, legacyDescriptionEs].includes(quest.descriptionEs)) && quest.isSecret === source.isSecret;
      const audited = await tx.auditLog.count({ where: { eventId: event.id, OR: [{ entityId: quest.id }, { action: { in: ["owner:progress", "owner:prepare"] } }] } });
      if (!recognized) plan.blocked.push(`Legacy quest #${quest.number} (${quest.id}) has unrecognized/custom content. Operator identity mapping required.`);
      if (quest.status !== (quest.isSecret ? "SECRET" : "AVAILABLE") || quest.initialStatus !== (quest.isSecret ? "SECRET" : "AVAILABLE") ||
          quest.revealedAt || quest.completedAt || quest._count.pollOptions || audited) {
        plan.blocked.push(`Legacy quest #${quest.number} (${quest.id}) has lifecycle, poll or audit history. Do not retire or transfer its progress automatically.`);
      }
      plan.retire.push({ id: quest.id, number: quest.number });
    }
    const keys = new Set(QUEST_CONTENT.map(q => q.key));
    for (const quest of quests.filter(q => q.catalogKey)) {
      if (!keys.has(quest.catalogKey!)) plan.blocked.push(`Unknown canonical identity ${quest.catalogKey}; operator reconciliation required.`);
      if (quest.retiredAt) plan.blocked.push(`Canonical identity ${quest.catalogKey} is retired; explicit operator reconciliation required.`);
    }
    for (const source of GAME_CONTENT) {
      if (games.some(g => g.slug === source.slug)) continue;
      if (games.some(g => gameTitleIdentity(g.title) === gameTitleIdentity(source.title))) {
        plan.blocked.push(`Game ${source.slug} already exists under another slug. Reconcile that edition instead of duplicating it.`);
      }
      plan.createGames.push(source.slug);
    }
    for (const source of QUEST_CONTENT) {
      const quest = quests.find(q => q.catalogKey === source.key);
      if (!quest) { plan.create.push(source.number); continue; }
      if (quest.number !== source.number) plan.blocked.push(`Canonical identity ${source.key} has a different catalog number; no automatic renumbering is allowed.`);
      const data = { ...questTextData(source), category: source.category, isSecret: source.isSecret, initialStatus: source.isSecret ? "SECRET" : "AVAILABLE" };
      if (Object.entries(data).some(([field, value]) => quest[field as keyof typeof quest] !== value)) plan.update.push(source.number);
      else plan.unchanged.push(source.number);
    }
    plan.canApply = !plan.blocked.length;
    if (!apply) return plan;
    if (!plan.canApply) throw new Error(`Catalog synchronization BLOCKED; no changes applied. Run the dry-run and resolve these decisions:\n${plan.blocked.join("\n")}`);
    if (!plan.retire.length && !plan.create.length && !plan.update.length && !plan.createGames.length) return plan;

    const gameIds = new Map(games.map(g => [g.slug, g.id]));
    for (const [sortOrder, source] of GAME_CONTENT.entries()) {
      const game = await tx.game.upsert({ where: { eventId_slug: { eventId: event.id, slug: source.slug } },
        create: { eventId: event.id, slug: source.slug, title: source.title, sortOrder }, update: {} });
      gameIds.set(source.slug, game.id);
    }
    // Release display numbers without changing historical content or relationships.
    if (plan.retire.length) await tx.quest.updateMany({ where: { id: { in: plan.retire.map(q => q.id) } }, data: { retiredAt: new Date() } });
    for (const source of QUEST_CONTENT) {
      const existing = quests.find(q => q.catalogKey === source.key);
      const data = { ...questTextData(source), category: source.category, isSecret: source.isSecret,
        initialStatus: source.isSecret ? "SECRET" as const : "AVAILABLE" as const };
      if (existing) {
        // Preserve lifecycle, chosen game and operator-managed eligibility on reruns.
        if (plan.update.includes(source.number)) await tx.quest.update({ where: { id: existing.id }, data });
      } else {
        const quest = await tx.quest.create({ data: { eventId: event.id, gameId: gameIds.get(source.gameSlug)!, catalogKey: source.key,
          number: source.number, ...data, status: data.initialStatus } });
        await tx.questGame.createMany({ data: source.eligibleGameSlugs.map(slug => ({ eventId: event.id, questId: quest.id, gameId: gameIds.get(slug)! })) });
      }
    }
    const active = await tx.quest.findMany({ where: { eventId: event.id, retiredAt: null } });
    if (active.length !== 60 || Object.entries(distribution).some(([category, count]) => active.filter(q => q.category === category).length !== count) ||
      active.filter(q => q.isSecret).length !== 6) throw new Error("Catalog invariant failed; transaction rolled back.");
    const updated = await tx.event.update({ where: { id: event.id }, data: { revision: { increment: 1 }, controlRevision: { increment: 1 } } });
    await tx.auditLog.create({ data: { eventId: event.id, operatorName: "Catalog sync", action: "catalog:synchronized", entityId: event.id,
      before: { active: old.length + quests.filter(q => q.catalogKey && !q.retiredAt).length }, after: { active: 60, distribution },
      metadata: { version: 2, retiredQuestIds: plan.retire.map(q => q.id), createdNumbers: plan.create, updatedNumbers: plan.update }, eventRevision: updated.revision } });
    return plan;
  }, { maxWait: 10000, timeout: 30000 });
}

// Preserve the existing import/command entry point for the new final sync.
export const updateStarterQuestContent = syncQuestCatalog;
