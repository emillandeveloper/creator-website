import { AuditLog, Prisma, QuestStatus } from "@prisma/client";
import { Level38Error } from "./errors";
import { pollSnapshot } from "./poll-domain";
import { questSnapshot } from "./quest-domain";

export function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const reversible = new Set(["quest:activated", "quest:completed", "quest:failed", "quest:skipped", "quest:revealed", "quest:available", "game:changed", "poll:opened", "poll:closed"]);
const matches = (actual: object, stored: Prisma.JsonObject): boolean => Object.entries(actual).every(([key, value]) => stored[key] === value);

export async function undoCandidate(tx: Prisma.TransactionClient, eventId: string): Promise<{ audit: AuditLog | null; reason: string | null }> {
  const audit = await tx.auditLog.findFirst({ where: { eventId }, orderBy: { eventRevision: "desc" } });
  let reason: string | null = null;
  if (!audit) return { audit: null, reason: "No operator action to undo." };
  const before = jsonObject(audit.before);
  const after = jsonObject(audit.after);
  if (audit.undoOfId) reason = "The latest action was already undone. Earlier history cannot be rewound.";
  else if (!reversible.has(audit.action)) reason = "The latest operator action is not reversible. Earlier actions cannot be undone past it.";
  else if (["TWITCH", "TWITCH_AUTO"].includes(String(jsonObject(audit.metadata).source))) reason = "Use a manual game override to replace Twitch auto. Automatic game changes cannot be undone.";
  else if (jsonObject(audit.metadata).version !== 2) reason = "This older action does not contain a complete undo snapshot.";
  else if (audit.action.startsWith("quest:")) {
    const quest = await tx.quest.findFirst({ where: { id: audit.entityId, eventId } });
    if (!quest || !matches(questSnapshot(quest), after)) reason = "The quest has changed since this action.";
    else if (await tx.pollOption.count({ where: { questId: quest.id, poll: { status: "OPEN" } } })) reason = "This quest is in an open poll. Close the poll before changing its state.";
    else if (before.status === "SECRET" || (before.isSecret === true && before.revealedAt === null)) {
      if (await tx.pollOption.count({ where: { questId: quest.id, poll: { archivedAt: null, status: { not: "DRAFT" } } } })) reason = "A published poll references this quest, so it cannot be hidden again.";
    }
  } else if (audit.action === "game:changed") {
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    if (event.currentGameId !== after.gameId) reason = "The current game has changed since this action.";
    else if (typeof before.gameId === "string" && !await tx.game.findFirst({ where: { id: before.gameId, eventId, enabled: true } })) reason = "The previous game is no longer enabled.";
  } else {
    const poll = await tx.poll.findFirst({ where: { id: audit.entityId, eventId } });
    if (!poll || !matches(pollSnapshot(poll), after)) reason = "The poll, votes, or result changed after this action.";
    else if (audit.action === "poll:opened" && (poll.voteRevision > 0 || await tx.vote.count({ where: { pollId: poll.id } }) > 0)) reason = "Votes have been received. Opening this round can no longer be undone.";
    else if (audit.action === "poll:closed" && (poll.winningOptionId || poll.overrideOptionId)) reason = "The winner has been accepted or overridden. This poll cannot be reopened by undo.";
    else if (audit.action === "poll:closed" && await tx.poll.count({ where: { eventId, status: "OPEN", id: { not: poll.id } } })) reason = "Another poll is open.";
  }
  return { audit, reason };
}

export async function applyUndo(tx: Prisma.TransactionClient, eventId: string, auditId: string) {
  const { audit, reason } = await undoCandidate(tx, eventId);
  if (!audit || audit.id !== auditId) throw new Level38Error(409, "Only the latest operator action can be undone. Review the current undo action.");
  if (reason) throw new Level38Error(409, reason);
  const before = jsonObject(audit.before);
  if (audit.action.startsWith("quest:")) {
    await tx.quest.update({ where: { id: audit.entityId }, data: {
      status: before.status as QuestStatus, isSecret: before.isSecret === true,
      completedAt: typeof before.completedAt === "string" ? new Date(before.completedAt) : null,
      revealedAt: typeof before.revealedAt === "string" ? new Date(before.revealedAt) : null,
    } });
  } else if (audit.action === "game:changed") {
    // Undo restores the game while retaining explicit human control of its source.
    await tx.event.update({ where: { id: eventId }, data: { currentGameId: typeof before.gameId === "string" ? before.gameId : null, gameSource: "MANUAL_OVERRIDE" } });
  } else if (audit.action === "poll:opened") {
    await tx.poll.update({ where: { id: audit.entityId }, data: { status: "DRAFT", openedAt: null, closedAt: null } });
  } else if (audit.action === "poll:closed") {
    await tx.poll.update({ where: { id: audit.entityId }, data: { status: "OPEN", closedAt: null } });
  }
  return { action: "action:undone", entityId: audit.entityId, undoOfId: audit.id,
    before: jsonObject(audit.after) as Prisma.InputJsonObject, after: before as Prisma.InputJsonObject,
    metadata: { version: 2, originalAction: audit.action, originalAuditId: audit.id } };
}
