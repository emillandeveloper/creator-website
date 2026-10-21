import { Prisma } from "@prisma/client";
import { warnMissingQuestTranslations } from "./quest-content";
import { Level38Error } from "./errors";
import { leadingOptionIds, pollInclude } from "./poll-domain";
import { allowedQuestActions, isHidden } from "./quest-domain";
import { jsonObject, undoCandidate } from "./undo";

export const EVENT_SLUG = "level38";

export async function eventOrThrow(tx: Prisma.TransactionClient) {
  const event = await tx.event.findUnique({ where: { slug: EVENT_SLUG } });
  if (!event) throw new Level38Error(503, "LEVEL 38 is being prepared. Please check back soon.");
  return event;
}

export async function readState(tx: Prisma.TransactionClient, control: boolean) {
  const event = await eventOrThrow(tx);
  const games = await tx.game.findMany({ where: { eventId: event.id }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const quests = await tx.quest.findMany({ where: { eventId: event.id, retiredAt: null }, orderBy: { number: "asc" }, include: { eligibleGames: { orderBy: { gameId: "asc" } } } });
  for (const quest of quests) warnMissingQuestTranslations(quest);
  const visible = quests;
  const polls = await tx.poll.findMany({ where: { eventId: event.id, archivedAt: null, ...(control ? {} : { status: { not: "DRAFT" as const } }) }, orderBy: { number: "desc" }, include: pollInclude });
  const published = control ? polls : polls.filter((poll) => poll.options.every((option) => !option.quest || (!isHidden(option.quest) && !option.quest.retiredAt)) &&
    (!poll.contextQuestId || quests.some((quest) => quest.id === poll.contextQuestId && !isHidden(quest))));
  const audit = control ? await tx.auditLog.findMany({ where: { eventId: event.id }, orderBy: { eventRevision: "desc" }, take: 40 }) : [];
  const archived = control ? await tx.poll.findMany({ where: { eventId: event.id, archivedAt: { not: null } }, orderBy: { number: "desc" }, include: pollInclude }) : [];
  const undo = control ? await undoCandidate(tx, event.id) : null;
  const publicQuests = visible.map((quest) => {
    const redact = !control && isHidden(quest);
    return { id: quest.id, number: quest.number, gameId: redact ? null : quest.gameId,
      eligibleGameIds: redact ? [] : quest.eligibleGames.map((association) => association.gameId), category: redact ? "SECRET" as const : quest.category,
      title: redact ? "???" : quest.title, description: redact ? "" : quest.description,
      translations: { en: { title: redact ? "???" : quest.title, description: redact ? "" : quest.description },
        es: { title: redact ? "???" : quest.titleEs, description: redact ? "" : quest.descriptionEs } },
      status: isHidden(quest) ? "SECRET" as const : quest.status, hidden: isHidden(quest),
      updatedAt: redact ? null : quest.updatedAt.toISOString(), completedAt: redact ? null : quest.completedAt?.toISOString() ?? null,
      ...(control ? { actions: allowedQuestActions(quest) } : {}) };
  });
  // Existing controls allow multiple active quests. Select one deterministically
  // for OBS without changing quest statuses or revealing hidden content.
  const active = quests.filter((quest) => quest.status === "ACTIVE" && !isHidden(quest))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id.localeCompare(a.id))[0];
  const completion = quests.filter((quest) => quest.status === "COMPLETED" && quest.completedAt && !isHidden(quest))
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime() || b.id.localeCompare(a.id))[0];
  return {
    serverTime: Date.now(),
    party: { enabled: event.partyEnabled, nameMode: event.partyNameMode, maxVisible: event.partyMaxVisible },
    event: { title: event.title, target: event.target, revision: event.revision, controlRevision: event.controlRevision,
      unlockSequence: event.unlockSequence, resetSequence: event.resetSequence,
      ...(control ? { gameSource: event.gameSource, manualOverrideBy: event.manualOverrideBy } : {}),
      completed: quests.filter((quest) => quest.status === "COMPLETED").length, currentGameId: event.currentGameId },
    games: games.filter((game) => control || game.id === event.currentGameId || visible.some((quest) => !isHidden(quest) &&
      (quest.gameId === game.id || quest.eligibleGames.some((association) => association.gameId === game.id))) ||
      published.some((poll) => poll.options.some((option) => option.gameId === game.id)))
      .map((game) => ({ id: game.id, title: game.title, displayName: game.title, slug: game.slug, enabled: game.enabled, imagePath: game.imagePath, sortOrder: game.sortOrder,
        ...(control ? { twitchCategoryId: game.twitchCategoryId, twitchCategoryName: game.twitchCategoryName } : {}) })),
    quests: publicQuests,
    overlayActiveQuest: active ? publicQuests.find((quest) => quest.id === active.id)! : null,
    overlayQuestCompletion: completion ? publicQuests.find((quest) => quest.id === completion.id)! : null,
    secretCount: quests.filter(isHidden).length,
    polls: published.map((poll) => ({ id: poll.id, number: poll.number, title: poll.title, type: poll.type, status: poll.status,
      contextQuestId: poll.contextQuestId,
      createdAt: poll.createdAt.toISOString(), openedAt: poll.openedAt?.toISOString() ?? null, closedAt: poll.closedAt?.toISOString() ?? null,
      durationSeconds: poll.durationSeconds, endsAt: poll.endsAt?.toISOString() ?? null,
      cancelledAt: poll.cancelledAt?.toISOString() ?? null, closeReason: poll.closeReason, winnerAcceptedAt: poll.winnerAcceptedAt?.toISOString() ?? null,
      options: poll.options.map((option) => ({ id: option.id, label: option.label, questId: option.questId, gameId: option.gameId, votes: option._count.votes,
        ...(option.quest ? { translations: { en: { title: option.quest.title }, es: { title: option.quest.titleEs } } } : {}) })),
      totalVotes: poll.options.reduce((sum, option) => sum + option._count.votes, 0), leadingOptionIds: leadingOptionIds(poll),
      winningOptionId: poll.winningOptionId, overrideOptionId: poll.overrideOptionId, effectiveWinnerId: poll.overrideOptionId ?? poll.winningOptionId,
      ...(control ? { overrideReason: poll.overrideReason } : {}),
    })),
    ...(control ? {
      archivedPolls: archived.map(poll => ({ id: poll.id, number: poll.number, title: poll.title, type: poll.type, archivedAt: poll.archivedAt!.toISOString(),
        options: poll.options.map(option => ({ id: option.id, label: option.label, votes: option._count.votes,
          ...(option.quest ? { translations: { en: { title: option.quest.title }, es: { title: option.quest.titleEs } } } : {}) })),
        winner: poll.overrideOptionId ?? poll.winningOptionId })),
      audit: audit.map((log) => ({ id: log.id, operatorName: log.operatorName, action: log.action, entityId: log.entityId,
        before: log.before, after: log.after, metadata: log.metadata, undoOfId: log.undoOfId,
        revision: log.eventRevision, createdAt: log.createdAt.toISOString(), description: describeAction(log.action, jsonObject(log.before), jsonObject(log.after), jsonObject(log.metadata)) })),
      undo: { auditId: undo?.audit?.id ?? null, available: !!undo?.audit && !undo.reason, reason: undo?.reason ?? null,
        description: undo?.audit ? describeAction(undo.audit.action, jsonObject(undo.audit.before), jsonObject(undo.audit.after), jsonObject(undo.audit.metadata)) : "" },
    } : {}),
  };
}

