import { Poll, Prisma } from "@prisma/client";
import { Level38Error } from "./errors";
import { isHidden } from "./quest-domain";
import { PollInput } from "./validation";

export const pollInclude = {
  options: { orderBy: { position: "asc" as const }, include: { quest: true, game: true, _count: { select: { votes: true } } } },
} satisfies Prisma.PollInclude;
export type PollWithOptions = Prisma.PollGetPayload<{ include: typeof pollInclude }>;

export async function pollOrThrow(tx: Prisma.TransactionClient, eventId: string, id: string): Promise<PollWithOptions> {
  const poll = await tx.poll.findFirst({ where: { id, eventId, archivedAt: null }, include: pollInclude });
  if (!poll) throw new Level38Error(404, "Poll not found.");
  return poll;
}

export async function prepareOptions(tx: Prisma.TransactionClient, eventId: string, input: PollInput) {
  const context = input.contextQuestId ? await gamePollContext(tx, eventId, input.contextQuestId) : null;
  if (context && input.type !== "NEXT_GAME") throw new Level38Error(400, "Only a next-game poll can target a quest.");
  const seen = new Set<string>();
  const options: { eventId: string; label: string; position: number; questId?: string; gameId?: string }[] = [];
  for (const [position, option] of input.options.entries()) {
    let label = option.label ?? "";
    if (input.type === "NEXT_QUEST") {
      const quest = await tx.quest.findFirst({ where: { id: option.questId, eventId, retiredAt: null }, include: { game: true } });
      if (!quest || isHidden(quest) || quest.status !== "AVAILABLE" || !quest.game.enabled) {
        throw new Level38Error(409, "Choose available, revealed quests from enabled games.");
      }
      label = quest.title;
    }
    if (input.type === "NEXT_GAME") {
      const game = await tx.game.findFirst({ where: { id: option.gameId, eventId, enabled: true } });
      if (!game) throw new Level38Error(409, "Choose an enabled game from this event.");
      if (context && !context.eligibleGames.some((association) => association.gameId === game.id)) {
        throw new Level38Error(409, "Choose an eligible game for this quest.");
      }
      label = game.title;
    }
    const key = option.questId ?? option.gameId ?? label.toLocaleLowerCase("en");
    if (seen.has(key)) throw new Level38Error(400, "Poll options must be distinct.");
    seen.add(key);
    options.push({ eventId, label, position, ...(option.questId ? { questId: option.questId } : {}), ...(option.gameId ? { gameId: option.gameId } : {}) });
  }
  return options;
}

export async function gamePollContext(tx: Prisma.TransactionClient, eventId: string, questId: string) {
  const quest = await tx.quest.findFirst({ where: { id: questId, eventId, retiredAt: null }, include: { eligibleGames: true } });
  if (!quest || isHidden(quest) || ["COMPLETED", "FAILED", "SKIPPED"].includes(quest.status)) {
    throw new Level38Error(409, "Choose an unfinished, revealed quest for the game poll.");
  }
  return quest;
}

export async function assertGamePollEligibility(tx: Prisma.TransactionClient, eventId: string, poll: PollWithOptions) {
  if (!poll.contextQuestId) return;
  if (poll.type !== "NEXT_GAME") throw new Level38Error(409, "Only a next-game poll can target a quest.");
  const quest = await gamePollContext(tx, eventId, poll.contextQuestId);
  if (poll.options.some((option) => !quest.eligibleGames.some((association) => association.gameId === option.gameId))) {
    throw new Level38Error(409, "A game option is no longer eligible for this quest. Edit the draft first.");
  }
}

export function assertOpenable(poll: PollWithOptions): void {
  if (poll.options.length < 2 || poll.options.length > 8) throw new Level38Error(409, "A poll needs 2–8 options before opening.");
  for (const option of poll.options) {
    if (poll.type === "NEXT_QUEST" && (!option.quest || option.quest.retiredAt || isHidden(option.quest) || option.quest.status !== "AVAILABLE")) {
      throw new Level38Error(409, "A quest option is no longer available. Edit the draft first.");
    }
    if (poll.type === "NEXT_GAME" && (!option.game || !option.game.enabled)) {
      throw new Level38Error(409, "A game option is no longer enabled.");
    }
  }
}

export function leadingOptionIds(poll: PollWithOptions): string[] {
  const maximum = Math.max(0, ...poll.options.map((option) => option._count.votes));
  return maximum === 0 ? [] : poll.options.filter((option) => option._count.votes === maximum).map((option) => option.id);
}

export function pollSnapshot(poll: Poll) {
  return { title: poll.title, number: poll.number, contextQuestId: poll.contextQuestId, status: poll.status,
    openedAt: poll.openedAt?.toISOString() ?? null, closedAt: poll.closedAt?.toISOString() ?? null,
    durationSeconds: poll.durationSeconds, endsAt: poll.endsAt?.toISOString() ?? null,
    cancelledAt: poll.cancelledAt?.toISOString() ?? null, closeReason: poll.closeReason,
    voteRevision: poll.voteRevision, winningOptionId: poll.winningOptionId, overrideOptionId: poll.overrideOptionId,
    overrideReason: poll.overrideReason, winnerAcceptedAt: poll.winnerAcceptedAt?.toISOString() ?? null };
}

// Shared by the operator and timeout paths. Winning a quest poll never activates
// a quest; a contextual game poll retains its existing eligible-game selection.
export async function acceptPollWinner(tx: Prisma.TransactionClient, eventId: string, poll: PollWithOptions,
  optionId: string, overrideReason: string | null) {
  if (poll.status !== "CLOSED") throw new Level38Error(409, "Close the poll before selecting a winner.");
  if (poll.cancelledAt) throw new Level38Error(409, "A cancelled poll cannot have a winner.");
  const option = poll.options.find((item) => item.id === optionId);
  if (!option) throw new Level38Error(400, "Choose an option from this poll.");
  if (!overrideReason && (poll.winningOptionId || poll.overrideOptionId)) throw new Level38Error(409, "A result is already selected. Use an explicit override to change it.");
  if (!overrideReason && !leadingOptionIds(poll).includes(optionId)) throw new Level38Error(409, "Accept a leading option, or supply an override reason. Zero-vote polls require an override.");
  if ((poll.overrideOptionId ?? poll.winningOptionId) === optionId) throw new Level38Error(409, "That option is already the winner.");
  let questSelection: Prisma.InputJsonObject = {};
  if (poll.type === "NEXT_GAME" && poll.contextQuestId) {
    await assertGamePollEligibility(tx, eventId, poll);
    if (!option.game || !option.game.enabled) throw new Level38Error(409, "The winning game is no longer enabled.");
    const quest = await tx.quest.findFirstOrThrow({ where: { id: poll.contextQuestId, eventId, retiredAt: null } });
    await tx.quest.update({ where: { id: quest.id }, data: { gameId: option.game.id } });
    questSelection = { questId: quest.id, previousGameId: quest.gameId, selectedGameId: option.game.id };
  }
  const updated = await tx.poll.update({ where: { id: poll.id }, data: overrideReason
    ? { overrideOptionId: optionId, overridePollId: poll.id, overrideReason, winnerAcceptedAt: new Date() }
    : { winningOptionId: optionId, winningPollId: poll.id, winnerAcceptedAt: new Date() } });
  const oldLabel = poll.options.find((item) => item.id === (poll.overrideOptionId ?? poll.winningOptionId))?.label ?? null;
  return { updated, questSelection, winnerLabel: option.label, oldLabel };
}
