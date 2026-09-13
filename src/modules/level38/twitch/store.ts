import { Prisma, PrismaClient } from "@prisma/client";
import { eventOrThrow, readState } from "../state";
import type { PublicChange, Level38State } from "../service";

export interface CategoryUpdate { categoryId: string; categoryName: string; title: string; at: Date; messageId?: string }
export type Publisher = (state: Level38State, change: PublicChange) => void;

export async function mappedGame(tx: Prisma.TransactionClient, eventId: string, broadcasterId?: string) {
  const latest = await tx.twitchState.findUnique({ where: { eventId } });
  if (!latest?.categoryId || (broadcasterId && latest.broadcasterId !== broadcasterId)) return null;
  return tx.game.findFirst({ where: { eventId, enabled: true, twitchCategoryId: latest.categoryId } });
}

export class TwitchStore {
  constructor(private readonly db: PrismaClient, private readonly publish?: Publisher) {}
  async initialize(broadcasterId: string) {
    const event = await eventOrThrow(this.db);
    // Changing channel cannot carry over the old channel's category or subscription.
    await this.db.$transaction(async (tx) => {
      await tx.event.update({ where: { id: event.id }, data: { updatedAt: new Date() } });
      const old = await tx.twitchState.findUnique({ where: { eventId: event.id } });
      if (old && old.broadcasterId !== broadcasterId) await tx.twitchState.update({ where: { eventId: event.id }, data: {
        broadcasterId, categoryId: null, categoryName: null, channelTitle: null, observedAt: null, lastEventAt: null,
        subscriptionId: null, subscriptionStatus: "unknown", subscriptionSecretHash: null,
      } });
      else if (!old) await tx.twitchState.create({ data: { eventId: event.id, broadcasterId } });
    });
  }
  async state() { const event = await eventOrThrow(this.db); return this.db.twitchState.findUnique({ where: { eventId: event.id } }); }
  async subscription(id: string, status: string, secretHash?: string) {
    const event = await eventOrThrow(this.db);
    await this.db.twitchState.update({ where: { eventId: event.id }, data: { subscriptionId: id, subscriptionStatus: status,
      ...(secretHash ? { subscriptionSecretHash: secretHash } : {}) } });
  }
  async messageStatus(messageId: string, subscriptionId: string, status: string) {
    await this.db.$transaction(async (tx) => {
      const event = await eventOrThrow(tx);
      await tx.event.update({ where: { id: event.id }, data: { updatedAt: new Date() } });
      const claimed = await tx.twitchMessage.createMany({ data: { id: messageId }, skipDuplicates: true });
      if (!claimed.count) return;
      // A delayed revocation of an old subscription must not revoke its replacement.
      await tx.twitchState.updateMany({ where: { eventId: event.id, subscriptionId }, data: { subscriptionStatus: status } });
    }, { maxWait: 1000, timeout: 2000 });
  }
  async category(broadcasterId: string, update: CategoryUpdate) {
    const result = await this.db.$transaction(async (tx) => {
      const initial = await eventOrThrow(tx);
      const event = await tx.event.update({ where: { id: initial.id }, data: { updatedAt: new Date() }, include: { currentGame: true } });
      if (update.messageId) {
        const claimed = await tx.twitchMessage.createMany({ data: { id: update.messageId }, skipDuplicates: true });
        if (!claimed.count) return null;
      }
      const latest = await tx.twitchState.findUnique({ where: { eventId: event.id } });
      if (!latest || latest.broadcasterId !== broadcasterId) return null;
      // Delivery can be out of order. A slow Helix response uses its request-start time.
      if (latest.observedAt && update.at <= latest.observedAt) return null;
      await tx.twitchState.update({ where: { eventId: event.id }, data: {
        categoryId: update.categoryId, categoryName: update.categoryName, channelTitle: update.title, observedAt: update.at,
        ...(update.messageId ? { lastEventAt: update.at } : {}),
      } });
      if (event.gameSource !== "AUTO_TWITCH") return null;
      const game = await mappedGame(tx, event.id, broadcasterId);
      if (!game || game.id === event.currentGameId) return null;
      const current = await tx.event.update({ where: { id: event.id }, data: { currentGameId: game.id,
        revision: { increment: 1 }, controlRevision: { increment: 1 } } });
      const completed = await tx.quest.count({ where: { eventId: event.id, status: "COMPLETED" } });
      await tx.auditLog.create({ data: { eventId: event.id, operatorId: null, operatorName: "TWITCH", action: "game:changed", entityId: event.id,
        before: { gameId: event.currentGameId, gameTitle: event.currentGame?.title ?? null, completed },
        after: { gameId: game.id, gameTitle: game.title, completed }, eventRevision: current.revision,
        metadata: { version: 2, source: "TWITCH", categoryId: update.categoryId, categoryName: update.categoryName,
          ...(update.messageId ? { messageId: update.messageId } : { synchronization: true }) } } });
      return readState(tx, false);
    }, { maxWait: 1000, timeout: 2000 });
    if (result) this.publish?.(result, { type: "game:changed", revision: result.event.revision });
    return result;
  }
  async cleanup() { await this.db.twitchMessage.deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - 86400000) } } }); }
}
