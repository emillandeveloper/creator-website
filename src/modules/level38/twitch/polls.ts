import { PrismaClient, Prisma } from "@prisma/client";
import { canOperate } from "../auth";
import { Level38Error } from "../errors";
import { acceptPollWinner, assertGamePollEligibility, assertOpenable, leadingOptionIds, pollInclude, pollOrThrow, PollWithOptions } from "../poll-domain";
import { eventOrThrow, readState } from "../state";
import type { Level38State } from "../service";
import { NativePoll, TwitchApi, TwitchApiError } from "./api";
import { TwitchConfig } from "./config";
import { Publisher } from "./store";

const finalStatuses = new Set(["COMPLETED", "TERMINATED", "ARCHIVED", "MODERATED", "INVALID"]);
const pendingStatuses = ["PREPARING", "CREATING", "CLOSING", "CANCELLING"];
const safeError = "Twitch poll synchronization is pending. Review the broadcaster authorization and retry synchronization; no duplicate poll will be created.";

// Helix does not offer an idempotency key for Create Poll. Persist intent before
// POST, and reconcile uncertain responses rather than blindly retrying creation.
export class NativeTwitchPolls {
  private operation: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private error: string | null = null;
  private authorizationError: string | null = null;
  private validated = false;
  private reconciliation?: Promise<void>;
  private activePollId: string | null = null;
  private nextAttemptAt = 0;
  private rateLimitedUntil = 0;
  private lastAttemptAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private failures = 0;
  private lastEventAt: Date | null = null;
  private lastReceiptAt: Date | null = null;
  private lastHelixAt: Date | null = null;
  private lastUpdateAt: Date | null = null;
  private source: "eventsub" | "helix" | null = null;
  constructor(private readonly db: PrismaClient, private readonly api: TwitchApi, readonly config: TwitchConfig, private readonly publish?: Publisher) {
    api.setUserTokenStore({
      load: async () => (await db.twitchPollCredential.findUnique({ where: { broadcasterId: config.broadcasterId } }))?.envelope ?? null,
      save: async (envelope) => { await db.twitchPollCredential.upsert({ where: { broadcasterId: config.broadcasterId }, create: { broadcasterId: config.broadcasterId, envelope }, update: { envelope } }); },
    });
  }
  private requireEnabled() {
    if (this.stopped || !this.config.enabled || this.config.error || !this.config.pollsEnabled || this.config.pollError) {
      throw new Level38Error(503, this.config.pollError || this.config.error || "Native Twitch polls are not configured. Configure the broadcaster authorization; web voting is disabled.");
    }
  }
  async status() {
    const enabled = !!this.config.enabled && !this.config.error && !!this.config.pollsEnabled && !this.config.pollError && !this.stopped;
    return { available: enabled && this.validated && !this.authorizationError,
      error: this.config.pollError || this.authorizationError || (!this.config.pollsEnabled ? "Native Twitch polls are not enabled." : null),
      channelUrl: `https://www.twitch.tv/${encodeURIComponent(this.config.broadcasterLogin)}`, scopesValid: this.validated && !this.authorizationError,
      live: { source: this.source, lastEventAt: this.lastEventAt?.toISOString() ?? null, lastReceiptAt: this.lastReceiptAt?.toISOString() ?? null,
        lastHelixAt: this.lastHelixAt?.toISOString() ?? null, lastUpdateAt: this.lastUpdateAt?.toISOString() ?? null },
      backup: { status: !enabled ? "disabled" : this.failures ? "retrying" : !this.activePollId ? "idle" : this.lastSuccessAt ? "healthy" : "scheduled",
        intervalSeconds: 5, activePollId: this.activePollId, lastAttemptAt: this.lastAttemptAt?.toISOString() ?? null,
        lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null, nextAttemptAt: this.activePollId && this.nextAttemptAt ? new Date(this.nextAttemptAt).toISOString() : null,
        error: this.error, failures: this.failures } };
  }
  async close() { this.stopped = true; await this.operation.catch(() => {}); }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.operation.catch(() => {}).then(work); this.operation = next; return next;
  }
  private async authorize() {
    try { await this.api.userToken(); this.validated = true; this.authorizationError = null; }
    catch (error) {
      this.validated = false; this.authorizationError = error instanceof TwitchApiError ? error.message : safeError;
      throw new Level38Error(503, this.authorizationError);
    }
  }
  private async intent(operatorId: string, pollId: string, action: "open" | "close" | "cancel", expectedRevision: number) {
    const result = await this.db.$transaction(async (tx) => {
      const event = await eventOrThrow(tx);
      const lock = await tx.event.updateMany({ where: { id: event.id, controlRevision: expectedRevision }, data: { revision: { increment: 1 }, controlRevision: { increment: 1 } } });
      if (lock.count !== 1) throw new Level38Error(409, "The controls changed. Review the latest state and try again.");
      const operator = await tx.operator.findUnique({ where: { id: operatorId } });
      if (!operator || operator.disabled || !canOperate(operator.role)) throw new Level38Error(403, "Operator access is no longer available.");
      const poll = await pollOrThrow(tx, event.id, pollId);
      if (poll.source !== "TWITCH") throw new Level38Error(409, "Historical web polls are read-only. Create a native Twitch round.");
      if (action === "open") {
        if (poll.status !== "DRAFT" || poll.cancelledAt) throw new Level38Error(409, "Only a native draft can be started.");
        if (!pendingStatuses.includes(poll.twitchStatus ?? "")) {
          if (await tx.poll.count({ where: { eventId: event.id, source: "TWITCH", archivedAt: null, id: { not: pollId }, OR: [{ status: "OPEN" }, { twitchStatus: { in: pendingStatuses } }] } })) throw new Level38Error(409, "Resolve the current Twitch poll before starting another round.");
          assertOpenable(poll); await assertGamePollEligibility(tx, event.id, poll);
          if (poll.type === "NEXT_QUEST" && await tx.quest.count({ where: { id: { in: poll.options.flatMap((o) => o.questId ? [o.questId] : []) }, game: { enabled: true }, retiredAt: null } }) !== poll.options.length) throw new Level38Error(409, "A quest's game is disabled.");
          await tx.poll.update({ where: { id: poll.id }, data: { twitchStatus: "PREPARING", twitchRequestedAt: new Date(), twitchSyncError: null } });
        }
      } else if (action === "cancel" && poll.status === "DRAFT") {
        await tx.poll.update({ where: { id: pollId }, data: pendingStatuses.includes(poll.twitchStatus ?? "")
          ? { twitchStatus: "CANCELLING", twitchSyncError: null }
          : { status: "CLOSED", cancelledAt: new Date(), closedAt: new Date(), closeReason: "CANCELLED", twitchStatus: "CANCELLED" } });
      } else {
        if (poll.status !== "OPEN" || !poll.twitchPollId) throw new Level38Error(409, "Only an active native Twitch poll can be ended.");
        await tx.poll.update({ where: { id: poll.id }, data: { twitchStatus: action === "cancel" ? "CANCELLING" : "CLOSING", twitchSyncError: null } });
      }
      const current = await tx.event.findUniqueOrThrow({ where: { id: event.id } });
      await tx.auditLog.create({ data: { eventId: event.id, operatorId, operatorName: operator.name, action: `poll:${action === "open" ? "starting" : action === "close" ? "ending" : "cancelling"}`, entityId: poll.id,
        before: { status: poll.status, nativeStatus: poll.twitchStatus }, after: { number: poll.number, title: poll.title, requested: action }, metadata: { version: 2, source: "TWITCH_POLL" }, eventRevision: current.revision } });
      return { poll: await pollOrThrow(tx, event.id, pollId), state: await readState(tx, false) };
    });
    this.publish?.(result.state, { type: "poll:edited", revision: result.state.event.revision }); return result.poll;
  }
  async changePoll(operatorId: string, pollId: string, action: "open" | "close" | "cancel", expectedRevision: number): Promise<Level38State> {
    this.requireEnabled();
    return this.serial(async () => {
      await this.authorize();
      const poll = await this.intent(operatorId, pollId, action, expectedRevision);
      try {
        if (poll.twitchStatus === "PREPARING") await this.create(poll);
        else if (poll.twitchStatus === "CREATING") await this.recover(poll);
        else if (poll.twitchStatus === "CANCELLING" && !poll.twitchPollId) await this.cancelPending(poll);
        else if (["CLOSING", "CANCELLING"].includes(poll.twitchStatus ?? "")) await this.end(poll);
        this.error = null;
      } catch (error) { await this.fail(poll.id, error); }
      return this.db.$transaction((tx) => readState(tx, false), { isolationLevel: "RepeatableRead" });
    });
  }
  private async fail(id: string, error: unknown): Promise<never> {
    this.error = error instanceof TwitchApiError ? error.message : safeError;
    await this.db.poll.update({ where: { id }, data: { twitchSyncError: this.error } });
    throw new Level38Error(503, this.error);
  }
  private matches(poll: PollWithOptions, remote: NativePoll): boolean {
    const start = Date.parse(remote.started_at), requested = poll.twitchRequestedAt?.getTime() ?? 0;
    return remote.broadcaster_id === this.config.broadcasterId && remote.title === poll.title && remote.duration === poll.durationSeconds &&
      Number.isFinite(start) && start >= requested - 5000 && start <= requested + 120000 &&
      remote.choices.length === poll.options.length && remote.choices.every((choice, index) => choice.title === poll.options[index].twitchLabel);
  }
  private async recover(poll: PollWithOptions) {
    const remotes = await this.api.polls(); const matches = remotes.filter((remote) => this.matches(poll, remote));
    if (matches.length !== 1) throw new Level38Error(503, safeError);
    await this.receive(matches[0], new Date(), undefined, poll.id);
  }
  private async create(poll: PollWithOptions) {
    const remotes = await this.api.polls();
    if (remotes.some((remote) => remote.status === "ACTIVE")) throw new Level38Error(409, "Twitch already has an active poll. End it on Twitch or synchronize the existing round first.");
    const claimed = await this.db.poll.updateMany({ where: { id: poll.id, twitchStatus: "PREPARING", twitchPollId: null }, data: { twitchStatus: "CREATING", twitchRequestedAt: new Date() } });
    if (!claimed.count) return this.recover(await this.db.poll.findUniqueOrThrow({ where: { id: poll.id }, include: pollInclude }));
    try {
      const result = await this.api.userRequest<{ data: NativePoll[] }>("polls", "POST", { broadcaster_id: this.config.broadcasterId, title: poll.title,
        choices: poll.options.map((option) => ({ title: option.twitchLabel })), duration: poll.durationSeconds, channel_points_voting_enabled: false });
      if (!result.data?.[0]) throw new TwitchApiError(0, "poll creation response");
      await this.receive(result.data[0], new Date(), undefined, poll.id);
    } catch (error) {
      if (error instanceof TwitchApiError && error.status >= 400 && error.status < 500 && ![401, 409].includes(error.status)) {
        await this.db.poll.update({ where: { id: poll.id }, data: { twitchStatus: "ERROR" } });
        throw error;
      }
      await this.recover(await this.db.poll.findUniqueOrThrow({ where: { id: poll.id }, include: pollInclude }));
    }
  }
  private async end(poll: PollWithOptions) {
    const remote = (await this.api.polls(poll.twitchPollId!))[0];
    if (!remote) throw new TwitchApiError(404, "poll reconciliation");
    if (finalStatuses.has(remote.status)) { await this.receive(remote, new Date()); return; }
    const result = await this.api.userRequest<{ data: NativePoll[] }>("polls", "PATCH", { broadcaster_id: this.config.broadcasterId, id: poll.twitchPollId,
      status: poll.twitchStatus === "CANCELLING" ? "ARCHIVED" : "TERMINATED" });
    if (!result.data?.[0]) throw new TwitchApiError(0, "poll ending response");
    await this.receive(result.data[0], new Date());
  }
  private async cancelPending(poll: PollWithOptions) {
    // Successful authoritative GET is required. Never archive an unrelated
    // channel poll, and never replay a Create Poll POST to recover uncertainty.
    const matches = (await this.api.polls()).filter((remote) => this.matches(poll, remote));
    if (matches.length > 1) throw new Level38Error(503, safeError);
    if (matches.length === 1) {
      await this.receive(matches[0], new Date(), undefined, poll.id);
      const attached = await this.db.poll.findUniqueOrThrow({ where: { id: poll.id }, include: pollInclude });
      if (attached.status !== "CLOSED") await this.end(attached);
      return;
    }
    const state = await this.db.$transaction(async (tx) => {
      const event = await eventOrThrow(tx); await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${event.id} FOR UPDATE`;
      const current = await tx.poll.findUniqueOrThrow({ where: { id: poll.id } });
      if (current.twitchPollId || current.status === "CLOSED") return readState(tx, false);
      await tx.poll.update({ where: { id: poll.id }, data: { status: "CLOSED", twitchStatus: "CANCELLED", closedAt: new Date(), cancelledAt: new Date(), closeReason: "CANCELLED", twitchSyncError: null } });
      const revision = await tx.event.update({ where: { id: event.id }, data: { revision: { increment: 1 }, controlRevision: { increment: 1 } } });
      await tx.auditLog.create({ data: { eventId: event.id, operatorName: "TWITCH", action: "poll:cancelled", entityId: poll.id, before: { status: current.status }, after: { title: current.title, number: current.number, noRemotePollFound: true }, metadata: { version: 2, source: "TWITCH_POLL" }, eventRevision: revision.revision } });
      return readState(tx, false);
    });
    this.publish?.(state, { type: "poll:cancelled", revision: state.event.revision });
  }
  async reconcile(force = true): Promise<void> {
    if (!this.config.pollsEnabled || this.config.pollError || this.stopped) return;
    if (this.reconciliation) return this.reconciliation;
    const reconciliation = this.serial(async () => {
      this.requireEnabled();
      const rows = await this.db.poll.findMany({ where: { source: "TWITCH", archivedAt: null, OR: [{ status: "OPEN" }, { twitchStatus: { in: pendingStatuses } }] }, include: pollInclude });
      this.activePollId = rows.find((poll) => poll.status === "OPEN")?.id ?? null;
      if (!rows.length) { this.error = null; this.failures = 0; this.nextAttemptAt = 0; if (!this.validated) await this.authorize(); return; }
      // Background/owner/deadline calls share one request and one rate budget.
      // Never let App Access Token failures disable this broadcaster-token path.
      if (Date.now() < this.rateLimitedUntil || !force && Date.now() < this.nextAttemptAt) return;
      this.lastAttemptAt = new Date(); this.nextAttemptAt = Date.now() + 5000;
      let pollId = rows[0].id;
      try {
        await this.authorize();
        for (const poll of rows) {
          pollId = poll.id;
          if (poll.twitchStatus === "PREPARING") await this.create(poll);
          else if (poll.twitchStatus === "CANCELLING" && !poll.twitchPollId) await this.cancelPending(poll);
          else if (!poll.twitchPollId) await this.recover(poll);
          else if (["CLOSING", "CANCELLING"].includes(poll.twitchStatus ?? "")) await this.end(poll);
          else { const at = new Date(); const remote = (await this.api.polls(poll.twitchPollId))[0]; if (!remote) throw new TwitchApiError(404, "poll recovery"); await this.receive(remote, at); }
        }
        this.activePollId = (await this.db.poll.findFirst({ where: { source: "TWITCH", archivedAt: null, status: "OPEN" }, select: { id: true } }))?.id ?? null;
        this.lastSuccessAt = new Date(); this.lastHelixAt = this.lastSuccessAt; this.failures = 0; this.error = null;
      } catch (error) {
        // An EventSub end may commit while the recovery GET is in flight. An
        // obsolete request failure must not mark that completed round as broken.
        if ((await this.db.poll.findUnique({ where: { id: pollId }, select: { status: true } }))?.status === "CLOSED") {
          this.activePollId = null; this.failures = 0; this.error = null; this.nextAttemptAt = 0; return;
        }
        this.failures++;
        const rateDelay = error instanceof TwitchApiError ? error.retryAfterMs ?? 0 : 0;
        if (rateDelay) this.rateLimitedUntil = Date.now() + rateDelay;
        this.nextAttemptAt = Date.now() + Math.max(rateDelay, Math.min(60000, 5000 * 2 ** Math.min(this.failures - 1, 4)));
        await this.fail(pollId, error);
      }
    });
    this.reconciliation = reconciliation;
    try { await reconciliation; } finally { if (this.reconciliation === reconciliation) this.reconciliation = undefined; }
  }
  async receive(remote: NativePoll, at: Date, messageId?: string, localId?: string): Promise<void> {
    this.requireEnabled();
    if (!remote || typeof remote.id !== "string" || remote.id.length > 256 || remote.broadcaster_id !== this.config.broadcasterId || !["ACTIVE", ...finalStatuses].includes(remote.status) || !Array.isArray(remote.choices) || remote.choices.length < 2 || remote.choices.length > 5 || !Number.isFinite(Date.parse(remote.started_at))) throw new Level38Error(400, "Invalid Twitch poll event.");
    for (const choice of remote.choices) if (typeof choice.id !== "string" || choice.id.length > 256 || typeof choice.title !== "string" || [...choice.title].length > 25 || !Number.isSafeInteger(choice.votes ?? 0) || (choice.votes ?? 0) < 0) throw new Level38Error(400, "Invalid Twitch choice event.");
    if (new Set(remote.choices.map((choice) => choice.id)).size !== remote.choices.length) throw new Level38Error(400, "Duplicate Twitch choice IDs.");
    const result = await this.db.$transaction(async (tx) => {
      const initial = await eventOrThrow(tx); await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${initial.id} FOR UPDATE`;
      if (messageId && !(await tx.twitchMessage.createMany({ data: { id: messageId }, skipDuplicates: true })).count) return null;
      let poll = await tx.poll.findFirst({ where: { eventId: initial.id, source: "TWITCH", ...(localId ? { id: localId } : { twitchPollId: remote.id }) }, include: pollInclude });
      // EventSub can beat the POST response. Safely attach only an exact pending request.
      if (!poll) {
        const pending = await tx.poll.findMany({ where: { eventId: initial.id, source: "TWITCH", twitchStatus: "CREATING", twitchPollId: null }, include: pollInclude });
        const compatible = pending.filter((item) => remote.title === item.title && remote.choices.length === item.options.length && remote.choices.every((choice, index) => choice.title === item.options[index].twitchLabel) && Math.abs(Date.parse(remote.started_at) - item.twitchRequestedAt!.getTime()) <= 120000);
        if (compatible.length === 1) poll = compatible[0];
      }
      if (!poll || poll.archivedAt || poll.status === "CLOSED" || (poll.twitchPollId && poll.twitchPollId !== remote.id)) return null;
      if (remote.title !== poll.title || remote.choices.length !== poll.options.length || (!poll.twitchPollId && Math.abs(Date.parse(remote.started_at) - (poll.twitchRequestedAt?.getTime() ?? 0)) > 120000)) throw new Level38Error(400, "Twitch poll does not match the prepared request.");
      const final = finalStatuses.has(remote.status);
      if (!final && poll.twitchUpdatedAt && at <= poll.twitchUpdatedAt) return null;
      const pairs = poll.options.map((option) => ({ option, choice: remote.choices.find((choice) => option.twitchChoiceId ? choice.id === option.twitchChoiceId : choice.title === option.twitchLabel) }));
      if (pairs.some((pair) => !pair.choice) || new Set(pairs.map((pair) => pair.choice!.id)).size !== pairs.length) throw new Level38Error(400, "Twitch choices do not match the prepared poll.");
      const openedAt = new Date(remote.started_at), endsAt = remote.ends_at ? new Date(remote.ends_at) : new Date(openedAt.getTime() + poll.durationSeconds * 1000);
      if (!Number.isFinite(endsAt.getTime())) throw new Level38Error(400, "Invalid Twitch poll deadline.");
      const cancelled = poll.twitchStatus === "CANCELLING" || ["MODERATED", "INVALID"].includes(remote.status);
      const changed = !poll.twitchPollId || final || pairs.some(({ option, choice }) => option.twitchVotes !== Math.max(option.twitchVotes, choice!.votes ?? 0)) || poll.endsAt?.getTime() !== endsAt.getTime();
      if (!changed) {
        if (poll.twitchSyncError) await tx.poll.update({ where: { id: poll.id }, data: { twitchSyncError: null } });
        return { state: null, type: null, pollId: poll.id };
      }
      for (const { option, choice } of pairs) await tx.pollOption.update({ where: { id: option.id }, data: { twitchChoiceId: choice!.id, twitchVotes: final ? choice!.votes ?? 0 : Math.max(option.twitchVotes, choice!.votes ?? 0) } });
      await tx.poll.update({ where: { id: poll.id }, data: { twitchPollId: remote.id, twitchStatus: !final && ["CLOSING", "CANCELLING"].includes(poll.twitchStatus ?? "") ? poll.twitchStatus : remote.status, twitchUpdatedAt: at, twitchSyncError: null, status: final ? "CLOSED" : "OPEN", openedAt, endsAt,
        ...(final ? { closedAt: remote.ended_at && Number.isFinite(Date.parse(remote.ended_at)) ? new Date(remote.ended_at) : at,
          closeReason: cancelled ? "CANCELLED" : remote.status === "COMPLETED" ? "TIMEOUT" : "MANUAL", cancelledAt: cancelled ? at : null } : {}), voteRevision: { increment: 1 } } });
      let winner: Prisma.InputJsonObject = {};
      if (final && !cancelled) {
        const updated = await pollOrThrow(tx, initial.id, poll.id); const leaders = leadingOptionIds(updated);
        if (leaders.length === 1) {
          try { const accepted = await acceptPollWinner(tx, initial.id, updated, leaders[0], null); winner = { winnerLabel: accepted.winnerLabel, ...accepted.questSelection }; }
          catch (error) { if (!(error instanceof Level38Error)) throw error; winner = { resolutionRequired: true }; }
        }
      }
      const event = await tx.event.update({ where: { id: initial.id }, data: { revision: { increment: 1 }, ...(final || !poll.twitchPollId ? { controlRevision: { increment: 1 } } : {}) } });
      const type = final ? cancelled ? "poll:cancelled" : "poll:closed" : !poll.twitchPollId ? "poll:opened" : "poll:vote-updated";
      if (type !== "poll:vote-updated") await tx.auditLog.create({ data: { eventId: initial.id, operatorName: "TWITCH", action: type, entityId: poll.id, before: { status: poll.status }, after: { number: poll.number, title: poll.title, nativeStatus: remote.status, ...winner },
        metadata: { version: 2, source: "TWITCH_POLL", ...(messageId ? { messageId } : { synchronization: true }) }, eventRevision: event.revision } });
      return { state: await readState(tx, false), type, pollId: poll.id };
    });
    if (result) {
      const receivedAt = new Date();
      if (messageId) { this.lastEventAt = at; this.lastReceiptAt = receivedAt; }
      else this.lastHelixAt = receivedAt;
      // A successful backup read of identical totals proves health; it does
      // not mean the previous live EventSub update was supplied by the backup.
      if (result.state || !this.source) this.source = messageId ? "eventsub" : "helix";
      if (!finalStatuses.has(remote.status) && this.activePollId !== result.pollId) {
        this.lastSuccessAt = null; this.lastAttemptAt = null; this.nextAttemptAt = 0; this.failures = 0; this.error = null;
      }
      this.activePollId = finalStatuses.has(remote.status) ? null : result.pollId;
      if (result.state && result.type) {
        this.lastUpdateAt = receivedAt;
        this.publish?.(result.state, { type: result.type, revision: result.state.event.revision });
      }
    }
  }
}
