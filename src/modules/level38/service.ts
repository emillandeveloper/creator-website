import { Prisma, PrismaClient } from "@prisma/client";
import { canOperate, isOwner } from "./auth";
import { Level38Error } from "./errors";
import { assertOpenable, leadingOptionIds, pollOrThrow, pollSnapshot, prepareOptions } from "./poll-domain";
import { isHidden, questSnapshot, questTransition } from "./quest-domain";
import { eventOrThrow, Level38State, readState } from "./state";
import { applyUndo } from "./undo";
import { PollInput, QuestAction } from "./validation";

export { EVENT_SLUG, Level38State } from "./state";
export interface Change {
  action: string; entityId: string; before: Prisma.InputJsonObject; after: Prisma.InputJsonObject;
  metadata?: Prisma.InputJsonObject; undoOfId?: string;
}
export type PublicChange = { type: string; revision: number };

export class Level38Service {
  constructor(private readonly db: PrismaClient, private readonly publish?: (state: Level38State, change: PublicChange) => void) {}

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
      const completedBefore = await tx.quest.count({ where: { eventId: event.id, status: "COMPLETED" } });
      const action = await change(tx, event.id);
      const completedAfter = await tx.quest.count({ where: { eventId: event.id, status: "COMPLETED" } });
      const current = await tx.event.findUniqueOrThrow({ where: { id: event.id } });
      await tx.auditLog.create({ data: { eventId: event.id, operatorId, operatorName: operator.name, action: action.action,
        entityId: action.entityId, before: { ...action.before, completed: completedBefore }, after: { ...action.after, completed: completedAfter },
        metadata: { version: 2, ...action.metadata }, undoOfId: action.undoOfId, eventRevision: current.revision } });
      return { state: await readState(tx, false), type: action.action };
    }, { maxWait: 10000, timeout: 15000 });
    this.publish?.(result.state, { type: result.type, revision: result.state.event.revision });
    return result.state;
  }

  changeQuest(operatorId: string, questId: string, action: QuestAction, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const quest = await tx.quest.findFirst({ where: { id: questId, eventId }, include: { game: true } });
      if (!quest) throw new Level38Error(404, "Quest not found.");
      const status = questTransition(quest, action);
      if (["activate", "available", "reveal"].includes(action) && !quest.game.enabled) throw new Level38Error(409, "This quest's game is disabled.");
      if (await tx.pollOption.count({ where: { questId, poll: { status: "OPEN" } } })) throw new Level38Error(409, "Close the poll containing this quest before changing its state.");
      const updated = await tx.quest.update({ where: { id: questId }, data: { status,
        completedAt: status === "COMPLETED" ? new Date() : null,
        ...(action === "reveal" ? { revealedAt: new Date(), isSecret: true } : {}) } });
      const names = { activate: "activated", complete: "completed", fail: "failed", skip: "skipped", reveal: "revealed", available: "available" };
      return { action: `quest:${names[action]}`, entityId: questId, before: questSnapshot(quest), after: questSnapshot(updated) };
    });
  }

  changeGame(operatorId: string, gameId: string | null, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const game = gameId ? await tx.game.findFirst({ where: { id: gameId, eventId, enabled: true } }) : null;
      if (gameId && !game) throw new Level38Error(404, "Enabled game not found in this event.");
      const event = await tx.event.findUniqueOrThrow({ where: { id: eventId }, include: { currentGame: true } });
      if (event.currentGameId === gameId) throw new Level38Error(409, "That game is already selected.");
      await tx.event.update({ where: { id: eventId }, data: { currentGameId: gameId } });
      return { action: "game:changed", entityId: eventId, before: { gameId: event.currentGameId, gameTitle: event.currentGame?.title ?? null }, after: { gameId, gameTitle: game?.title ?? null } };
    });
  }

  savePoll(operatorId: string, pollId: string | null, input: PollInput, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const previous = pollId ? await pollOrThrow(tx, eventId, pollId) : null;
      if (previous && previous.status !== "DRAFT") throw new Level38Error(409, "Only draft polls can be edited. Create a new round instead.");
      if (previous && (previous.voteRevision !== 0 || previous.options.some((option) => option._count.votes > 0))) throw new Level38Error(409, "A poll with voting history cannot be edited.");
      const options = await prepareOptions(tx, eventId, input);
      const poll = previous ?? await tx.poll.create({ data: { eventId, title: input.title, type: input.type, createdById: operatorId } });
      // Only unpublished, vote-free draft options can be replaced; rounds and votes are never deleted.
      if (previous) await tx.pollOption.deleteMany({ where: { pollId: poll.id } });
      await tx.poll.update({ where: { id: poll.id }, data: { title: input.title, type: input.type } });
      await tx.pollOption.createMany({ data: options.map((option) => ({ ...option, pollId: poll.id })) });
      return { action: previous ? "poll:edited" : "poll:created", entityId: poll.id,
        before: previous ? { title: previous.title, type: previous.type, options: previous.options.map((option) => ({ label: option.label, questId: option.questId, gameId: option.gameId })) } : {},
        after: { title: input.title, type: input.type, number: poll.number, options } };
    });
  }

  changePoll(operatorId: string, pollId: string, action: "open" | "close", expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const poll = await pollOrThrow(tx, eventId, pollId);
      if (poll.status !== (action === "open" ? "DRAFT" : "OPEN")) throw new Level38Error(409, `Cannot ${action} this poll.`);
      if (action === "open") {
        if (await tx.poll.count({ where: { eventId, status: "OPEN" } })) throw new Level38Error(409, "Close the current poll first. Only one poll can be open.");
        assertOpenable(poll);
        if (poll.type === "NEXT_QUEST") {
          const ids = poll.options.flatMap((option) => option.questId ? [option.questId] : []);
          const enabled = await tx.quest.count({ where: { id: { in: ids }, game: { enabled: true } } });
          if (enabled !== poll.options.length) throw new Level38Error(409, "A quest's game is disabled.");
        }
      }
      const updated = await tx.poll.update({ where: { id: pollId }, data: action === "open" ? { status: "OPEN", openedAt: new Date() } : { status: "CLOSED", closedAt: new Date() } });
      return { action: action === "open" ? "poll:opened" : "poll:closed", entityId: poll.id, before: pollSnapshot(poll), after: pollSnapshot(updated) };
    });
  }

  selectWinner(operatorId: string, pollId: string, optionId: string, overrideReason: string | null, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const poll = await pollOrThrow(tx, eventId, pollId);
      if (poll.status !== "CLOSED") throw new Level38Error(409, "Close the poll before selecting a winner.");
      const option = poll.options.find((option) => option.id === optionId);
      if (!option) throw new Level38Error(400, "Choose an option from this poll.");
      if (!overrideReason && (poll.winningOptionId || poll.overrideOptionId)) throw new Level38Error(409, "A result is already selected. Use an explicit override to change it.");
      if (!overrideReason && !leadingOptionIds(poll).includes(optionId)) throw new Level38Error(409, "Accept a leading option, or supply an override reason. Zero-vote polls require an override.");
      if ((poll.overrideOptionId ?? poll.winningOptionId) === optionId) throw new Level38Error(409, "That option is already the winner.");
      const updated = await tx.poll.update({ where: { id: poll.id }, data: overrideReason
        ? { overrideOptionId: optionId, overridePollId: poll.id, overrideReason, winnerAcceptedAt: new Date() }
        : { winningOptionId: optionId, winningPollId: poll.id, winnerAcceptedAt: new Date() } });
      const oldLabel = poll.options.find((item) => item.id === (poll.overrideOptionId ?? poll.winningOptionId))?.label ?? null;
      return { action: "poll:winner", entityId: poll.id, before: { ...pollSnapshot(poll), winnerLabel: oldLabel }, after: { ...pollSnapshot(updated), winnerLabel: option.label }, metadata: { override: !!overrideReason } };
    });
  }

  async vote(participantId: string, pollId: string, optionId: string): Promise<Level38State> {
    const state = await this.db.$transaction(async (tx) => {
      const event = await eventOrThrow(tx);
      await tx.event.update({ where: { id: event.id }, data: { revision: { increment: 1 } } });
      const participant = await tx.participant.findFirst({ where: { id: participantId, expiresAt: { gt: new Date() } } });
      if (!participant) throw new Level38Error(401, "Your viewer session expired. Reload to join again.");
      if (!participant.nickname) throw new Level38Error(403, "Choose a nickname before voting.");
      const poll = await pollOrThrow(tx, event.id, pollId);
      if (poll.status !== "OPEN") throw new Level38Error(409, "This poll is no longer open.");
      const option = poll.options.find((item) => item.id === optionId);
      if (!option || (option.quest && isHidden(option.quest))) throw new Level38Error(400, "Choose an option from this poll.");
      await tx.vote.upsert({ where: { pollId_participantId: { pollId, participantId } }, create: { pollId, optionId, participantId }, update: { optionId } });
      await tx.poll.update({ where: { id: poll.id }, data: { voteRevision: { increment: 1 } } });
      return readState(tx, false);
    }, { maxWait: 10000, timeout: 15000 });
    this.publish?.(state, { type: "poll:vote-updated", revision: state.event.revision });
    return state;
  }

  viewerVotes(participantId: string) {
    return this.db.vote.findMany({ where: { participantId, poll: { event: { slug: "level38" }, status: { not: "DRAFT" } } }, select: { pollId: true, optionId: true } });
  }

  undo(operatorId: string, auditId: string, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, (tx, eventId) => applyUndo(tx, eventId, auditId));
  }

  configureGame(operatorId: string, gameId: string, data: { title: string; enabled: boolean; sortOrder: number; imagePath: string | null }, expectedRevision: number): Promise<Level38State> {
    return this.mutate(operatorId, expectedRevision, async (tx, eventId) => {
      const game = await tx.game.findFirst({ where: { id: gameId, eventId } });
      if (!game) throw new Level38Error(404, "Game not found.");
      if (!data.enabled && (await tx.event.count({ where: { id: eventId, currentGameId: gameId } }) ||
        await tx.quest.count({ where: { gameId, status: "ACTIVE" } }) ||
        await tx.pollOption.count({ where: { poll: { status: "OPEN" }, OR: [{ gameId }, { quest: { gameId } }] } }))) {
        throw new Level38Error(409, "Switch current game and finish its active quests/open polls before disabling this game.");
      }
      await tx.game.update({ where: { id: game.id }, data });
      return { action: "game:configured", entityId: game.id, before: { title: game.title, enabled: game.enabled, sortOrder: game.sortOrder, imagePath: game.imagePath }, after: data };
    }, true);
  }
}
