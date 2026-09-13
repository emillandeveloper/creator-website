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
  const publish = (state, change) => { published.push({ state, change }); channel?.emit("level38:state", state); if (change.type === "game:changed") channel?.emit("game:changed", { revision: change.revision }); };
  const cfg = { ...config(), ...options }; const store = new TwitchStore(f.db, publish);
  const twitch = new TwitchIntegration(cfg, new TwitchApi(cfg, fake.fetch), store);
  const service = new Level38Service(f.db, publish); const local = { enabled: true, origin, secureCookies: false, trustProxyHops: 0 };
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
  const owner = await operator("Leo", "OWNER"); const mod = await operator("Isma", "MODERATOR");
  const revision = async () => (await service.state()).event.controlRevision;
  const games = await f.db.game.findMany({ orderBy: { sortOrder: "asc" } });
  async function map(game, id) { return call(`/api/owner/games/${game.id}/twitch`, { twitchCategoryId: id, twitchCategoryName: "Reference name", controlRevision: await revision() }, owner.cookie); }
  async function webhook(msg) { return fetch(url + "/twitch/eventsub", { method: "POST", headers: msg.headers, body: msg.raw }); }
  return { db: f.db, fake, cfg, store, twitch, service, published, call, owner, mod, revision, games, map, webhook, url };
}

module.exports = { setup };
