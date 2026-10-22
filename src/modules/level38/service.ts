import { randomUUID } from "crypto";
import { applyOwnerTool, OwnerAction } from "./owner-tools";
import { PreviewEvent } from "./celebration";
import { Prisma, PrismaClient } from "@prisma/client";
import { canOperate, isOwner } from "./auth";
import { Level38Error } from "./errors";
import { acceptPollWinner, activeNativePollWhere, pollOrThrow, pollSnapshot, prepareOptions } from "./poll-domain";
import { isHidden, questSnapshot, questTransition } from "./quest-domain";
import { eventOrThrow, Level38State, readState } from "./state";
import { applyUndo } from "./undo";
import { PollInput, pollInput, pollSeconds, QuestAction } from "./validation";
import { UnlockEvent, unlockEvent } from "./celebration";
import { mappedGame } from "./twitch/store";

export { EVENT_SLUG, Level38State } from "./state";
export interface Change {
  action: string; entityId: string; before: Prisma.InputJsonObject; after: Prisma.InputJsonObject;
  metadata?: Prisma.InputJsonObject; undoOfId?: string;
}
export type PublicChange = { type: string; revision: number; unlock?: UnlockEvent; preview?: PreviewEvent };

export class Level38Service {
  private nativePolls?: { changePoll(operatorId: string, pollId: string, action: "open" | "close" | "cancel", expectedRevision: number): Promise<Level38State>; reconcile(): Promise<void> };
  constructor(private readonly db: PrismaClient, private readonly publish?: (state: Level38State, change: PublicChange) => void) {}
  setNativePolls(native: NonNullable<Level38Service["nativePolls"]>) { this.nativePolls = native; }

  state(control = false): Promise<Level38State> {
    return this.db.$transaction((tx) => readState(tx, control), { isolationLevel: "RepeatableRead" });
  }

  private async mutate(operatorId: string, expectedRevision: number,
    change: (tx: Prisma.TransactionClient, eventId: string) => Promise<Change>, ownerOnly = false): Promise<Level38State> {
    const result = await this.db.$transaction(async (tx) => {
      // Updating the event row serializes ALL writes, including votes and undo.
      const event = await eventOrThrow(tx);
      const locked = await tx.event.updateMany({ where: { id: event.id, controlRevision: expectedRevision },
        data: { revision: { increment: 1 }, controlRevision: { increment: 1 } } });
      if (locked.count !== 1) throw new Level38Error(409, "The controls changed. Review the latest state and try again.");
      const operator = await tx.operator.findUnique({ where: { id: operatorId } });
      if (!operator || operator.disabled || !canOperate(operator.role) || (ownerOnly && !isOwner(operator.role))) {
        throw new Level38Error(403, ownerOnly ? "This action requires the owner role." : "Operator access is no longer available.");
      }
      const completedBefore = await tx.quest.count({ where: { eventId: event.id, retiredAt: null, status: "COMPLETED" } });
      const action = await change(tx, event.id);
      const completedAfter = await tx.quest.count({ where: { eventId: event.id, retiredAt: null, status: "COMPLETED" } });
      const crossedTarget = completedBefore < event.target && completedAfter >= event.target;
      if (crossedTarget) await tx.event.update({ where: { id: event.id },
        data: { unlockSequence: { increment: 1 }, lastUnlockedAt: new Date() } });
      const current = await tx.event.findUniqueOrThrow({ where: { id: event.id } });
      await tx.auditLog.create({ data: { eventId: event.id, operatorId, operatorName: operator.name, action: action.action,
        entityId: action.entityId, before: { ...action.before, completed: completedBefore }, after: { ...action.after, completed: completedAfter },
        metadata: { version: 2, ...action.metadata }, undoOfId: action.undoOfId, eventRevision: current.revision } });
      return { state: await readState(tx, false), type: action.action,
        milestone: crossedTarget ? { sequence: current.unlockSequence, occurredAt: current.lastUnlockedAt!, completed: completedAfter } : null };
    }, { maxWait: 10000, timeout: 15000 });
    this.publish?.(result.state, { type: result.type, revision: result.state.event.revision,
      ...(result.type === "owner:preview" ? { preview: { version: 1 as const, id: randomUUID(), startsAt: Date.now() + 400, durationMs: 6500, target: result.state.event.target } } : {}),
      ...(result.milestone ? { unlock: unlockEvent(result.milestone.sequence, result.state.event.revision, result.milestone.occurredAt,
        result.milestone.completed, result.state.event.target) } : {}) });
    return result.state;
  }

