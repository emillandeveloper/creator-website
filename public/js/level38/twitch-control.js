(function () {
  "use strict";
  const t = (key, params = {}) => window.Level38I18n?.t(key, params) ?? key.replace(/\{(\w+)\}/g, (match, name) => params[name] === undefined ? match : String(params[name]));
  const { byId, element } = window.Level38;
  let bound = false;
  let mappingSignature = "";
  let revision = 0;
  const statusText = (id, value) => { const node = byId(id); if (node) node.textContent = value; };
  function received(at) {
    const time = Date.parse(at);
    return Number.isFinite(time) ? t("Last received: {time}", {time:new Date(time).toLocaleString(window.Level38I18n?.language || "en")}) : t("No update received yet.");
  }
  function renderPollDiagnostics(state) {
    const twitch = state.twitch, polls = twitch?.polls, app = twitch?.appAuth;
    statusText("twitch-polls-status", polls?.available
      ? t("Broadcaster authorization verified. Native polls can be created.")
      : t(polls?.error || "Native Twitch polls need broadcaster authorization with channel:manage:polls."));
    statusText("twitch-app-auth", app?.status === "ready" ? t("App authorization verified.")
      : app?.status === "error" ? [t(app.httpStatus ? "App authorization failed (HTTP {status})." : "App authorization failed.", {status:app.httpStatus}), t(app.error || "Check the Client ID and Client Secret of the existing Twitch application in Render.")].join(" ")
      : t("App authorization has not succeeded yet."));
    const subscriptions = byId("twitch-poll-subscriptions");
    if (subscriptions) {
      const list = element("ul");
      for (const type of ["channel.poll.begin", "channel.poll.progress", "channel.poll.end"]) {
        const sub = twitch?.eventSub?.subscriptions?.find(item => item.type === type);
        const status = sub?.status === "enabled" ? t("Enabled") : sub?.status === "webhook_callback_verification_pending" ? t("Pending verification") : sub?.status || t("Unknown");
        list.append(element("li", `${type}: ${status}. ${received(sub?.lastReceiptAt)}`));
      }
      subscriptions.replaceChildren(list);
      if (twitch?.eventSub?.error) subscriptions.append(element("p", t(twitch.eventSub.error)));
    }
    const backup = polls?.backup, live = polls?.live;
    const active = state.polls?.find(poll => poll.id === backup?.activePollId && poll.status === "OPEN");
    const progress = twitch?.eventSub?.subscriptions?.find(item => item.type === "channel.poll.progress");
    const progressForActive = active && Date.parse(progress?.lastReceiptAt) >= Date.parse(active.openedAt);
    const eventSubReady = twitch?.eventSub?.available === true;
    let liveStatus = t("No native poll is open.");
    if (active) {
      if (backup?.status === "retrying" && !eventSubReady) liveStatus = t("Live synchronization is degraded. Helix backup is retrying.");
      else if (backup?.status === "healthy" && (!eventSubReady || !progressForActive || live?.source === "helix")) liveStatus = t("Backup mode: live results are synchronized through Helix.");
      else if (live?.source === "eventsub" && progressForActive) liveStatus = t("Live results received through EventSub.");
      else liveStatus = t("Waiting for the first live update for this poll.");
      liveStatus += ` ${received(live?.lastUpdateAt)}`;
    }
    statusText("twitch-poll-live", liveStatus);
    const backupLabels = { idle:"Idle. No open native poll to synchronize.", scheduled:"Helix backup is scheduled every {seconds} seconds.", healthy:"Helix backup is working every {seconds} seconds.", retrying:"Helix backup is retrying after a temporary error.", disabled:"Helix backup is disabled or unavailable." };
    const backupText = t(backupLabels[backup?.status] || "Helix backup has not reported its status yet.", {seconds:backup?.intervalSeconds || 5});
    statusText("twitch-poll-backup", [backupText, backup?.lastSuccessAt ? received(backup.lastSuccessAt) : "", backup?.error ? t(backup.error) : ""].filter(Boolean).join(" "));
  }
  function render(state, mutate) {
    if (!byId("twitch-connection")) return;
    revision = state.event.controlRevision;
    const twitch = state.twitch;
    byId("twitch-connection").textContent = t(twitch?.connection || "Disabled");
    byId("twitch-error").textContent = t(twitch?.error || "");
    renderPollDiagnostics(state);
    byId("twitch-source").textContent = state.event.gameSource === "MANUAL_OVERRIDE"
      ? t("Game source: Manual Override{operator}", {operator: state.event.manualOverrideBy ? t(" by {name}", {name:state.event.manualOverrideBy}) : ""}) : t("Game source: Twitch Auto");
    byId("twitch-channel").textContent = twitch?.broadcasterId ? `${twitch.channel || t("Broadcaster")} (${twitch.broadcasterId})` : twitch?.channel || t("Not configured");
    byId("twitch-category").textContent = twitch?.categoryName ? `${twitch.categoryName} (${twitch.categoryId})` : t("No category received");
    const mapped = state.games.find((game) => game.enabled && game.twitchCategoryId && game.twitchCategoryId === twitch?.categoryId);
    byId("twitch-mapped").textContent = mapped?.title || (twitch?.categoryId ? t("Unmapped Twitch category — current game preserved") : t("No mapped category"));
    byId("twitch-updated").textContent = twitch?.lastEventAt ? new Date(twitch.lastEventAt).toLocaleString(window.Level38I18n?.language || "en") : t("No EventSub update yet");
    byId("twitch-subscription").textContent = twitch?.enabled ? t((twitch.subscriptionStatus || "unknown").replaceAll("_", " ")) : t("Disabled");
    byId("twitch-auto").disabled = !twitch?.available || state.event.gameSource === "AUTO_TWITCH";
    for (const action of ["sync", "ensure", "recreate"]) if (byId(`twitch-${action}`)) byId(`twitch-${action}`).disabled = !twitch?.available;
    if (!bound) {
      bound = true;
      for (const action of ["auto", "sync", "ensure", "recreate"]) byId(`twitch-${action}`)?.addEventListener("click", () => {
        if (action === "recreate" && !window.confirm(t("Replace this channel's LEVEL 38 subscription? Use this after rotating the webhook secret or if verification is stuck."))) return;
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
      const idLabel = element("label", t("Twitch category ID (blank clears)")); idLabel.htmlFor = id.id; idLabel.dataset.i18n = "Twitch category ID (blank clears)";
      const name = element("input"); name.id = `twitch-name-${game.id}`; name.maxLength = 200; name.value = game.twitchCategoryName || "";
      const nameLabel = element("label", t("Category name (optional)")); nameLabel.htmlFor = name.id; nameLabel.dataset.i18n = "Category name (optional)";
      const button = element("button", t("Save mapping")); button.type = "submit"; button.dataset.i18n = "Save mapping";
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
