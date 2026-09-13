export interface TwitchConfig {
  enabled: boolean;
  error: string | null;
  clientId: string;
  clientSecret: string;
  broadcasterLogin: string;
  broadcasterId: string;
  secret: string;
  callback: string;
}

// Twitch configuration errors must never prevent the creator site/event from starting.
export function readTwitchConfig(env: NodeJS.ProcessEnv = process.env): TwitchConfig {
  const config: TwitchConfig = {
    enabled: env.TWITCH_ENABLED === "true", error: null,
    clientId: env.TWITCH_CLIENT_ID ?? "", clientSecret: env.TWITCH_CLIENT_SECRET ?? "",
    broadcasterLogin: env.TWITCH_BROADCASTER_LOGIN ?? "leonifelheim", broadcasterId: env.TWITCH_BROADCASTER_ID ?? "",
    secret: env.TWITCH_EVENTSUB_SECRET ?? "", callback: env.TWITCH_EVENTSUB_CALLBACK_URL ?? "",
  };
  if (!config.enabled) return config;
  if (!config.clientId || !config.clientSecret) config.error = "Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.";
  else if (!/^[\x21-\x7e]{10,100}$/.test(config.secret)) config.error = "Set TWITCH_EVENTSUB_SECRET to 10–100 printable ASCII characters (64 random hex characters recommended).";
  else if (config.broadcasterId ? !/^\d{1,30}$/.test(config.broadcasterId) : !/^[a-zA-Z0-9_]{1,25}$/.test(config.broadcasterLogin)) config.error = "Set a numeric broadcaster ID or a valid Twitch login.";
  try {
    const url = new URL(config.callback);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/level38/twitch/eventsub" || url.origin !== env.LEVEL38_ORIGIN) throw new Error();
  } catch { config.error = "TWITCH_EVENTSUB_CALLBACK_URL must be the public LEVEL38_ORIGIN HTTPS URL plus /level38/twitch/eventsub (port 443)."; }
  return config;
}