  ownerTool(operatorId: string, action: OwnerAction, confirmation: unknown, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, (tx, eventId) => applyOwnerTool(tx, eventId, action, confirmation), true);
  }

  configureParty(operatorId: string, input: { enabled: boolean; nameMode: string; maxVisible: number }, expectedRevision: number) {
    if (typeof input.enabled !== "boolean" || !["OFF", "ENTRY", "ALWAYS"].includes(input.nameMode) || !Number.isInteger(input.maxVisible) || input.maxVisible < 1 || input.maxVisible > 50) {
      throw new Level38Error(400, "Choose a valid party configuration (1–50 avatars).");
    }
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      await tx.event.update({ where: { id: eventId }, data: { partyEnabled: input.enabled, partyNameMode: input.nameMode, partyMaxVisible: input.maxVisible } });
      return { action: "party:configured", entityId: eventId,
        before: { enabled: event.partyEnabled, nameMode: event.partyNameMode, maxVisible: event.partyMaxVisible }, after: { ...input } };
    });
  }

  changeQuest(operatorId: string, questId: string, action: QuestAction, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const quest = await tx.quest.findFirst({ where: { id: questId, eventId, retiredAt: null }, include: { game: true, eligibleGames: true } });
      if (!quest) throw new Level38Error(404, "Quest not found.");
      const status = questTransition(quest, action);
      if (["activate", "available", "reveal"].includes(action) && !quest.game.enabled) throw new Level38Error(409, "This quest's game is disabled.");
      if (action === "activate" && !quest.eligibleGames.some((association) => association.gameId === quest.gameId)) throw new Level38Error(409, "Choose an eligible game before starting this quest.");
      if (await tx.pollOption.count({ where: { questId, poll: activeNativePollWhere } })) throw new Level38Error(409, "Close the poll containing this quest before changing its state.");
      if (await tx.poll.count({ where: { ...activeNativePollWhere, eventId, contextQuestId: questId } })) throw new Level38Error(409, "Close this quest's game poll before changing its state.");
      const updated = await tx.quest.update({ where: { id: questId }, data: { status,
        completedAt: status === "COMPLETED" ? new Date() : null,
        ...(action === "reveal" ? { revealedAt: new Date(), isSecret: true } : {}) } });
      const names = { activate: "activated", complete: "completed", fail: "failed", skip: "skipped", reveal: "revealed", available: "available" };
      return { action: `quest:${names[action]}`, entityId: questId, before: questSnapshot(quest), after: questSnapshot(updated) };
    });
  }

  configureQuestGames(operatorId: string, questId: string, gameIds: string[], expectedRevision: number): Promise<Level38State> {
    if (!Array.isArray(gameIds) || !gameIds.length || gameIds.length > 100 || new Set(gameIds).size !== gameIds.length || gameIds.some((id) => typeof id !== "string" || !id)) {
      throw new Level38Error(400, "Choose distinct eligible games for this quest.");
    }
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const quest = await tx.quest.findFirst({ where: { id: questId, eventId, retiredAt: null }, include: { eligibleGames: true } });
      if (!quest) throw new Level38Error(404, "Quest not found.");
      if (await tx.game.count({ where: { id: { in: gameIds }, eventId } }) !== gameIds.length) throw new Level38Error(400, "Choose games from this event.");
      if (await tx.poll.count({ where: { ...activeNativePollWhere, eventId, contextQuestId: questId } }) ||
        await tx.pollOption.count({ where: { questId, poll: activeNativePollWhere } })) throw new Level38Error(409, "Close this quest's open poll before changing eligible games.");
      const preservesSelection = gameIds.includes(quest.gameId);
      if (!preservesSelection && ["ACTIVE", "COMPLETED", "FAILED", "SKIPPED"].includes(quest.status)) throw new Level38Error(409, "Keep the selected game for an active or finished quest.");
      await tx.questGame.deleteMany({ where: { questId, gameId: { notIn: gameIds } } });
      await tx.questGame.createMany({ data: gameIds.map((gameId) => ({ eventId, questId, gameId })), skipDuplicates: true });
      const updated = await tx.quest.update({ where: { id: questId }, data: preservesSelection ? {} : { gameId: gameIds[0] } });
      return { action: "quest:games", entityId: questId,
        before: { ...questSnapshot(quest), eligibleGameIds: quest.eligibleGames.map((association) => association.gameId) },
        after: { ...questSnapshot(updated), eligibleGameIds: gameIds } };
    });
  }

  selectQuestGame(operatorId: string, questId: string, gameId: string, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const quest = await tx.quest.findFirst({ where: { id: questId, eventId, retiredAt: null }, include: { eligibleGames: { include: { game: true } } } });
      if (!quest) throw new Level38Error(404, "Quest not found.");
      if (["COMPLETED", "FAILED", "SKIPPED"].includes(quest.status)) throw new Level38Error(409, "A finished quest retains its selected game.");
      if (!quest.eligibleGames.some((association) => association.gameId === gameId && association.game.enabled)) throw new Level38Error(409, "Choose an enabled eligible game for this quest.");
      if (quest.gameId === gameId) throw new Level38Error(409, "That game is already selected for this quest.");
      if (await tx.poll.count({ where: { ...activeNativePollWhere, eventId, contextQuestId: questId } })) throw new Level38Error(409, "Close this quest's game poll before choosing its game.");
      const updated = await tx.quest.update({ where: { id: questId }, data: { gameId } });
      return { action: "quest:game", entityId: questId, before: questSnapshot(quest), after: questSnapshot(updated) };
    });
  }

  changeGame(operatorId: string, gameId: string | null, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const game = gameId ? await tx.game.findFirst({ where: { id: gameId, eventId, enabled: true } }) : null;
      if (gameId && !game) throw new Level38Error(404, "Enabled game not found in this event.");
      const event = await tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { currentGame: true } });
      if (event.currentGameId === gameId && event.gameSource === "MANUAL_OVERRIDE") throw new Level38Error(409, "That game is already selected.");
      const operator = await tx.operator.findUniqueOrThrow({ where: { id: operatorId } });
      await tx.event.update({ where: { id: eventId }, data: { currentGameId: gameId, gameSource: "MANUAL_OVERRIDE", manualOverrideBy: operator.name } });
      return { action: "game:changed", entityId: eventId, before: { gameId: event.currentGameId, gameTitle: event.currentGame?.title ?? null, source: event.gameSource }, after: { gameId, gameTitle: game?.title ?? null, source: "MANUAL_OVERRIDE" }, metadata: { source: "MANUAL" } };
    });
  }

  returnToTwitch(operatorId: string, expectedRevision: number, broadcasterId: string): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const event = await tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { currentGame: true } });
      const game = await mappedGame(tx, eventId, broadcasterId);
      await tx.event.update({ where: { id: eventId }, data: { gameSource: "AUTO_TWITCH", manualOverrideBy: null, ...(game ? { currentGameId: game.id } : {}) } });
      return { action: game && game.id !== event.currentGameId ? "game:changed" : "game:source", entityId: eventId,
        before: { gameId: event.currentGameId, gameTitle: event.currentGame?.title ?? null, source: event.gameSource },
        after: { gameId: game?.id ?? event.currentGameId, gameTitle: game?.title ?? event.currentGame?.title ?? null, source: "AUTO_TWITCH" }, metadata: { source: "TWITCH_AUTO" } };
    });
  }

  mapTwitchGame(operatorId: string, gameId: string, categoryId: string | null, categoryName: string | null, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const game = await tx.game.findFirst({ where: { id: gameId, eventId } });
      if (!game) throw new Level38Error(404, "Game not found.");
      if (categoryId && await tx.game.count({ where: { eventId, twitchCategoryId: categoryId, id: { not: gameId } } })) throw new Level38Error(409, "That Twitch category is already mapped to another game.");
      const data = { twitchCategoryId: categoryId, twitchCategoryName: categoryId ? categoryName : null };
      await tx.game.update({ where: { id: gameId }, data });
      return { action: "game:mapped", entityId: gameId,
        before: { twitchCategoryId: game.twitchCategoryId, twitchCategoryName: game.twitchCategoryName }, after: { ...data, title: game.title } };
    }, true);
  }

  savePoll(operatorId: string, pollId: string | null, input: PollInput, expectedRevision: number): Promise<Level38State> {
    input = pollInput(input);
    const durationSeconds = pollSeconds(input.durationSeconds ?? 60);
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const previous = pollId ? await pollOrThrow(tx, eventId, pollId) : null;
      if (previous?.source === "WEB") throw new Level38Error(409, "Historical web polls are read-only. Create a native Twitch round.");
      if (previous && ["PREPARING", "CREATING", "CLOSING", "CANCELLING"].includes(previous.twitchStatus ?? "")) throw new Level38Error(409, "Synchronize the pending Twitch request before editing this poll.");
      if (previous && previous.status !== "DRAFT") throw new Level38Error(409, "Only draft polls can be edited. Create a new round instead.");
      if (previous && (previous.voteRevision !== 0 || previous.options.some((option) => option._count.votes > 0))) throw new Level38Error(409, "A poll with voting history cannot be edited.");
      const options = await prepareOptions(tx, eventId, input);
      const poll = previous ?? await tx.poll.create({ data: { eventId, source: "TWITCH", title: input.title, type: input.type, durationSeconds, contextQuestId: input.contextQuestId ?? null, createdById: operatorId } });
      // Only unpublished, vote-free draft options can be replaced; rounds and votes are never deleted.
      if (previous) await tx.pollOption.deleteMany({ where: { pollId: poll.id } });
      await tx.poll.update({ where: { id: poll.id }, data: { title: input.title, type: input.type, durationSeconds, contextQuestId: input.contextQuestId ?? null, twitchStatus: null, twitchSyncError: null } });
      await tx.pollOption.createMany({ data: options.map((option) => ({ ...option, pollId: poll.id })) });
      return { action: previous ? "poll:edited" : "poll:created", entityId: poll.id,
        before: previous ? { title: previous.title, type: previous.type, durationSeconds: previous.durationSeconds, contextQuestId: previous.contextQuestId, options: previous.options.map((option) => ({ label: option.label, questId: option.questId, gameId: option.gameId })) } : {},
        after: { title: input.title, type: input.type, durationSeconds, contextQuestId: input.contextQuestId ?? null, number: poll.number, options } };
    });
  }

  changePoll(operatorId: string, pollId: string, action: "open" | "close" | "cancel", expectedRevision: number): Promise<Level38State> {
    if (!this.nativePolls) return Promise.reject(new Level38Error(503, "Configure native Twitch polls before starting a round. Web voting is disabled."));
    return this.nativePolls.changePoll(operatorId, pollId, action, expectedRevision);
  }

  extendPoll(operatorId: string, pollId: string, seconds: number, expectedRevision: number): Promise<Level38State> {
    return Promise.reject(new Level38Error(409, "Twitch does not support extending native polls. Create a new round."));
  }

  // A deadline only requests reconciliation with Twitch. It cannot manufacture
  // final votes/winners or change a historical web round.
  async expirePolls(): Promise<Level38State> {
    await this.nativePolls?.reconcile();
    return this.state();
  }

  selectWinner(operatorId: string, pollId: string, optionId: string, overrideReason: string | null, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const poll = await pollOrThrow(tx, eventId, pollId);
      if (poll.source !== "TWITCH") throw new Level38Error(409, "Historical web poll results are read-only.");
      const { updated, questSelection, winnerLabel, oldLabel } = await acceptPollWinner(tx, eventId, poll, optionId, overrideReason);
      return { action: "poll:winner", entityId: poll.id, before: { ...pollSnapshot(poll), winnerLabel: oldLabel }, after: { ...pollSnapshot(updated), winnerLabel, ...questSelection }, metadata: { override: !!overrideReason } };
    });
  }

  async vote(participantId: string, pollId: string, optionId: string): Promise<Level38State> {
    throw new Level38Error(409, "Vote using the native poll on Twitch. Web voting is disabled.");
  }

  viewerVotes(participantId: string) {
    return this.db.vote.findMany({ where: { participantId, poll: { archivedAt: null, event: { slug: "level38" }, status: { not: "DRAFT" } } }, select: { pollId: true, optionId: true } });
  }

  undo(operatorId: string, auditId: string, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, (tx, eventId) => applyUndo(tx, eventId, auditId));
  }

  configureGame(operatorId: string, gameId: string, data: { title: string; enabled: boolean; sortOrder: number; imagePath: string | null }, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const game = await tx.game.findFirst({ where: { id: gameId, eventId } });
      if (!game) throw new Level38Error(404, "Game not found.");
      if (!data.enabled && (await tx.event.count({ where: { id: eventId, currentGameId: gameId } }) ||
        await tx.quest.count({ where: { gameId, retiredAt: null, status: "ACTIVE" } }) ||
        await tx.pollOption.count({ where: { poll: activeNativePollWhere, OR: [{ gameId }, { quest: { gameId } }] } }))) {
        throw new Level38Error(409, "Switch current game and finish its active quests/open polls before disabling this game.");
      }
      await tx.game.update({ where: { id: game.id }, data });
      return { action: "game:configured", entityId: game.id, before: { title: game.title, enabled: game.enabled, sortOrder: game.sortOrder, imagePath: game.imagePath }, after: data };
    }, true);
  }
}
