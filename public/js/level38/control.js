(function () {
  "use strict";
  const t = (key, params = {}) => window.Level38I18n?.t(key, params) ?? key.replace(/\{(\w+)\}/g, (match, name) => params[name] === undefined ? match : String(params[name]));
  const { byId, element, request, renderState, renderPolls, connect, message, setText, questText, language, auditDescription } = window.Level38;
  if (document.body.dataset.authenticated !== "true") {
    setText("connection", "Sign in to operate the event.");
    byId("login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button"); button.disabled = true;
      try { await request("control/login", { key: byId("access-key").value }); byId("access-key").value = ""; window.location.reload(); }
      catch (error) { message(error.message); button.disabled = false; }
    });
    return;
  }
  let state = null;
  let busy = false;
  let refreshPromise = null;
  let refreshAgain = false;
  let editingId = null;
  let editingRevision = null;
  const handlers = {
    control: true,
    edit: (poll) => loadEditor(poll, false),
    clone: (poll) => loadEditor(poll, true),
    status: (pollId, action) => {
      if (action === "close" && !window.confirm(t("Close this poll and stop accepting votes?"))) return;
      mutate(`control/polls/${pollId}/status`, { action });
    },
    winner: (pollId, optionId, overrideReason) => {
      if (overrideReason !== null && overrideReason.trim().length < 2) { message("Enter a reason before overriding the winner."); return; }
      if (overrideReason !== null && !window.confirm(t("Override the selected poll winner? The reason will be recorded."))) return;
      mutate(`control/polls/${pollId}/winner`, { optionId, overrideReason });
    },
  };
  function lock(value) { busy = value; byId("operator-controls").disabled = value; }
  function render(next, force = false) {
    window.Level38Twitch?.render(next, mutate);
    if (!force && state && next.event.revision <= state.event.revision) return;
    const controlsChanged = force || !state || next.event.controlRevision !== state.event.controlRevision;
    state = next;
    if (controlsChanged) {
      renderState(state, changeQuest);
      const select = byId("game"); select.replaceChildren(element("option", t("Between adventures"))); select.firstChild.value = "";
      for (const game of state.games.filter((game) => game.enabled)) { const option = element("option", game.title); option.value = game.id; select.append(option); }
      select.value = state.event.currentGameId || ""; select.disabled = false;
      byId("game-form").querySelector("button").disabled = false;
      const audit = state.audit.map((entry) => element("li", `${new Date(entry.createdAt).toLocaleTimeString(language())} · ${entry.operatorName} ${auditDescription(entry, state)}${Number.isFinite(entry.before.completed) && Number.isFinite(entry.after.completed) ? " · " + t("Progress {before} → {after}", {before: entry.before.completed, after: entry.after.completed}) : ""}`));
      byId("audit-list").replaceChildren(...(audit.length ? audit : [element("li", t("No operator actions yet."))]));
    }
    renderPolls(state, handlers);
    renderOwnerTools(state);
    byId("undo").disabled = !state.undo.available;
    setText("control-undo-status", state.undo.available ? "Undo available" : "Undo unavailable");
    setText("control-source", state.event.gameSource === "MANUAL_OVERRIDE" ? "Manual selection" : state.twitch?.enabled ? "AUTO_TWITCH" : "Twitch disabled");
    byId("undo-description").textContent = auditDescription(state.audit.find(entry => entry.id === state.undo.auditId), state);
    byId("undo-reason").textContent = t(state.undo.reason || "Only this latest action can be undone. Undo preserves the activity history.");
  }
  function refresh() {
    if (refreshPromise) { refreshAgain = true; return refreshPromise; }
    refreshPromise = (async () => {
      try { do { refreshAgain = false; render(await request("control/state")); } while (refreshAgain); }
      catch (error) { if (error.status === 401) window.location.reload(); else message(error.message); }
      finally { refreshPromise = null; }
    })();
    return refreshPromise;
  }
  async function mutate(path, body, expectedRevision) {
    if (busy || !state) return false;
    lock(true); message("");
    try {
      await request(path, { ...body, controlRevision: expectedRevision ?? state.event.controlRevision });
      message("Change saved."); return true;
    } catch (error) { message(error.message); return false; }
    finally { await refresh(); lock(false); }
  }
  function changeQuest(quest, action) {
    if (["complete", "fail", "skip", "reveal"].includes(action) && !window.confirm(t("{action} #{number} — {title}?", {action: t({complete:"Complete quest",fail:"Fail quest",skip:"Skip quest",reveal:"Reveal secret"}[action]), number:quest.number, title:questText(quest,"title")}))) return;
    mutate(`control/quests/${quest.id}`, { action });
  }
  byId("game-form").addEventListener("submit", (event) => { event.preventDefault(); mutate("control/game", { gameId: byId("game").value || null }); });
  byId("undo").addEventListener("click", () => {
    if (!state?.undo.available) return;
    const notice = state.audit[0]?.action === "quest:revealed" ? t(" The quest will be hidden again, but viewers may already have seen it.") : "";
    if (!window.confirm(t("Undo: {description}?{notice}", {description:auditDescription(state.audit.find(entry => entry.id === state.undo.auditId),state),notice}))) return;
    mutate("control/undo", { auditId: state.undo.auditId });
  });
  byId("logout").addEventListener("click", async () => { try { await request("control/logout", {}); window.location.reload(); } catch (error) { message(error.message); } });

  function addOption(value = {}) {
    const type = byId("poll-type").value;
    const root = byId("poll-options");
    if (root.children.length >= 8) return;
    const row = element("div", undefined, "l38-option-editor");
    let input;
    if (type === "NEXT_QUEST" || type === "NEXT_GAME") {
      input = element("select");
      const placeholder = element("option", t("Choose an option")); placeholder.value = ""; input.append(placeholder);
      const candidates = type === "NEXT_QUEST" ? (state?.quests || []).filter((quest) => !quest.hidden && quest.status === "AVAILABLE" && state.games.find((game) => game.id === quest.gameId)?.enabled) : (state?.games || []).filter((game) => game.enabled);
      for (const candidate of candidates) { const item = element("option", type === "NEXT_QUEST" ? `#${candidate.number} · ${questText(candidate, "title")}` : candidate.title); item.value = candidate.id; input.append(item); }
      const selected = value.questId || value.gameId || "";
      if (selected && !candidates.some((candidate) => candidate.id === selected)) {
        const unavailable = element("option", t("{label} (no longer available — replace)", {label:value.label || selected})); unavailable.value = selected; input.append(unavailable);
      }
      input.value = selected;
    } else {
      input = element("input"); input.maxLength = 100; input.value = value.label || "";
      if (type === "YES_NO") { input.readOnly = true; input.dataset.canonical = value.label; input.value = t(value.label); }
    }
    input.setAttribute("aria-label", t("Poll option {number}", {number:root.children.length + 1}));
    row.append(input);
    if (type !== "YES_NO") { const remove = element("button", t("Remove option")); remove.type = "button"; remove.addEventListener("click", () => row.remove()); row.append(remove); }
    root.append(row);
  }
  function resetOptions(options) {
    byId("poll-options").replaceChildren();
    const yesNo = byId("poll-type").value === "YES_NO";
    byId("add-option").hidden = yesNo;
    for (const option of yesNo ? [{ label: "Yes" }, { label: "No" }] : options || [{}, {}]) addOption(option);
  }
  function loadEditor(poll, clone) {
    if (!poll || !state) return;
    editingId = clone ? null : poll.id;
    editingRevision = clone ? null : state.event.controlRevision;
    byId("poll-title").value = poll.title; byId("poll-type").value = poll.type;
    setText("poll-editor-title", clone ? "New round from poll #{number}" : "Edit draft #{number}", {number:poll.number});
    resetOptions(poll.options);
    byId("poll-editor").scrollIntoView({ block: "start" }); byId("poll-title").focus();
  }
  function resetEditor() {
    editingId = null; editingRevision = null;
    byId("poll-title").value = ""; setText("poll-editor-title", "Create voting round");
    resetOptions();
  }
  byId("poll-type").addEventListener("change", () => resetOptions());
  byId("add-option").addEventListener("click", () => addOption());
  byId("cancel-poll-edit").addEventListener("click", resetEditor);
  byId("poll-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = byId("poll-type").value;
    const options = Array.from(byId("poll-options").children).map((row) => {
      const input = row.querySelector("select, input"); const value = input.dataset.canonical || input.value;
      return type === "NEXT_QUEST" ? { questId: value } : type === "NEXT_GAME" ? { gameId: value } : { label: value };
    });
    if (await mutate(editingId ? `control/polls/${editingId}/edit` : "control/polls", { title: byId("poll-title").value, type, options }, editingRevision)) resetEditor();
  });
  document.addEventListener("level38:language", () => {
    if (!state) return;
    const game = byId("game").value;
    const type = byId("poll-type").value;
    const options = Array.from(byId("poll-options").children).map(row => {
      const input = row.querySelector("select, input");
      return type === "NEXT_QUEST" ? {questId:input.value, label:input.selectedOptions[0]?.textContent} : type === "NEXT_GAME" ? {gameId:input.value} : {label:input.dataset.canonical || input.value};
    });
    render(state, true); byId("game").value = game; resetOptions(options);
  });
  function renderOwnerTools(next) {
    const archive = byId("archived-polls"); if (!archive) return;
    archive.replaceChildren(...(next.archivedPolls?.length ? next.archivedPolls.map(poll => {
      const item = element("li", `#${poll.number} · ${poll.title}`);
      item.append(element("p", poll.options.map(option => `${window.Level38.optionLabel(poll, option)}: ${option.votes}`).join(" · "), "l38-small"));
      if (poll.winner) item.append(element("p", t("Winner: {label}{override}", {label:window.Level38.optionLabel(poll, poll.options.find(option => option.id === poll.winner)), override:""}), "l38-small"));
      return item;
    }) : [element("li", t("No archived test rounds."))]));
  }
  const confirmations = {preview:"PREVIEW LEVEL 38", progress:"RESET PROGRESS", participants:"CLEAR TEST PARTICIPANTS"};
  const prompts = {
    preview:"Show a TEST finale on all currently connected public and control pages? Progress will not change.",
    progress:"Reset progress to zero and archive all current polls? Participants and history will be kept. This cannot be undone.",
    participants:"Clear all viewer names/classes and expire their sessions? All current polls will be archived with their votes. Operators and progress will be kept. This cannot be undone."
  };
  for (const button of document.querySelectorAll("[data-owner-tool]")) button.addEventListener("click", async () => {
    const action = button.dataset.ownerTool;
    if (!window.confirm(t(prompts[action]))) return;
    await mutate(`owner/tools/${action}`, {confirmation:confirmations[action]});
  });
  byId("prepare-event-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (await mutate("owner/tools/prepare", {confirmation:byId("reset-confirmation").value})) byId("reset-confirmation").value = "";
  });
  lock(true);
  const socket = connect(next => { window.Level38Experience?.observe(next); refresh(); }, refresh);
  window.Level38Experience?.attach(socket, {notices:false});
  refresh().then(() => { resetOptions(); lock(false); });
  setInterval(refresh, 30000);
})();
