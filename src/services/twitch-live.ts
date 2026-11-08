import { TwitchApi } from "../modules/level38/twitch/api";
import { TWITCH_LOGIN } from "./stream-schedule";

export interface LiveBroadcast { game: string; title: string }
type StreamClient = Pick<TwitchApi, "request">;

export class TwitchLiveStatus {
  private cached?: { value: LiveBroadcast | null; expiresAt: number };
  private flight?: Promise<LiveBroadcast | null>;

  constructor(private readonly api: StreamClient | null, private readonly now = Date.now) {}

  async get(): Promise<LiveBroadcast | null> {
    if (!this.api) return null;
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.value;
    if (this.flight) return this.flight;
    this.flight = this.load();
    try { return await this.flight; } finally { this.flight = undefined; }
  }

  private async load(): Promise<LiveBroadcast | null> {
    let value: LiveBroadcast | null = null;
    try {
      const response = await this.api!.request<{ data: unknown[] }>(`streams?user_login=${TWITCH_LOGIN}&first=1`);
      if (!Array.isArray(response.data)) throw new Error("Invalid stream response");
      const stream = response.data[0] as Record<string, unknown> | undefined;
      if (stream && stream.user_login === TWITCH_LOGIN && stream.type === "live"
        && typeof stream.game_name === "string" && typeof stream.title === "string") {
        value = { game: stream.game_name || "Leo Nifelheim", title: stream.title };
      }
    } catch {
      // Never expose upstream errors or credentials, and never retain a stale
      // LIVE indicator when Twitch cannot confirm the broadcast.
    }
    this.cached = { value, expiresAt: this.now() + 60000 };
    return value;
  }
}

function createClient(): TwitchApi | null {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (process.env.TWITCH_LIVE_ENABLED === "false" || !clientId || !clientSecret) return null;
  // Read-only app authorization, independent of LEVEL 38/EventSub and polls.
  // Reuse the existing client for token validation, expiry, timeouts and retries.
  return new TwitchApi({
    enabled: true, error: null, clientId, clientSecret,
    broadcasterLogin: TWITCH_LOGIN, broadcasterId: "", secret: "", callback: "",
  });
}

export const twitchLiveStatus = new TwitchLiveStatus(createClient());
