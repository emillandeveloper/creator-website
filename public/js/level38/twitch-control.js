(function () {
  "use strict";
  const { byId, element } = window.Level38;
  let bound = false;
  let mappingSignature = "";
  let revision = 0;
  function render(state, mutate) {
    if (!byId("twitch-connection")) return;
    revision = state.event.controlRevision;
    const twitch = state.twitch;
    byId("twitch-connection").textContent = twitch?.connection || "Disabled";
    byId("twitch-error").textContent = twitch?.error || "";
    byId("twitch-source").textContent = state.event.gameSource === "MANUAL_OVERRIDE"
      ? `Game source: Manual Override${state.event.manualOverrideBy ? ` by ${state.event.manualOverrideBy}` : ""}` : "Game source: Twitch Auto";
    byId("twitch-channel").textContent = twitch?.broadcasterId ? `${twitch.channel || "Broadcaster"} (${twitch.broadcasterId})` : twitch?.channel || "Not configured";
    byId("twitch-category").textContent = twitch?.categoryName ? `${twitch.categoryName} (${twitch.categoryId})` : "No category received";
    const mapped = state.games.find((game) => game.enabled && game.twitchCategoryId && game.twitchCategoryId === twitch?.categoryId);
    byId("twitch-mapped").textContent = mapped?.title || (twitch?.categoryId ? "Unmapped Twitch category — current game preserved" : "No mapped category");
    byId("twitch-updated").textContent = twitch?.lastEventAt ? new Date(twitch.lastEventAt).toLocaleString() : "No EventSub update yet";
    byId("twitch-subscription").textContent = twitch?.enabled ? twitch.subscriptionStatus.replaceAll("_", " ") : "Disabled";
    byId("twitch-auto").disabled = !twitch?.available || state.event.gameSource === "AUTO_TWITCH";
    for (const action of ["sync", "ensure", "recreate"]) if (byId(`twitch-${action}`)) byId(`twitch-${action}`).disabled = !twitch?.available;
    if (!bound) {
      bound = true;
      for (const action of ["auto", "sync", "ensure", "recreate"]) byId(`twitch-${action}`)?.addEventListener("click", () => {
        if (action === "recreate" && !window.confirm("Replace this channel's LEVEL 38 subscription? Use this after rotating the webhook secret or if verification is stuck.")) return;
        mutate(`control/twitch/${action}`, {});
      });
    }
    const root = byId("twitch-mapping-forms");
    if (!root) return;
    const signature = JSON.stringify(state.games.map((game) => [game.id, game.title, game.twitchCategoryId, game.twitchCategoryName]));
    // Preserve unsaved owner input through votes/status refreshes and unrelated actions.
    if (signature === mappingSignature) return;
    mappingSignature = signature;
    root.replaceChildren(...state.games.map((game) => {
      const form = element("form", undefined, "l38-twitch-mapping");
      const title = element("h3", game.title);
      const id = element("input"); id.id = `twitch-id-${game.id}`; id.inputMode = "numeric"; id.pattern = "[0-9]{1,30}"; id.maxLength = 30; id.value = game.twitchCategoryId || "";
      const idLabel = element("label", "Twitch category ID (blank clears)"); idLabel.htmlFor = id.id;
      const name = element("input"); name.id = `twitch-name-${game.id}`; name.maxLength = 200; name.value = game.twitchCategoryName || "";
      const nameLabel = element("label", "Category name (optional)"); nameLabel.htmlFor = name.id;
      const button = element("button", "Save mapping"); button.type = "submit";
      form.append(title, idLabel, id, nameLabel, name, button);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const saved = await mutate(`owner/games/${game.id}/twitch`, { twitchCategoryId: id.value.trim() || null, twitchCategoryName: name.value.trim() || null }, revision);
        if (!saved) { mappingSignature = ""; }
      });
      return form;
    }));
  }
  window.Level38Twitch = { render };
})();
