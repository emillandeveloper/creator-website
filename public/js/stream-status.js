(function () {
  const root = document.getElementById("stream-spotlight");
  if (!root) return;
  const label = root.querySelector("[data-stream-label]");
  const game = root.querySelector("[data-stream-game]");
  const detail = root.querySelector("[data-stream-detail]");
  const link = root.querySelector("[data-stream-link]");
  const lang = document.documentElement.lang === "es" ? "es" : "en";
  let fallback = { mode: root.dataset.mode, label: label.textContent, game: game.textContent, detail: detail.textContent, linkLabel: link.textContent };
  let busy = false;
  let timer;

  function valid(value) {
    return value && ["live", "upcoming", "scheduled"].includes(value.mode)
      && ["label", "game", "detail", "linkLabel"].every((key) => typeof value[key] === "string");
  }
  function render(value) {
    root.dataset.mode = value.mode;
    label.textContent = value.label;
    game.textContent = value.game;
    detail.textContent = value.detail;
    link.textContent = value.linkLabel;
  }
  async function refresh() {
    clearTimeout(timer);
    if (document.hidden || busy) return;
    busy = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`/api/stream-status?lang=${lang}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Stream status unavailable");
      const data = await response.json();
      if (!valid(data) || !valid(data.schedule) || data.schedule.mode === "live") throw new Error("Invalid stream status");
      fallback = data.schedule;
      render(data);
    } catch { render(fallback); }
    finally {
      clearTimeout(timeout);
      busy = false;
      timer = setTimeout(refresh, 60000);
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearTimeout(timer); render(fallback); }
    else refresh();
  });
  refresh();
})();
