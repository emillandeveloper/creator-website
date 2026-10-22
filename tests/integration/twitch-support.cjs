const { once } = require("node:events");
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { fixture } = require("./support.cjs");
const { config, fakeTwitch, origin } = require("../twitch-fake.cjs");
const { TwitchApi } = require("../../dist/modules/level38/twitch/api");
const { TwitchStore } = require("../../dist/modules/level38/twitch/store");
const { TwitchIntegration } = require("../../dist/modules/level38/twitch/integration");
const { Level38Service } = require("../../dist/modules/level38/service");
const { Level38Auth, newToken, hashToken } = require("../../dist/modules/level38/auth");
const { Level38Controller } = require("../../dist/modules/level38/controller");
const { createLevel38Routes } = require("../../dist/modules/level38/routes");

async function setup(t, options = {}) {
  const f = await fixture(t); const fake = fakeTwitch(); const published = [];
  let channel;
  const domainEvents = new Set(['quest:activated', 'quest:completed', 'quest:failed', 'quest:skipped', 'quest:revealed', 'quest:available', 'quest:game', 'quest:games', 'poll:created', 'poll:edited', 'poll:opened', 'poll:vote-updated', 'poll:closed', 'poll:cancelled', 'poll:extended', 'poll:winner', 'game:changed', 'game:configured', 'action:undone']);
  const publish = (state, change) => {
    published.push({ state, change }); channel?.emit('level38:state', state);
    if (domainEvents.has(change.type)) channel?.emit(change.type, { revision: change.revision });
    if (change.preview) channel?.emit('level38:celebration-preview', change.preview);
    if (change.unlock) channel?.emit('level38:unlocked', change.unlock);
  };
  const { nativePolls: nativeEnabled, ...overrides } = options;
  const cfg = { ...config(), ...(nativeEnabled ? { pollsEnabled: true, broadcasterId: '1234', userAccessToken: 'private-user-token', userRefreshToken: 'private-user-refresh', pollTokenKey: 'b'.repeat(64) } : {}), ...overrides }; const store = new TwitchStore(f.db, publish);
  const api = new TwitchApi(cfg, fake.fetch);
  const native = nativeEnabled ? new (require('../../dist/modules/level38/twitch/polls').NativeTwitchPolls)(f.db, api, cfg, publish) : undefined;
  const twitch = new TwitchIntegration(cfg, api, store, native);
  const service = new Level38Service(f.db, publish); const local = { enabled: true, origin, secureCookies: false, trustProxyHops: 0 };
  if (native) service.setNativePolls(native);
  const app = express(); app.set("view engine", "ejs"); app.set("views", "src/views");
  app.use(express.static("public"));
  const controller = new Level38Controller(f.db, new Level38Auth(f.db, local), service, twitch);
  app.use("/level38", createLevel38Routes(controller, local, twitch));
  const server = createServer(app); const io = new Server(server, { path: "/level38/socket.io" }); channel = io.of("/level38");
  channel.on("connection", (socket) => { service.state().then((state) => socket.emit("level38:state", state)).catch(() => {}); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/level38`;
  t.after(async () => { await twitch.close(); await new Promise((resolve) => io.close(resolve)); });
  async function call(path, body, cookie, browserOrigin = origin) {
    const response = await fetch(url + path, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Origin: browserOrigin, "X-Level38-Request": "1", ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  async function operator(name, role) { const key = newToken(); const op = await f.db.operator.create({ data: { name, role, keyHash: hashToken(key) } }); return { ...op, cookie: (await call("/api/control/login", { key })).cookie }; }
  async function viewer(nickname) {
    const session = await call('/api/session');
    if (nickname) {
      const joined = await call('/api/join', { nickname }, session.cookie);
      if (joined.status !== 200) throw new Error('Test viewer could not join');
    }
    return session.cookie;
  }
  const owner = await operator("Leo", "OWNER"); const mod = await operator("Isma", "MODERATOR");
  const revision = async () => (await service.state()).event.controlRevision;
  const games = await f.db.game.findMany({ orderBy: { sortOrder: "asc" } });
  async function map(game, id) { return call(`/api/owner/games/${game.id}/twitch`, { twitchCategoryId: id, twitchCategoryName: "Reference name", controlRevision: await revision() }, owner.cookie); }
  async function webhook(msg) { return fetch(url + "/twitch/eventsub", { method: "POST", headers: msg.headers, body: msg.raw }); }
  return { db: f.db, fake, cfg, store, twitch, service, native, published, call, owner, mod, operator, viewer, revision, games, map, webhook, url, origin: new URL(url).origin };
}

module.exports = { setup };
