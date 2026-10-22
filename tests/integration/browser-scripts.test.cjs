const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { setTimeout: delay } = require("node:timers/promises");
const { JSDOM } = require("jsdom");
const { io } = require("socket.io-client");
const { nativeFixture, ok } = require("./twitch-polls-support.cjs");

async function until(predicate, label) {
  for (let attempt = 0; attempt < 160; attempt++) { if (await predicate()) return; await delay(25); }
  throw new Error(`Timed out waiting for ${label}`);
}

async function page(f, control, cookie = "") {
  const url = `${f.url}${control ? "/control" : ""}`;
  const html = await (await fetch(url, { headers: cookie ? { Cookie: cookie } : {} })).text();
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const sockets = [];
  const failures = [];
  window.addEventListener("error", (event) => failures.push(event.error));
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.confirm = () => true;
  window.fetch = async (path, options = {}) => {
    const response = await fetch(new URL(path, url), { ...options, headers: { ...options.headers,
      ...(cookie ? { Cookie: cookie } : {}), ...(options.method === "POST" ? { Origin: new URL(f.cfg.callback).origin } : {}) } });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const value = setCookie.split(";")[0]; const name = value.split("=")[0];
      cookie = [...cookie.split("; ").filter((part) => part && !part.startsWith(`${name}=`)), value].join("; ");
    }
    return response;
  };
  window.io = (namespace, options) => { const socket = io(`${new URL(f.url).origin}${namespace}`, { ...options, transports: ["websocket"] }); sockets.push(socket); return socket; };
  window.eval(fs.readFileSync("public/js/level38/sprites.js", "utf8"));
  window.eval(fs.readFileSync("public/js/level38/common.js", "utf8"));
  window.eval(fs.readFileSync(`public/js/level38/${control ? "control" : "public"}.js`, "utf8"));
  return { window, document: window.document, failures, close() { sockets.forEach((socket) => socket.disconnect()); window.close(); } };
}

test("EJS and browser scripts operate native Twitch rounds, preserve party joining and show live external totals without web votes or rewind", { timeout: 60000 }, async (t) => {
  const f = await nativeFixture(t);
  const control = await page(f, true, f.mod.cookie);
  const viewer = await page(f, false);
  try {
    const doc = control.document; const publicDoc = viewer.document;
    await until(() => doc.querySelector("#quest-board button") && !doc.getElementById("operator-controls").disabled, "moderator controls");
    await until(() => !publicDoc.getElementById("join-open").disabled, "viewer session");
    doc.getElementById("poll-title").value = "Should we continue?";
    doc.getElementById("poll-type").value = "YES_NO";
    doc.getElementById("poll-type").dispatchEvent(new control.window.Event("change"));
    doc.getElementById("poll-form").dispatchEvent(new control.window.Event("submit", { bubbles: true, cancelable: true }));
    await until(() => doc.querySelector('[data-poll-id]') && !doc.getElementById("operator-controls").disabled, "draft saved");
    assert.equal(publicDoc.querySelectorAll('[data-poll-id]').length, 0);
    const poll = await f.db.poll.findFirstOrThrow({ orderBy: { number: 'desc' }, include: { options: { orderBy: { position: 'asc' } } } });
    assert.equal(poll.source, 'TWITCH');
    doc.querySelector('[data-poll-action="open"]').click();
    await until(() => publicDoc.querySelector('.l38-twitch-vote a') && !doc.getElementById('operator-controls').disabled, "native Twitch voting link");
    assert.equal(publicDoc.querySelector('[data-vote-id]'), null);
    assert.equal(publicDoc.querySelector('.l38-twitch-vote a').href, 'https://www.twitch.tv/leonifelheim');
    // Party identity remains an independent, explicit viewer action.
    publicDoc.getElementById('join-open').click();
    await until(() => !publicDoc.getElementById("join-form").hidden, "party nickname form");
    publicDoc.getElementById("nickname").value = "Viewer One";
    publicDoc.getElementById("join-form").dispatchEvent(new viewer.window.Event("submit", { bubbles: true, cancelable: true }));
    await until(() => publicDoc.getElementById('viewer-name').textContent === 'Viewer One', "saved party identity");
    assert.equal(await f.db.participant.count({ where: { nickname: 'Viewer One' } }), 1);
    const upstream = f.fake.polls[0];
    assert.equal((await f.sendPoll('channel.poll.progress', upstream, { votes: [3, 7] })).status, 204);
    await until(() => doc.querySelector('[data-total]')?.textContent === "10 votes", "live native moderator total");
    assert.equal(publicDoc.querySelector('[data-vote-id]'), null);
    assert.equal(doc.getElementById("undo").disabled, true);
    doc.getElementById("poll-title").value = "Draft text stays while people vote";
    assert.equal((await f.sendPoll('channel.poll.progress', upstream, { votes: [4, 8] })).status, 204);
    await until(() => publicDoc.querySelector('[data-total]')?.textContent === '12 votes', 'updated external vote totals');
    assert.equal(doc.getElementById("poll-title").value, "Draft text stays while people vote");
    assert.equal(await f.db.vote.count(), 0, 'Twitch votes never become a second local vote ledger');
    doc.querySelector('[data-poll-action="close"]').click();
    await until(() => publicDoc.querySelector(".l38-result") && !doc.getElementById("operator-controls").disabled, "definitive native winner");
    assert.match(publicDoc.querySelector(".l38-result").textContent, /No/);
    assert.ok(f.fake.pollCalls.some(call => call.method === 'PATCH' && call.body.status === 'TERMINATED'));
    assert.equal(doc.getElementById("undo").disabled, true, 'native results cannot be reopened by local undo');
    const latestAudit = (await f.service.state(true)).audit[0];
    assert.equal((await f.op('undo', { auditId: latestAudit.id })).status, 409);
    Array.from(doc.querySelectorAll("#poll-board button")).find((button) => button.textContent === "New round from this poll").click();
    doc.getElementById("poll-type").value = "CUSTOM";
    doc.getElementById("poll-type").dispatchEvent(new control.window.Event("change"));
    doc.getElementById("add-option").click();
    doc.querySelector("#poll-options button").click();
    const options = doc.querySelectorAll("#poll-options input");
    assert.equal(options.length, 2); options[0].value = "New choice one"; options[1].value = "New choice two";
    doc.getElementById("poll-form").dispatchEvent(new control.window.Event("submit", { bubbles: true, cancelable: true }));
    await until(() => doc.querySelectorAll('[data-poll-id]').length === 2 && !doc.getElementById("operator-controls").disabled, "new draft round");
    assert.equal(publicDoc.querySelectorAll('[data-poll-id]').length, 1);
    assert.equal((await f.statePoll(poll.id)).totalVotes, 12);
    assert.equal(await f.db.vote.count(), 0);
    assert.deepEqual(control.failures, []); assert.deepEqual(viewer.failures, []);
  } finally { control.close(); viewer.close(); }
});
