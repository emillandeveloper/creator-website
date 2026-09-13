const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { setTimeout: delay } = require("node:timers/promises");
const { JSDOM } = require("jsdom");
const { io } = require("socket.io-client");
const { fixture } = require("./support.cjs");

async function until(predicate, label) {
  for (let attempt = 0; attempt < 160; attempt++) { if (await predicate()) return; await delay(25); }
  throw new Error(`Timed out waiting for ${label}`);
}

async function page(f, control, cookie = "") {
  const url = `${f.origin}/level38${control ? "/control" : ""}`;
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
      ...(cookie ? { Cookie: cookie } : {}), ...(options.method === "POST" ? { Origin: f.origin } : {}) } });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const value = setCookie.split(";")[0]; const name = value.split("=")[0];
      cookie = [...cookie.split("; ").filter((part) => part && !part.startsWith(`${name}=`)), value].join("; ");
    }
    return response;
  };
  window.io = (namespace, options) => { const socket = io(`${f.origin}${namespace}`, { ...options, transports: ["websocket"] }); sockets.push(socket); return socket; };
  window.eval(fs.readFileSync("public/js/level38/common.js", "utf8"));
  window.eval(fs.readFileSync(`public/js/level38/${control ? "control" : "public"}.js`, "utf8"));
  return { window, document: window.document, failures, close() { sockets.forEach((socket) => socket.disconnect()); window.close(); } };
}

test("EJS and browser scripts support moderator polls, nickname voting, live totals and undo", { timeout: 60000 }, async (t) => {
  const f = await fixture(t); await f.start();
  const mod = await f.operator("ISMA", "MODERATOR");
  const control = await page(f, true, mod.cookie);
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
    const openButton = Array.from(doc.querySelectorAll("#poll-board button")).find((button) => button.textContent === "Open poll");
    openButton.click();
    await until(() => publicDoc.querySelector('[data-vote-id]'), "public voting buttons");
    const firstVote = publicDoc.querySelector('[data-vote-id]'); firstVote.click();
    await until(() => !publicDoc.getElementById("join-form").hidden, "nickname prompt on first vote");
    publicDoc.getElementById("nickname").value = "Viewer One";
    publicDoc.getElementById("join-form").dispatchEvent(new viewer.window.Event("submit", { bubbles: true, cancelable: true }));
    await until(() => publicDoc.querySelector('[aria-pressed="true"]'), "saved viewer vote");
    await until(() => doc.querySelector('[data-total]')?.textContent === "1 vote", "live moderator total");
    assert.equal(doc.getElementById("undo").disabled, true);
    doc.getElementById("poll-title").value = "Draft text stays while people vote";
    const choice = publicDoc.querySelectorAll('[data-vote-id]')[1]; choice.click();
    await until(() => publicDoc.querySelectorAll('[data-vote-id]')[1].textContent === "Your vote", "changed vote selection");
    assert.equal(doc.getElementById("poll-title").value, "Draft text stays while people vote");
    assert.equal(await f.db.vote.count(), 1);
    Array.from(doc.querySelectorAll("#poll-board button")).find((button) => button.textContent === "Close poll").click();
    await until(() => !publicDoc.querySelector('[data-vote-id]') && !doc.getElementById("operator-controls").disabled, "closed poll");
    assert.equal(doc.getElementById("undo").disabled, false);
    doc.getElementById("undo").click();
    await until(() => publicDoc.querySelector('[data-vote-id]') && !doc.getElementById("operator-controls").disabled, "undo poll close");
    assert.equal(await f.db.vote.count(), 1);
    Array.from(doc.querySelectorAll("#poll-board button")).find((button) => button.textContent === "Close poll").click();
    await until(() => doc.querySelector('[data-accept]') && !doc.getElementById("operator-controls").disabled, "winner controls");
    doc.querySelector('[data-accept]').click();
    await until(() => publicDoc.querySelector(".l38-result") && !doc.getElementById("operator-controls").disabled, "accepted public winner");
    assert.match(publicDoc.querySelector(".l38-result").textContent, /No/);
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
    assert.equal(await f.db.vote.count(), 1);
    assert.deepEqual(control.failures, []); assert.deepEqual(viewer.failures, []);
  } finally { control.close(); viewer.close(); }
});
