import { createHash } from "crypto";
import { Request, Response } from "express";
import { TwitchApi, TwitchApiError } from "./api";
import { TwitchConfig } from "./config";
import { TwitchStore } from "./store";
import { verifyWebhook } from "./webhook";
import { Level38Error } from "../errors";
import { NativeTwitchPolls } from "./polls";

const pollSubscriptionTypes = ["channel.poll.begin", "channel.poll.progress", "channel.poll.end"];
interface SubscriptionDiagnostic {
  type: string; id: string | null; status: string; lastCheckAt: string | null;
  lastEventAt: string | null; lastReceiptAt: string | null; error: string | null;
}

export class TwitchIntegration {
  private broadcasterId = "";
  private error: string | null;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private initialization?: Promise<void>;
  private operation?: Promise<void>;
  private failures = 0;
  private subscriptionDiagnostics = new Map<string, SubscriptionDiagnostic>();
  private eventSubLastCheckAt: string | null = null;
  constructor(readonly config: TwitchConfig, private readonly api: TwitchApi, private readonly store: TwitchStore, readonly polls?: NativeTwitchPolls) { this.error = config.error; }
  get available() { return this.config.enabled && !this.config.error; }
  async autoBroadcaster() { await this.initialize(); return this.broadcasterId; }
  private requireEnabled() { if (!this.available || this.stopped) throw new Level38Error(503, this.config.error ?? "Twitch integration is disabled."); }
  private async initialize() {
    this.requireEnabled();
    if (this.broadcasterId) return;
    if (!this.initialization) this.initialization = (async () => {
      const id = await this.api.broadcaster(); await this.store.initialize(id); this.broadcasterId = id;
    })();
    try { await this.initialization; } finally { this.initialization = undefined; }
  }
  start() {
    if (!this.available || this.stopped) return;
    const cycle = async () => {
      try { await this.run("ensure"); this.failures = 0; } catch { this.failures++; }
      if (!this.stopped) { this.timer = setTimeout(cycle, this.failures ? Math.min(300000, 15000 * 2 ** Math.min(this.failures - 1, 5)) : this.config.pollsEnabled ? 15000 : 300000); this.timer.unref(); }
    };
    void cycle();
  }
  async close() { this.stopped = true; clearTimeout(this.timer); await this.polls?.close(); this.api.close(); await this.operation?.catch(() => {}); }
  // One owner/background operation at a time. No network calls hold the event row lock.
  async run(action: "sync" | "ensure" | "recreate") {
    this.requireEnabled();
    const previous = this.operation;
    const operation = (async () => {
      await previous?.catch(() => {});
      try {
        this.requireEnabled();
        await this.initialize();
        let subscriptionError: unknown;
        if (action !== "sync") try { await this.ensure(action === "recreate"); } catch (error) { subscriptionError = error; }
        const at = new Date(); const channel = await this.api.channel(this.broadcasterId);
        await this.store.category(this.broadcasterId, { categoryId: channel.game_id, categoryName: channel.game_name, title: channel.title, at });
        await this.store.cleanup();
        await this.polls?.reconcile(action === "sync" || action === "recreate");
        if (subscriptionError) throw subscriptionError;
        this.error = null;
      } catch (error) {
        this.error = error instanceof TwitchApiError ? error.message : "Twitch synchronization is unavailable. Check configuration, database and callback, then retry.";
        throw new Level38Error(503, this.error);
      }
    })();
    this.operation = operation;
    try { await operation; } finally { if (this.operation === operation) this.operation = undefined; }
  }
  private async ensure(force: boolean) {
    // Capture rotation before channel.update persists the new hash. Every owned
    // poll subscription must rotate with it, or it keeps signing with the old key.
    const previous = await this.store.state();
    const hash = createHash("sha256").update(this.config.secret).digest("hex");
    const recreate = force || !!previous?.subscriptionSecretHash && previous.subscriptionSecretHash !== hash;
    const errors: unknown[] = [];
    // Inspect every stream independently. A healthy channel.update stream says
    // nothing about poll progress; a failed stream must not hide its siblings.
    const attempt = async (type: string, version: string) => { try { await this.ensureType(type, version, recreate); } catch (error) { errors.push(error); } };
    await attempt("channel.update", "2");
    if (this.config.pollsEnabled && !this.config.pollError) {
      let authorizationError: unknown;
      try { await this.api.userToken(); } catch (error) { authorizationError = error; errors.push(error); }
      for (const type of pollSubscriptionTypes) {
        if (authorizationError) this.diagnostic(type).error = this.safeError(authorizationError);
        else await attempt(type, "1");
      }
    } else {
      // Disabled native polls must not retain subscriptions signed with an old
      // secret. Remove only this integration's callback/channel, never Hebe's.
      for (const type of pollSubscriptionTypes) {
        try {
          const owned = (await this.api.subscriptions(type)).filter((sub) => sub.type === type && sub.condition?.broadcaster_user_id === this.broadcasterId && sub.transport?.method === "webhook" && sub.transport.callback === this.config.callback);
          for (const sub of owned) await this.api.request(`eventsub/subscriptions?id=${encodeURIComponent(sub.id)}`, "DELETE");
          Object.assign(this.diagnostic(type), { id: null, status: "disabled", error: null });
        } catch (error) { this.diagnostic(type).error = this.safeError(error); errors.push(error); }
      }
    }
    this.eventSubLastCheckAt = new Date().toISOString();
    if (errors.length) throw errors[0];
    // Commit the hash only after every enabled subscription has rotated. A
    // partial upstream failure must retry the remaining old-key subscriptions.
    const current = await this.store.state();
    if (current?.subscriptionId) await this.store.subscription(current.subscriptionId, current.subscriptionStatus, hash);
  }
  private diagnostic(type: string): SubscriptionDiagnostic {
    let value = this.subscriptionDiagnostics.get(type);
    if (!value) { value = { type, id: null, status: "unknown", lastCheckAt: null, lastEventAt: null, lastReceiptAt: null, error: null }; this.subscriptionDiagnostics.set(type, value); }
    return value;
  }
  private safeError(error: unknown) { return error instanceof TwitchApiError ? error.message : "Twitch EventSub synchronization failed. Check the callback and retry synchronization."; }
  private async rememberSubscription(type: string, id: string, status: string) {
    Object.assign(this.diagnostic(type), { id, status, error: null });
    if (type === "channel.update") await this.store.subscription(id, status);
  }
  private async ensureType(type: string, version: string, force: boolean) {
    this.diagnostic(type).lastCheckAt = new Date().toISOString();
    try { await this.ensureTypeRemote(type, version, force); this.diagnostic(type).error = null; }
    catch (error) { this.diagnostic(type).error = this.safeError(error); throw error; }
  }
  private async ensureTypeRemote(type: string, version: string, force: boolean) {
    const hash = createHash("sha256").update(this.config.secret).digest("hex");
    const previous = await this.store.state();
    const owned = (await this.api.subscriptions(type)).filter((sub) => sub.type === type && sub.condition?.broadcaster_user_id === this.broadcasterId && sub.transport?.method === "webhook" && sub.transport.callback === this.config.callback);
    const viable = owned.filter((sub) => sub.version === version && (sub.status === "enabled" || (sub.status === "webhook_callback_verification_pending" && Date.now() - Date.parse(sub.created_at) < 10 * 60000)));
    const rotated = previous?.subscriptionSecretHash && previous.subscriptionSecretHash !== hash;
    const keep = !force && !rotated ? viable.find((sub) => sub.status === "enabled") ?? viable[0] : undefined;
    for (const sub of owned) if (sub.id !== keep?.id) await this.api.request(`eventsub/subscriptions?id=${encodeURIComponent(sub.id)}`, "DELETE");
    if (keep) { await this.rememberSubscription(type, keep.id, keep.status); return; }
    try {
      const result = await this.api.request<{ data: { id: string; status: string }[] }>("eventsub/subscriptions", "POST", {
        type, version, condition: { broadcaster_user_id: this.broadcasterId },
        transport: { method: "webhook", callback: this.config.callback, secret: this.config.secret },
      });
      if (!result.data?.[0]?.id) throw new TwitchApiError(0, "subscription response");
      await this.rememberSubscription(type, result.data[0].id, result.data[0].status);
    } catch (error) {
      // Another process/Twitch retry may have created it. Reconcile, never blindly retry POST.
      if (error instanceof TwitchApiError && error.status === 409) {
        const existing = (await this.api.subscriptions(type)).find((sub) => sub.type === type && sub.version === version && sub.condition?.broadcaster_user_id === this.broadcasterId && sub.transport?.callback === this.config.callback && ["enabled", "webhook_callback_verification_pending"].includes(sub.status));
        if (existing) { await this.rememberSubscription(type, existing.id, existing.status); return; }
      }
      throw error;
    }
  }
  async status() {
    const saved = await this.store.state();
    const revoked = saved && !["unknown", "enabled", "webhook_callback_verification_pending"].includes(saved.subscriptionStatus);
    const subscriptions = pollSubscriptionTypes.map(type => ({ ...this.diagnostic(type) }));
    const eventSubError = subscriptions.find(sub => sub.error)?.error ?? (this.config.pollsEnabled && subscriptions.some(sub => !["unknown", "enabled", "webhook_callback_verification_pending"].includes(sub.status)) ? "A Twitch poll EventSub subscription is not enabled. Retry synchronization." : null);
    return { enabled: this.config.enabled, available: this.available,
      connection: !this.config.enabled ? "Disabled" : this.error || revoked ? "Error" : saved?.subscriptionStatus === "enabled" ? "Connected" : "Connecting",
      error: this.error, channel: this.config.broadcasterLogin, broadcasterId: this.broadcasterId || this.config.broadcasterId || null,
      categoryId: saved?.categoryId ?? null, categoryName: saved?.categoryName ?? null,
      lastEventAt: saved?.lastEventAt?.toISOString() ?? null, lastSyncAt: saved?.observedAt?.toISOString() ?? null,
      subscriptionStatus: saved?.subscriptionStatus ?? "unknown", appAuth: this.api.appAuthStatus(),
      eventSub: { available: !!this.config.enabled && !!this.config.pollsEnabled && !this.config.pollError && !eventSubError && subscriptions.every(sub => sub.status === "enabled"), error: eventSubError, lastCheckAt: this.eventSubLastCheckAt, subscriptions },
      polls: this.polls ? await this.polls.status() : { available: false, error: "Native Twitch polls are not configured.", scopesValid: false } };
  }
  webhook = async (req: Request, res: Response): Promise<void> => {
    this.requireEnabled();
    const { id, at, type, body } = verifyWebhook(req, this.config.secret);
    // Never call Twitch from its callback. Initialization is asynchronous; 503 requests a retry.
    if (!this.broadcasterId) throw new Level38Error(503, "Twitch integration is initializing.");
    const sub = body.subscription;
    const isPoll = ["channel.poll.begin", "channel.poll.progress", "channel.poll.end"].includes(sub?.type) && !!this.polls && !!this.config.pollsEnabled;
    const version = isPoll ? "1" : "2";
    if ((!isPoll && sub?.type !== "channel.update") || sub.version !== version || typeof sub.id !== "string" || sub.id.length > 256 ||
      sub.condition?.broadcaster_user_id !== this.broadcasterId || sub.transport?.method !== "webhook" || sub.transport.callback !== this.config.callback ||
      (req.get("Twitch-Eventsub-Subscription-Type") && req.get("Twitch-Eventsub-Subscription-Type") !== sub.type) ||
      (req.get("Twitch-Eventsub-Subscription-Version") && req.get("Twitch-Eventsub-Subscription-Version") !== version)) throw new Level38Error(400, "Unexpected Twitch subscription.");
    if (type === "webhook_callback_verification") {
      if (typeof body.challenge !== "string" || body.challenge.length > 4096 || sub.status !== "webhook_callback_verification_pending") throw new Level38Error(400, "Invalid Twitch challenge.");
      // Repeated signed challenges must return the exact challenge again.
      const diagnostic = this.diagnostic(sub.type);
      if (!diagnostic.id || diagnostic.id === sub.id) { diagnostic.id = sub.id; diagnostic.status = sub.status; }
      res.status(200).type("text/plain").send(body.challenge); return;
    }
    if (type === "revocation") {
      const allowed = ["authorization_revoked", "user_removed", "version_removed", "notification_failures_exceeded", "webhook_callback_verification_failed", "webhook_callback_verification_pending"];
      if (!allowed.includes(sub.status)) throw new Level38Error(400, "Invalid Twitch revocation.");
      if (!isPoll) await this.store.messageStatus(id, sub.id, sub.status);
      const diagnostic = this.diagnostic(sub.type);
      if (diagnostic.id === sub.id) { diagnostic.status = sub.status; diagnostic.error = "Twitch revoked this EventSub subscription. Retry synchronization to restore it."; }
    } else {
      const event = body.event;
      if (isPoll) {
        if (sub.status !== "enabled" || event?.broadcaster_user_id !== this.broadcasterId || typeof event.title !== "string" || [...event.title].length > 60) throw new Level38Error(400, "Invalid Twitch poll notification.");
        if (sub.type === "channel.poll.end" && !["completed", "terminated", "archived", "COMPLETED", "TERMINATED", "ARCHIVED"].includes(event.status)) throw new Level38Error(400, "Invalid Twitch poll ending status.");
        await this.polls!.receive({ ...event, broadcaster_id: event.broadcaster_user_id, status: sub.type === "channel.poll.end" ? event.status.toUpperCase() : "ACTIVE" }, at, id);
        // Count a receipt only after HMAC, schema validation and persistence
        // succeeded. Delayed messages cannot move the event clock backwards.
        const diagnostic = this.diagnostic(sub.type);
        diagnostic.lastEventAt = new Date(Math.max(Date.parse(diagnostic.lastEventAt ?? "") || 0, at.getTime())).toISOString();
        diagnostic.lastReceiptAt = new Date().toISOString();
        if (!diagnostic.id || diagnostic.id === sub.id) { diagnostic.id = sub.id; diagnostic.status = "enabled"; diagnostic.error = null; }
        res.sendStatus(204); return;
      }
      if (sub.status !== "enabled" || event?.broadcaster_user_id !== this.broadcasterId || typeof event.category_id !== "string" || !/^\d{0,30}$/.test(event.category_id) || typeof event.category_name !== "string" || event.category_name.length > 200 || typeof event.title !== "string" || event.title.length > 1000) throw new Level38Error(400, "Invalid Twitch channel update.");
      await this.store.category(this.broadcasterId, { categoryId: event.category_id, categoryName: event.category_name, title: event.title, at, messageId: id });
    }
    res.sendStatus(204);
  };
}
