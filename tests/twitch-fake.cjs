const { createHmac, randomUUID } = require("node:crypto");
const { readTwitchConfig } = require("../dist/modules/level38/twitch/config");
const origin = "https://level38.example";
const config = () => readTwitchConfig({ TWITCH_ENABLED: "true", TWITCH_CLIENT_ID: "test-client", TWITCH_CLIENT_SECRET: "test-client-secret",
  TWITCH_EVENTSUB_SECRET: "a".repeat(64), TWITCH_BROADCASTER_LOGIN: "leonifelheim", TWITCH_EVENTSUB_CALLBACK_URL: `${origin}/level38/twitch/eventsub`, LEVEL38_ORIGIN: origin });
function fakeTwitch() {
  const fake = { calls: [], tokens: 0, subscriptions: [], channel: { broadcaster_id: "1234", game_id: "100", game_name: "Twitch title can differ", title: "Private stream title" }, failure: null, unauthorized: 0, createConflict: false };
  const json = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  fake.fetch = async (raw, init = {}) => {
    const url = new URL(raw); const method = init.method || "GET";
    fake.calls.push({ path: url.pathname, search: url.search, method });
    if (fake.failure) { if (fake.failure === "network") throw new Error("Private credential must never escape"); return json({ message: "private upstream error" }, fake.failure); }
    if (url.href === "https://id.twitch.tv/oauth2/token") { fake.tokens++; return json({ access_token: `private-token-${fake.tokens}`, expires_in: 7200 }); }
    if (url.href === "https://id.twitch.tv/oauth2/validate") return json({ client_id: "test-client", expires_in: 7200 });
    if (url.origin !== "https://api.twitch.tv") throw new Error("Unexpected test network target");
    if (fake.unauthorized > 0) { fake.unauthorized--; return json({}, 401); }
    if (url.pathname === "/helix/users") return json({ data: [{ id: "1234" }] });
    if (url.pathname === "/helix/channels") return json({ data: [fake.channel] });
    if (url.pathname === "/helix/eventsub/subscriptions") {
      if (method === "GET") return json({ data: fake.subscriptions, pagination: {} });
      if (method === "DELETE") { fake.subscriptions = fake.subscriptions.filter((sub) => sub.id !== url.searchParams.get("id")); return json(null, 204); }
      if (method === "POST") {
        const input = JSON.parse(init.body);
        fake.subscriptions.push({ ...input, id: randomUUID(), status: "enabled", created_at: new Date().toISOString() });
        if (fake.createConflict) { fake.createConflict = false; return json({}, 409); }
        return json({ data: [fake.subscriptions.at(-1)] }, 202);
      }
    }
    throw new Error(`Unexpected mocked Twitch API operation: ${method} ${url.pathname}`);
  };
  return fake;
}
function payload(overrides = {}) {
  return { subscription: { id: "test-subscription", type: "channel.update", version: "2", status: "enabled", condition: { broadcaster_user_id: "1234" },
    transport: { method: "webhook", callback: config().callback } }, event: { broadcaster_user_id: "1234", category_id: "100", category_name: "Different display name", title: "Private channel title", language: "en", content_classification_labels: [] }, ...overrides };
}
function signed(body = payload(), { id = randomUUID(), at = new Date().toISOString(), type = "notification", secret = config().secret, raw } = {}) {
  raw ??= JSON.stringify(body);
  return { raw, headers: { "Content-Type": "application/json", "Twitch-Eventsub-Message-Id": id, "Twitch-Eventsub-Message-Timestamp": at,
    "Twitch-Eventsub-Message-Type": type, "Twitch-Eventsub-Message-Signature": `sha256=${createHmac("sha256", secret).update(id).update(at).update(raw).digest("hex")}` } };
}
module.exports = { config, fakeTwitch, payload, signed, origin };
