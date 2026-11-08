const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { startSite } = require("./helpers.cjs");
const { CHALLENGES } = require("../dist/models/challenges");
const { GAMES } = require("../dist/models/data");

test("challenge pages, About and scheduled stream work in both languages without Twitch credentials", async (t) => {
  const site = await startSite({ TWITCH_LIVE_ENABLED: "false" });
  t.after(() => site.stop());
  assert.equal(new Set(CHALLENGES.map(c => c.slug)).size, 6);
  assert.deepEqual(CHALLENGES.map(c => c.gameTitle).sort(), GAMES.filter(g => g.type === "challenge").map(g => g.title).sort());

  for (const lang of ["en", "es"]) {
    const response = await fetch(`${site.origin}/?lang=${lang}`);
    assert.equal(response.status, 200);
    const dom = new JSDOM(await response.text(), { url: `${site.origin}/?lang=${lang}#challenges`, runScripts: "outside-only" });
    const doc = dom.window.document;
    const links = new Set(Array.from(doc.querySelectorAll(".challenge-link"), a => a.getAttribute("href")));
    assert.equal(links.size, 6);
    assert.equal(doc.querySelectorAll("#slide-about .about-copy p").length, 4);
    assert.match(doc.querySelector("#slide-about").textContent, /1992/);
    assert.match(doc.querySelector("#slide-about").textContent, /Jotun/);
    assert.equal(doc.querySelector("#stream-spotlight").dataset.mode === "live", false);
    assert.equal(doc.querySelector("[data-stream-link]").href, "https://www.twitch.tv/leonifelheim");

    const slider = await fs.readFile(path.join(__dirname, "../public/js/slider.js"), "utf8");
    dom.window.eval(slider);
    assert.ok(doc.querySelector('[data-slide="3"]').classList.contains("active"));
    assert.equal(doc.querySelector("#slide-challenges").getAttribute("aria-hidden"), "false");
    assert.ok(Array.from(doc.querySelectorAll(".lang-toggle a")).every(a => a.hash === "#challenges"));
    doc.querySelector('[data-slide="4"]').click();
    assert.equal(dom.window.location.hash, "#playthroughs");
    dom.window.history.replaceState(null, "", "#about");
    dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
    assert.ok(doc.querySelector('[data-slide="1"]').classList.contains("active"));
    dom.window.close();

    for (const link of links) {
      const detailResponse = await fetch(site.origin + link);
      assert.equal(detailResponse.status, 200, link);
      const detail = new JSDOM(await detailResponse.text());
      const page = detail.window.document;
      assert.ok(page.querySelector("h1").textContent.length > 5);
      assert.ok(page.querySelectorAll(".challenge-rules li").length > 0);
      assert.ok(page.querySelector(".back-link").getAttribute("href").endsWith(`#challenges`));
      assert.ok(page.querySelector(".back-link").getAttribute("href").includes(`lang=${lang}`));
      assert.equal(page.querySelectorAll(".status-playing, .status-completed").length, 1);
      assert.ok(!page.body.textContent.includes("undefined"));
      detail.window.close();
    }
    assert.equal((await fetch(`${site.origin}/challenges/not-a-challenge?lang=${lang}`)).status, 404);
    const statusResponse = await fetch(`${site.origin}/api/stream-status?lang=${lang}`);
    assert.equal(statusResponse.status, 200);
    assert.equal(statusResponse.headers.get("cache-control"), "no-store");
    const status = await statusResponse.json();
    assert.ok(["scheduled", "upcoming"].includes(status.mode));
    assert.match(status.detail, /19:00–22:00/);
    assert.match(status.detail, /Madrid/);
    assert.deepEqual(Object.keys(status).sort(), ["detail", "game", "label", "linkLabel", "mode", "schedule"]);
  }
});