function describeAction(action: string, before: Prisma.JsonObject, after: Prisma.JsonObject, metadata: Prisma.JsonObject): string {
  if (action === "party:configured") return "updated party overlay settings";
  if (action === "quest:game") return `selected game for quest #${after.number}`;
  if (action === "quest:games") return `configured eligible games for quest #${after.number}`;
  const ownerActions: Record<string, string> = { "owner:progress": "reset event progress", "owner:participants": "cleared test participants", "owner:prepare": "prepared a clean event", "owner:preview": "previewed the finale for connected clients" };
  if (ownerActions[action]) return ownerActions[action];
  const verbs: Record<string, string> = { "quest:activated": "activated", "quest:completed": "completed", "quest:failed": "failed", "quest:skipped": "skipped", "quest:revealed": "revealed", "quest:available": "made available" };
  if (verbs[action]) return `${verbs[action]} quest #${after.number} “${after.title ?? ""}”`;
  if (action === "game:changed") return `changed game from ${before.gameTitle ?? "Between adventures"} to ${after.gameTitle ?? "Between adventures"}`;
  if (action === "game:configured") return `configured game “${after.title}”`;
  if (action === "game:mapped") return `mapped Twitch category for “${after.title}”`;
  if (action === "game:source") return "returned game source to Twitch Auto";
  if (action === "poll:winner") return `${metadata.override === true ? "overrode" : "accepted"} poll #${after.number} winner from ${before.winnerLabel ?? "unselected"} to ${after.winnerLabel}`;
  if (action === "action:undone") return `undid ${String(metadata.originalAction).replace(":", " ")} (#${after.number ?? ""} ${after.title ?? after.gameTitle ?? "game"})`;
  if (action.startsWith("poll:")) return `${action.slice(5)} poll #${after.number} “${after.title}”`;
  return action;
}

export type Level38State = Awaited<ReturnType<typeof readState>>;
