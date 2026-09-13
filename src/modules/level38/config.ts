export interface Level38Config {
  enabled: boolean;
  origin: string;
  secureCookies: boolean;
  trustProxyHops: number;
}

export function readLevel38Config(env: NodeJS.ProcessEnv = process.env): Level38Config {
  if (env.LEVEL38_ENABLED !== "true") {
    return { enabled: false, origin: "", secureCookies: false, trustProxyHops: 0 };
  }
  if (!env.DATABASE_URL || !env.LEVEL38_ORIGIN) {
    throw new Error("LEVEL38_ENABLED requires DATABASE_URL and LEVEL38_ORIGIN.");
  }
  const url = new URL(env.LEVEL38_ORIGIN);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== env.LEVEL38_ORIGIN) {
    throw new Error("LEVEL38_ORIGIN must be an exact HTTP(S) origin without a trailing slash.");
  }
  if (env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("LEVEL38_ORIGIN must use HTTPS in production.");
  }
  const trustProxyHops = Number(env.LEVEL38_TRUST_PROXY_HOPS ?? "0");
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 2) {
    throw new Error("LEVEL38_TRUST_PROXY_HOPS must be 0, 1, or 2.");
  }
  return { enabled: true, origin: url.origin, secureCookies: url.protocol === "https:", trustProxyHops };
}
