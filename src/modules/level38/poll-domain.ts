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
  const seen = new Set<string>();
  const options: { eventId: string; label: string; position: number; questId?: string; gameId?: string }[] = [];
  for (const [position, option] of input.options.entries()) {
    let label = option.label ?? "";
    if (input.type === "NEXT_QUEST") {
      const quest = await tx.quest.findFirst({ where: { id: option.questId, eventId }, include: { game: true } });
      if (!quest || isHidden(quest) || quest.status !== "AVAILABLE" || !quest.game.enabled) {
        throw new Level38Error(409, "Choose available, revealed quests from enabled games.");
      }
      label = quest.title;
    }
    if (input.type === "NEXT_GAME") {
      const game = await tx.game.findFirst({ where: { id: option.gameId, eventId, enabled: true } });
      if (!game) throw new Level38Error(409, "Choose an enabled game from this event.");
      label = game.title;
    }
    const key = option.questId ?? option.gameId ?? label.toLocaleLowerCase("en");
    if (seen.has(key)) throw new Level38Error(400, "Poll options must be distinct.");
    seen.add(key);
    options.push({ eventId, label, position, ...(option.questId ? { questId: option.questId } : {}), ...(option.gameId ? { gameId: option.gameId } : {}) });
  }
  return options;
}

export function assertOpenable(poll: PollWithOptions): void {
  if (poll.options.length < 2 || poll.options.length > 8) throw new Level38Error(409, "A poll needs 2–8 options before opening.");
  for (const option of poll.options) {
    if (poll.type === "NEXT_QUEST" && (!option.quest || isHidden(option.quest) || option.quest.status !== "AVAILABLE")) {
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
  return { title: poll.title, number: poll.number, status: poll.status,
    openedAt: poll.openedAt?.toISOString() ?? null, closedAt: poll.closedAt?.toISOString() ?? null,
    voteRevision: poll.voteRevision, winningOptionId: poll.winningOptionId, overrideOptionId: poll.overrideOptionId,
    overrideReason: poll.overrideReason, winnerAcceptedAt: poll.winnerAcceptedAt?.toISOString() ?? null };
}
