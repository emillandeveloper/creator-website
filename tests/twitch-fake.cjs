const { createHmac, randomUUID } = require("node:crypto");
const { readTwitchConfig } = require("../dist/modules/level38/twitch/config");
const origin = "https://level38.example";
const config = () => readTwitchConfig({ TWITCH_ENABLED: "true", TWITCH_CLIENT_ID: "test-client", TWITCH_CLIENT_SECRET: "test-client-secret",
  TWITCH_EVENTSUB_SECRET: "a".repeat(64), TWITCH_BROADCASTER_LOGIN: "leonifelheim", TWITCH_EVENTSUB_CALLBACK_URL: `${origin}/level38/twitch/eventsub`, LEVEL38_ORIGIN: origin });
function fakeTwitch() {
  const fake = { calls: [], tokens: 0, subscriptions: [], channel: { broadcaster_id: "1234", game_id: "100", game_name: "Twitch title can differ", title: "Private stream title" }, failure: null, unauthorized: 0, createConflict: false,
    polls: [], pollCalls: [], pollFailure: null, pollPostUncertain: false, pollPostBeforeAccept: false, userValidation: { client_id: "test-client", user_id: "1234", login: "leonifelheim", scopes: ["channel:manage:polls"], expires_in: 7200 } };
  const json = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  fake.fetch = async (raw, init = {}) => {
    const url = new URL(raw); const method = init.method || "GET";
    fake.calls.push({ path: url.pathname, search: url.search, method });
    if (fake.failure) { if (fake.failure === "network") throw new Error("Private credential must never escape"); return json({ message: "private upstream error" }, fake.failure); }
    if (url.href === "https://id.twitch.tv/oauth2/token") { fake.tokens++; return json({ access_token: `private-token-${fake.tokens}`, refresh_token: `private-refresh-${fake.tokens}`, expires_in: 7200, scope: ["channel:manage:polls"] }); }
    if (url.href === "https://id.twitch.tv/oauth2/validate") return json({ ...fake.userValidation });
    if (url.origin !== "https://api.twitch.tv") throw new Error("Unexpected test network target");
    if (fake.unauthorized > 0) { fake.unauthorized--; return json({}, 401); }
    if (url.pathname === "/helix/users") return json({ data: [{ id: "1234" }] });
    if (url.pathname === "/helix/channels") return json({ data: [fake.channel] });
    if (url.pathname === "/helix/polls") {
      const input = init.body ? JSON.parse(init.body) : null;
      fake.pollCalls.push({ method, search: url.search, body: input });
      if (fake.pollFailure) {
        if (fake.pollFailure === "network") throw new Error("Private poll upstream response");
        return json({ message: "Private poll upstream response" }, fake.pollFailure);
      }
      if (method === "GET") {
        const ids = url.searchParams.getAll("id");
        return json({ data: fake.polls.filter(poll => poll.broadcaster_id === url.searchParams.get("broadcaster_id") && (!ids.length || ids.includes(poll.id))), pagination: {} });
      }
      if (method === "POST") {
        if (fake.pollPostBeforeAccept) { fake.pollPostBeforeAccept = false; throw new Error("Connection lost before the poll was accepted"); }
        if (fake.polls.some(poll => poll.status === "ACTIVE")) return json({}, 400);
        const started_at = new Date().toISOString();
        const poll = { id: randomUUID(), broadcaster_id: input.broadcaster_id, broadcaster_login: "leonifelheim", broadcaster_name: "LeoNifelheim", title: input.title,
          choices: input.choices.map(choice => ({ id: randomUUID(), title: choice.title, votes: 0, channel_points_votes: 0, bits_votes: 0 })),
          channel_points_voting_enabled: false, channel_points_per_vote: 0, bits_voting_enabled: false, bits_per_vote: 0,
          duration: input.duration, started_at, ends_at: new Date(Date.parse(started_at) + input.duration * 1000).toISOString(), status: "ACTIVE" };
        fake.polls.unshift(poll);
        if (fake.pollPostUncertain) { fake.pollPostUncertain = false; throw new Error("Connection lost after Twitch accepted the poll"); }
        return json({ data: [poll] });
      }
      if (method === "PATCH") {
        const poll = fake.polls.find(poll => poll.id === input.id && poll.broadcaster_id === input.broadcaster_id);
        if (!poll) return json({}, 404);
        Object.assign(poll, { status: input.status, ended_at: new Date().toISOString() });
        return json({ data: [poll] });
      }
    }
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
