import { TwitchConfig } from "./config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export class TwitchApiError extends Error {
  constructor(public readonly status: number, operation: string) { super(`Twitch ${operation} failed${status ? ` (HTTP ${status})` : " or timed out"}. Check configuration and retry.`); }
}
export interface Subscription {
  id: string; type: string; version: string; status: string; created_at: string;
  condition: { broadcaster_user_id: string }; transport: { method: string; callback?: string };
}
export interface Channel { broadcaster_id: string; game_id: string; game_name: string; title: string }
export interface UserTokenStore { load(): Promise<string | null>; save(envelope: string): Promise<void> }
export interface NativePoll {
  id: string; broadcaster_id: string; title: string; status: string; duration?: number;
  started_at: string; ends_at?: string; ended_at?: string;
  choices: { id: string; title: string; votes?: number; channel_points_votes?: number; bits_votes?: number }[];
}

export class TwitchApi {
  private cached?: { value: string; expiresAt: number; validatedAt: number };
  private tokenFlight?: Promise<string>;
  private stopped = false;
  private readonly shutdown = new AbortController();
  private user?: { access: string; refresh: string; validatedAt: number; expiresAt: number };
  private userFlight?: Promise<string>;
  private userStore?: UserTokenStore;
  private userLoaded = false;
  constructor(private readonly config: TwitchConfig, private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {}
  setUserTokenStore(store: UserTokenStore) { this.userStore = store; }
  close() { this.stopped = true; this.shutdown.abort(); this.cached = undefined; this.user = undefined; }
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
  private envelope(tokens: { access: string; refresh: string }): string {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(this.config.pollTokenKey!, "hex"), iv);
    cipher.setAAD(Buffer.from(`${this.config.clientId}:${this.config.broadcasterId}`));
    const data = Buffer.concat([cipher.update(JSON.stringify({ ...tokens, seedHash: createHash("sha256").update(this.config.userAccessToken ?? "").digest("hex") }), "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64")).join(".");
  }
  private decode(value: string): { access: string; refresh: string } {
    try {
      const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64"));
      const decipher = createDecipheriv("aes-256-gcm", Buffer.from(this.config.pollTokenKey!, "hex"), iv);
      decipher.setAAD(Buffer.from(`${this.config.clientId}:${this.config.broadcasterId}`)); decipher.setAuthTag(tag);
      const parsed = JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
      if (parsed.seedHash !== createHash("sha256").update(this.config.userAccessToken ?? "").digest("hex")) return { access: this.config.userAccessToken ?? "", refresh: this.config.userRefreshToken ?? "" };
      if (typeof parsed.access !== "string" || typeof parsed.refresh !== "string") throw new Error();
      return parsed;
    } catch { throw new TwitchApiError(401, "encrypted broadcaster authorization (check encryption key)"); }
  }
  async userToken(forceRefresh = false): Promise<string> {
    if (this.stopped) throw new TwitchApiError(0, "broadcaster authorization is closed");
    if (this.userFlight) return this.userFlight;
    if (!forceRefresh && this.user && this.user.validatedAt > this.now() - 3600000 && this.user.expiresAt > this.now()) return this.user.access;
    this.userFlight = this.acquireUser(forceRefresh);
    try { return await this.userFlight; } finally { this.userFlight = undefined; }
  }
  private async acquireUser(forceRefresh: boolean): Promise<string> {
    if (!this.config.pollsEnabled || this.config.pollError) throw new TwitchApiError(401, "broadcaster authorization (configure native polls)");
    if (!this.userLoaded) {
      const saved = await this.userStore?.load();
      const initial = saved ? this.decode(saved) : { access: this.config.userAccessToken ?? "", refresh: this.config.userRefreshToken ?? "" };
      this.user = { ...initial, validatedAt: 0, expiresAt: 0 }; this.userLoaded = true;
    }
    let candidate = this.user!;
    let checked = !forceRefresh ? await this.send("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${candidate.access}` } }, "broadcaster token validation") : null;
    if (!checked || checked.status === 401) {
      if (!candidate.refresh) throw new TwitchApiError(401, "broadcaster authorization expired; authorize channel:manage:polls again");
      // A single in-flight refresh protects Twitch's token limit and rotating refresh tokens.
      const response = await this.send("https://id.twitch.tv/oauth2/token", { method: "POST", body: new URLSearchParams({
        client_id: this.config.clientId, client_secret: this.config.clientSecret, grant_type: "refresh_token", refresh_token: candidate.refresh,
      }) }, "broadcaster token refresh");
      if (!response.ok) throw new TwitchApiError(response.status, "broadcaster token refresh; authorize again");
      const data = await response.json() as { access_token: string; refresh_token?: string };
      if (!data.access_token) throw new TwitchApiError(0, "broadcaster token response");
      candidate = { ...candidate, access: data.access_token, refresh: data.refresh_token || candidate.refresh };
      checked = await this.send("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${candidate.access}` } }, "broadcaster token validation");
      if (!this.userStore) throw new TwitchApiError(0, "secure broadcaster token persistence");
    }
    if (!checked.ok) throw new TwitchApiError(checked.status, "broadcaster token validation");
    const identity = await checked.json() as { client_id: string; user_id: string; scopes: string[]; expires_in: number };
    if (identity.client_id !== this.config.clientId || identity.user_id !== this.config.broadcasterId || !identity.scopes?.includes("channel:manage:polls") || !Number.isFinite(identity.expires_in) || identity.expires_in < 0) {
      throw new TwitchApiError(403, "broadcaster identity or channel:manage:polls scope validation");
    }
    if (candidate.access !== this.user!.access || candidate.refresh !== this.user!.refresh) await this.userStore!.save(this.envelope(candidate));
    // Twitch legacy user grants can validate with expires_in:0; validate hourly.
    this.user = { ...candidate, validatedAt: this.now(), expiresAt: identity.expires_in === 0 ? Infinity : this.now() + identity.expires_in * 1000 };
    return candidate.access;
  }
  async userRequest<T>(path: string, method = "GET", body?: object): Promise<T> {
    let token = await this.userToken();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.send(`https://api.twitch.tv/helix/${path}`, { method, headers: {
        Authorization: `Bearer ${token}`, "Client-Id": this.config.clientId, "Content-Type": "application/json",
      }, ...(body ? { body: JSON.stringify(body) } : {}) }, "poll API request");
      // A 401 is definitive rejection, so retrying once after refresh cannot create twice.
      if (response.status === 401 && attempt === 0) {
        token = await this.userToken(this.user?.access === token);
        if (method === "POST") throw new TwitchApiError(401, "poll creation authentication refreshed; reconcile before creating again");
        continue;
      }
      if (!response.ok) throw new TwitchApiError(response.status, "poll API request");
      return await response.json() as T;
    }
    throw new TwitchApiError(401, "broadcaster authentication");
  }
  async polls(id?: string): Promise<NativePoll[]> {
    const result = await this.userRequest<{ data: NativePoll[] }>(`polls?broadcaster_id=${this.config.broadcasterId}&first=20${id ? `&id=${encodeURIComponent(id)}` : ""}`);
    if (!Array.isArray(result.data)) throw new TwitchApiError(0, "poll response");
    return result.data;
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
  async subscriptions(type = "channel.update"): Promise<Subscription[]> {
    const all: Subscription[] = []; let cursor = "";
    for (let page = 0; page < 100; page++) {
      const result = await this.request<{ data: Subscription[]; pagination?: { cursor?: string } }>(`eventsub/subscriptions?type=${encodeURIComponent(type)}&first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`);
      all.push(...result.data); const next = result.pagination?.cursor;
      if (!next) return all;
      if (next === cursor) break;
      cursor = next;
    }
    throw new TwitchApiError(0, "subscription pagination");
  }
}
