import { createHash } from "crypto";
import { Request, Response } from "express";
import { TwitchApi, TwitchApiError } from "./api";
import { TwitchConfig } from "./config";
import { TwitchStore } from "./store";
import { verifyWebhook } from "./webhook";
import { Level38Error } from "../errors";

export class TwitchIntegration {
  private broadcasterId = "";
  private error: string | null;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private initialization?: Promise<void>;
  private operation?: Promise<void>;
  private failures = 0;
  constructor(readonly config: TwitchConfig, private readonly api: TwitchApi, private readonly store: TwitchStore) { this.error = config.error; }
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
      if (!this.stopped) { this.timer = setTimeout(cycle, this.failures ? Math.min(300000, 15000 * 2 ** Math.min(this.failures - 1, 5)) : 300000); this.timer.unref(); }
    };
    void cycle();
  }
  async close() { this.stopped = true; clearTimeout(this.timer); this.api.close(); await this.operation?.catch(() => {}); }
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
    const hash = createHash("sha256").update(this.config.secret).digest("hex");
    const previous = await this.store.state();
    const owned = (await this.api.subscriptions()).filter((sub) => sub.type === "channel.update" && sub.condition?.broadcaster_user_id === this.broadcasterId && sub.transport?.method === "webhook" && sub.transport.callback === this.config.callback);
    const viable = owned.filter((sub) => sub.version === "2" && (sub.status === "enabled" || (sub.status === "webhook_callback_verification_pending" && Date.now() - Date.parse(sub.created_at) < 10 * 60000)));
    const rotated = previous?.subscriptionSecretHash && previous.subscriptionSecretHash !== hash;
    const keep = !force && !rotated ? viable.find((sub) => sub.status === "enabled") ?? viable[0] : undefined;
    for (const sub of owned) if (sub.id !== keep?.id) await this.api.request(`eventsub/subscriptions?id=${encodeURIComponent(sub.id)}`, "DELETE");
    if (keep) { await this.store.subscription(keep.id, keep.status); return; }
    try {
      const result = await this.api.request<{ data: { id: string; status: string }[] }>("eventsub/subscriptions", "POST", {
        type: "channel.update", version: "2", condition: { broadcaster_user_id: this.broadcasterId },
        transport: { method: "webhook", callback: this.config.callback, secret: this.config.secret },
      });
      if (!result.data?.[0]?.id) throw new TwitchApiError(0, "subscription response");
      await this.store.subscription(result.data[0].id, result.data[0].status, hash);
    } catch (error) {
      // Another process/Twitch retry may have created it. Reconcile, never blindly retry POST.
      if (error instanceof TwitchApiError && error.status === 409) {
        const existing = (await this.api.subscriptions()).find((sub) => sub.type === "channel.update" && sub.version === "2" && sub.condition?.broadcaster_user_id === this.broadcasterId && sub.transport?.callback === this.config.callback && ["enabled", "webhook_callback_verification_pending"].includes(sub.status));
        if (existing) { await this.store.subscription(existing.id, existing.status); return; }
      }
      throw error;
    }
  }
  async status() {
    const saved = await this.store.state();
    const revoked = saved && !["unknown", "enabled", "webhook_callback_verification_pending"].includes(saved.subscriptionStatus);
    return { enabled: this.config.enabled, available: this.available,
      connection: !this.config.enabled ? "Disabled" : this.error || revoked ? "Error" : saved?.subscriptionStatus === "enabled" ? "Connected" : "Connecting",
      error: this.error, channel: this.config.broadcasterLogin, broadcasterId: this.broadcasterId || this.config.broadcasterId || null,
      categoryId: saved?.categoryId ?? null, categoryName: saved?.categoryName ?? null,
      lastEventAt: saved?.lastEventAt?.toISOString() ?? null, lastSyncAt: saved?.observedAt?.toISOString() ?? null,
      subscriptionStatus: saved?.subscriptionStatus ?? "unknown" };
  }
  webhook = async (req: Request, res: Response): Promise<void> => {
    this.requireEnabled();
    const { id, at, type, body } = verifyWebhook(req, this.config.secret);
    // Never call Twitch from its callback. Initialization is asynchronous; 503 requests a retry.
    if (!this.broadcasterId) throw new Level38Error(503, "Twitch integration is initializing.");
    const sub = body.subscription;
    if (sub?.type !== "channel.update" || sub.version !== "2" || typeof sub.id !== "string" || sub.id.length > 256 ||
      sub.condition?.broadcaster_user_id !== this.broadcasterId || sub.transport?.method !== "webhook" || sub.transport.callback !== this.config.callback ||
      (req.get("Twitch-Eventsub-Subscription-Type") && req.get("Twitch-Eventsub-Subscription-Type") !== "channel.update") ||
      (req.get("Twitch-Eventsub-Subscription-Version") && req.get("Twitch-Eventsub-Subscription-Version") !== "2")) throw new Level38Error(400, "Unexpected Twitch subscription.");
    if (type === "webhook_callback_verification") {
      if (typeof body.challenge !== "string" || body.challenge.length > 4096 || sub.status !== "webhook_callback_verification_pending") throw new Level38Error(400, "Invalid Twitch challenge.");
      // Repeated signed challenges must return the exact challenge again.
      res.status(200).type("text/plain").send(body.challenge); return;
    }
    if (type === "revocation") {
      const allowed = ["authorization_revoked", "user_removed", "version_removed", "notification_failures_exceeded", "webhook_callback_verification_failed", "webhook_callback_verification_pending"];
      if (!allowed.includes(sub.status)) throw new Level38Error(400, "Invalid Twitch revocation.");
      await this.store.messageStatus(id, sub.id, sub.status);
    } else {
      const event = body.event;
      if (sub.status !== "enabled" || event?.broadcaster_user_id !== this.broadcasterId || typeof event.category_id !== "string" || !/^\d{0,30}$/.test(event.category_id) || typeof event.category_name !== "string" || event.category_name.length > 200 || typeof event.title !== "string" || event.title.length > 1000) throw new Level38Error(400, "Invalid Twitch channel update.");
      await this.store.category(this.broadcasterId, { categoryId: event.category_id, categoryName: event.category_name, title: event.title, at, messageId: id });
    }
    res.sendStatus(204);
  };
}
