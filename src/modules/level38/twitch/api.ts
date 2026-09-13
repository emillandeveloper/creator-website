import { TwitchConfig } from "./config";

export class TwitchApiError extends Error {
  constructor(public readonly status: number, operation: string) { super(`Twitch ${operation} failed${status ? ` (HTTP ${status})` : " or timed out"}. Check configuration and retry.`); }
}
export interface Subscription {
  id: string; type: string; version: string; status: string; created_at: string;
  condition: { broadcaster_user_id: string }; transport: { method: string; callback?: string };
}
export interface Channel { broadcaster_id: string; game_id: string; game_name: string; title: string }

export class TwitchApi {
  private cached?: { value: string; expiresAt: number; validatedAt: number };
  private tokenFlight?: Promise<string>;
  private stopped = false;
  private readonly shutdown = new AbortController();
  constructor(private readonly config: TwitchConfig, private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {}
  close() { this.stopped = true; this.shutdown.abort(); this.cached = undefined; }
  private async send(url: string, init: RequestInit, operation: string): Promise<Response> {
    if (this.stopped) throw new TwitchApiError(0, operation);
    const abort = new AbortController();
    const stop = () => abort.abort();
    this.shutdown.signal.addEventListener("abort", stop, { once: true });
    const timeout = setTimeout(stop, 5000);
    try {
      const response = await this.fetcher(url, { ...init, signal: abort.signal, redirect: "error" });
      // Include body consumption in the deadline; a stalled body must not hang recovery.
      const body = await response.text();
      return new Response(response.status === 204 ? null : body, { status: response.status, headers: response.headers });
    }
    catch { throw new TwitchApiError(0, operation); }
    finally { clearTimeout(timeout); this.shutdown.signal.removeEventListener("abort", stop); }
  }
  async token(): Promise<string> {
    if (this.cached && this.cached.expiresAt > this.now() + 60000 && this.cached.validatedAt > this.now() - 3600000) return this.cached.value;
    if (this.tokenFlight) return this.tokenFlight;
    this.tokenFlight = this.acquire();
    try { return await this.tokenFlight; } finally { this.tokenFlight = undefined; }
  }
  private async acquire(): Promise<string> {
    if (this.cached && this.cached.expiresAt > this.now() + 60000) {
      const response = await this.send("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${this.cached.value}` } }, "token validation");
      if (response.ok) {
        const data = await response.json() as { client_id: string; expires_in: number };
        if (data.client_id === this.config.clientId && data.expires_in > 60) {
          this.cached.expiresAt = this.now() + data.expires_in * 1000; this.cached.validatedAt = this.now(); return this.cached.value;
        }
      } else if (response.status !== 401) throw new TwitchApiError(response.status, "token validation");
      this.cached = undefined;
    }
    const response = await this.send("https://id.twitch.tv/oauth2/token", { method: "POST", body: new URLSearchParams({
      client_id: this.config.clientId, client_secret: this.config.clientSecret, grant_type: "client_credentials",
    }) }, "app token acquisition");
    if (!response.ok) throw new TwitchApiError(response.status, "app token acquisition");
    const data = await response.json() as { access_token: string; expires_in: number };
    if (!data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new TwitchApiError(0, "app token response");
    const validation = await this.send("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${data.access_token}` } }, "token validation");
    if (!validation.ok) throw new TwitchApiError(validation.status, "token validation");
    const checked = await validation.json() as { client_id: string; expires_in: number };
    if (checked.client_id !== this.config.clientId || !Number.isFinite(checked.expires_in) || checked.expires_in <= 0) throw new TwitchApiError(401, "token validation");
    this.cached = { value: data.access_token, expiresAt: this.now() + Math.min(data.expires_in, checked.expires_in) * 1000, validatedAt: this.now() };
    return data.access_token;
  }
  async request<T>(path: string, method = "GET", body?: object): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.token();
      const response = await this.send(`https://api.twitch.tv/helix/${path}`, { method,
        headers: { Authorization: `Bearer ${token}`, "Client-Id": this.config.clientId, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}) }, "API request");
      if (response.status === 401 && attempt === 0) { if (this.cached?.value === token) this.cached = undefined; continue; }
      if (!response.ok) throw new TwitchApiError(response.status, "API request");
      return response.status === 204 ? undefined as T : await response.json() as T;
    }
    throw new TwitchApiError(401, "authentication");
  }
  async broadcaster(): Promise<string> {
    if (this.config.broadcasterId) return this.config.broadcasterId;
    const result = await this.request<{ data: { id: string }[] }>(`users?login=${encodeURIComponent(this.config.broadcasterLogin)}`);
    if (!/^\d{1,30}$/.test(result.data?.[0]?.id ?? "")) throw new TwitchApiError(404, "broadcaster lookup");
    return result.data[0].id;
  }
  async channel(id: string): Promise<Channel> {
    const result = await this.request<{ data: Channel[] }>(`channels?broadcaster_id=${encodeURIComponent(id)}`);
    const channel = result.data?.[0];
    if (!channel || channel.broadcaster_id !== id || !/^\d{0,30}$/.test(channel.game_id) || typeof channel.game_name !== "string" || typeof channel.title !== "string") throw new TwitchApiError(0, "channel response");
    return channel;
  }
  async subscriptions(): Promise<Subscription[]> {
    const all: Subscription[] = []; let cursor = "";
    for (let page = 0; page < 100; page++) {
      const result = await this.request<{ data: Subscription[]; pagination?: { cursor?: string } }>(`eventsub/subscriptions?type=channel.update&first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`);
      all.push(...result.data); const next = result.pagination?.cursor;
      if (!next) return all;
      if (next === cursor) break;
      cursor = next;
    }
    throw new TwitchApiError(0, "subscription pagination");
  }
}
