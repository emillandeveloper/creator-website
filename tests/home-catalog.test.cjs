const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const ejs = require("ejs");
const { JSDOM } = require("jsdom");
const { startSite } = require("./helpers.cjs");
const { HomeController } = require("../dist/controllers/HomeController");

const challengeTitles = [
  "Final Fantasy VII — Randomizer",
  "Final Fantasy IX — Solo Garnet",
  "Final Fantasy V — Crystal Roulette Fiesta",
  "Final Fantasy IX — Lv.1 Challenge Run",
  "Final Fantasy X - No Sphere Grid / No Customization",
  "Final Fantasy VII - No Shops / Fixed Party",
];
const titles = (element) => Array.from(element.querySelectorAll(".game-title"), (item) => item.textContent);

test("home separates challenges and playthroughs in both languages", async (t) => {
  const site = await startSite();
  t.after(() => site.stop());
  const slider = await fs.readFile(path.join(__dirname, "../public/js/slider.js"), "utf8");

  for (const lang of ["en", "es"]) {
    const response = await fetch(`${site.origin}/?lang=${lang}`);
    assert.equal(response.status, 200);
    const dom = new JSDOM(await response.text(), { runScripts: "outside-only" });
    const { document } = dom.window;
    const challenges = document.querySelector("#challenges");
    const playthroughs = document.querySelector("#playthroughs");
    assert.deepEqual(titles(challenges), challengeTitles);
    assert.equal(titles(playthroughs).length, 30);
    assert.equal(new Set([...titles(challenges), ...titles(playthroughs)]).size, 36);
    assert.ok(!titles(playthroughs).some((title) => challengeTitles.includes(title)));
    assert.ok(titles(playthroughs).includes("Final Fantasy X / X-2 HD Remaster"));
    assert.ok(!document.body.textContent.includes("Baldur's Gate 3"));

    for (const [id, count] of [["challenges-playing", 1], ["challenges-completed", 5], ["playthroughs-playing", 3], ["playthroughs-completed", 27]]) {
      assert.equal(titles(document.getElementById(id).closest(".game-group")).length, count);
    }
    assert.equal(document.querySelectorAll("#now-playing .game-card").length, 4);
    assert.equal(document.querySelectorAll("#now-playing .type-challenge").length, 1);
    assert.equal(document.querySelectorAll("#now-playing .type-playthrough").length, 3);
    assert.equal(challenges.querySelector(".section-title").textContent, lang === "en" ? "Challenges" : "Desafíos");
    assert.equal(playthroughs.querySelector(".section-title").textContent, lang === "en" ? "Playthroughs" : "Partidas");
    assert.equal(document.querySelector(".status-playing").textContent, lang === "en" ? "Playing" : "En curso");
    assert.equal(document.querySelector(".status-completed").textContent, lang === "en" ? "Completed" : "Completado");

    dom.window.eval(slider);
    const buttons = Array.from(document.querySelectorAll(".nav-btn"));
    const slides = Array.from(document.querySelectorAll("#track > .slide"));
    assert.equal(buttons.length, 6);
    assert.equal(slides.length, buttons.length);
    assert.equal(slides[3].id, "challenges");
    assert.equal(slides[4].id, "playthroughs");
    for (const [index, button] of buttons.entries()) {
      assert.equal(button.dataset.slide, String(index));
      button.click();
      assert.equal(document.querySelector("#track").style.transform, `translateX(-${index * 100}%)`);
      assert.equal(document.querySelectorAll(".nav-btn.active").length, 1);
      assert.ok(button.classList.contains("active"));
    }
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowLeft" }));
    assert.ok(buttons[4].classList.contains("active"));
    document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowRight" }));
    assert.ok(buttons[5].classList.contains("active"));

    const assets = new Set(Array.from(document.querySelectorAll("img[src], script[src], link[href]"), (node) => node.getAttribute("src") || node.getAttribute("href")).filter((url) => url.startsWith("/")));
    for (const asset of assets) {
      const assetResponse = await fetch(site.origin + asset);
      assert.equal(assetResponse.status, 200, `Missing asset: ${asset}`);
      await assetResponse.arrayBuffer();
    }
    dom.window.close();
  }
});

test("empty categories show a localized message without empty status groups", async () => {
  for (const lang of ["en", "es"]) {
    let locals;
    HomeController.index({ query: { lang } }, { render: (_view, data) => { locals = data; } });
    const html = await ejs.renderFile(path.join(__dirname, "../src/views/index.ejs"), {
      ...locals, challengeGames: [], playthroughGames: [],
    });
    const dom = new JSDOM(html);
    for (const id of ["challenges", "playthroughs"]) {
      const section = dom.window.document.getElementById(id);
      assert.ok(section.querySelector(".empty-state").textContent.trim());
      assert.equal(section.querySelectorAll(".game-group, .game-card").length, 0);
    }
    dom.window.close();
  }
});
