import { Prisma } from "@prisma/client";
import { Level38Error } from "./errors";

export const ownerConfirmations = {
  preview: "PREVIEW LEVEL 38", progress: "RESET PROGRESS",
  participants: "CLEAR TEST PARTICIPANTS", prepare: "RESET LEVEL 38",
} as const;
export type OwnerAction = keyof typeof ownerConfirmations;

// Called inside the same event-row-locked, owner-authorized transaction as other commands.
export async function applyOwnerTool(tx: Prisma.TransactionClient, eventId: string, action: OwnerAction, confirmation: unknown) {
  if (confirmation !== ownerConfirmations[action]) throw new Level38Error(400, "The confirmation does not match this action.");
  if (action === "preview") return { action: "owner:preview", entityId: eventId, before: {}, after: {}, metadata: { audience: "all-connected-clients" } };
  const now = new Date();
  const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
  // Archive every current round, retaining questions, options, totals, winners and vote rows.
  const archived = await tx.poll.updateMany({ where: { eventId, archivedAt: null, status: { not: "CLOSED" } }, data: { status: "CLOSED", closedAt: now } });
  const polls = await tx.poll.updateMany({ where: { eventId, archivedAt: null }, data: { archivedAt: now } });
  let participants = 0;
  if (action === "participants" || action === "prepare") {
    // Expired anonymous tombstones retain vote FKs and totals, but cannot authenticate.
    const cleared = await tx.participant.updateMany({ data: { nickname: null, classId: null, variantId: null, expiresAt: new Date(0) } });
    participants = cleared.count;
  }
  if (action === "progress" || action === "prepare") {
    for (const status of ["AVAILABLE", "LOCKED", "SECRET"] as const) {
      await tx.quest.updateMany({ where: { eventId, initialStatus: status, isSecret: false }, data: { status, completedAt: null, revealedAt: null } });
    }
    await tx.quest.updateMany({ where: { eventId, isSecret: true }, data: { status: "SECRET", revealedAt: null, completedAt: null } });
    const game = await tx.game.findFirst({ where: { eventId, enabled: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
    await tx.event.update({ where: { id: eventId }, data: { currentGameId: game?.id ?? null, gameSource: "MANUAL_OVERRIDE", manualOverrideBy: null,
      lastUnlockedAt: null, resetSequence: { increment: 1 } } });
    // Never rewind unlockSequence: existing clients must recognize the next genuine crossing.
  }
  return { action: `owner:${action}`, entityId: eventId,
    before: { gameId: event.currentGameId, source: event.gameSource, resetSequence: event.resetSequence },
    after: { archivedPolls: polls.count, closedPolls: archived.count, clearedParticipants: participants },
    metadata: { archivePolicy: "preserve-polls-votes-audit", irreversible: true } };
}
