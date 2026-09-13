(function () {
  "use strict";
  const { byId, element, request, renderState, renderPolls, connect, message } = window.Level38;
  if (document.body.dataset.authenticated !== "true") {
    byId("connection").textContent = "Sign in to operate the event.";
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
      if (action === "close" && !window.confirm("Close this poll and stop accepting votes?")) return;
      mutate(`control/polls/${pollId}/status`, { action });
    },
    winner: (pollId, optionId, overrideReason) => {
      if (overrideReason !== null && overrideReason.trim().length < 2) { message("Enter a reason before overriding the winner."); return; }
      if (overrideReason !== null && !window.confirm("Override the selected poll winner? The reason will be recorded.")) return;
      mutate(`control/polls/${pollId}/winner`, { optionId, overrideReason });
    },
  };
  function lock(value) { busy = value; byId("operator-controls").disabled = value; }
  function render(next) {
    window.Level38Twitch?.render(next, mutate);
    if (state && next.event.revision <= state.event.revision) return;
    const controlsChanged = !state || next.event.controlRevision !== state.event.controlRevision;
    state = next;
    if (controlsChanged) {
      renderState(state, changeQuest);
      const select = byId("game"); select.replaceChildren(element("option", "Between adventures")); select.firstChild.value = "";
      for (const game of state.games.filter((game) => game.enabled)) { const option = element("option", game.title); option.value = game.id; select.append(option); }
      select.value = state.event.currentGameId || ""; select.disabled = false;
      byId("game-form").querySelector("button").disabled = false;
      const audit = state.audit.map((entry) => element("li", `${new Date(entry.createdAt).toLocaleTimeString()} · ${entry.operatorName} ${entry.description} · Progress ${entry.before.completed} → ${entry.after.completed}`));
      byId("audit-list").replaceChildren(...(audit.length ? audit : [element("li", "No operator actions yet.")]));
    }
    renderPolls(state, handlers);
    byId("undo").disabled = !state.undo.available;
    byId("undo-description").textContent = state.undo.description || "No action yet.";
    byId("undo-reason").textContent = state.undo.reason || "Only this latest action can be undone. Undo preserves the activity history.";
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
    if (["complete", "fail", "skip", "reveal"].includes(action) && !window.confirm(`${action[0].toUpperCase() + action.slice(1)} quest #${quest.number} — ${quest.title}?`)) return;
    mutate(`control/quests/${quest.id}`, { action });
  }
  byId("game-form").addEventListener("submit", (event) => { event.preventDefault(); mutate("control/game", { gameId: byId("game").value || null }); });
  byId("undo").addEventListener("click", () => {
    if (!state?.undo.available) return;
    const notice = state.audit[0]?.action === "quest:revealed" ? " The quest will be hidden again, but viewers may already have seen it." : "";
    if (!window.confirm(`Undo: ${state.undo.description}?${notice}`)) return;
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
      const placeholder = element("option", "Choose an option"); placeholder.value = ""; input.append(placeholder);
      const candidates = type === "NEXT_QUEST" ? (state?.quests || []).filter((quest) => !quest.hidden && quest.status === "AVAILABLE" && state.games.find((game) => game.id === quest.gameId)?.enabled) : (state?.games || []).filter((game) => game.enabled);
      for (const candidate of candidates) { const item = element("option", type === "NEXT_QUEST" ? `#${candidate.number} · ${candidate.title}` : candidate.title); item.value = candidate.id; input.append(item); }
      const selected = value.questId || value.gameId || "";
      if (selected && !candidates.some((candidate) => candidate.id === selected)) {
        const unavailable = element("option", `${value.label || selected} (no longer available — replace)`); unavailable.value = selected; input.append(unavailable);
      }
      input.value = selected;
    } else {
      input = element("input"); input.maxLength = 100; input.value = value.label || "";
      if (type === "YES_NO") input.readOnly = true;
    }
    input.setAttribute("aria-label", `Poll option ${root.children.length + 1}`);
    row.append(input);
    if (type !== "YES_NO") { const remove = element("button", "Remove option"); remove.type = "button"; remove.addEventListener("click", () => row.remove()); row.append(remove); }
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
    byId("poll-editor-title").textContent = clone ? `New round from poll #${poll.number}` : `Edit draft #${poll.number}`;
    resetOptions(poll.options);
    byId("poll-editor").scrollIntoView({ block: "start" }); byId("poll-title").focus();
  }
  function resetEditor() {
    editingId = null; editingRevision = null;
    byId("poll-title").value = ""; byId("poll-editor-title").textContent = "Create voting round";
    resetOptions();
  }
  byId("poll-type").addEventListener("change", () => resetOptions());
  byId("add-option").addEventListener("click", () => addOption());
  byId("cancel-poll-edit").addEventListener("click", resetEditor);
  byId("poll-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = byId("poll-type").value;
    const options = Array.from(byId("poll-options").children).map((row) => {
      const value = row.querySelector("select, input").value;
      return type === "NEXT_QUEST" ? { questId: value } : type === "NEXT_GAME" ? { gameId: value } : { label: value };
    });
    if (await mutate(editingId ? `control/polls/${editingId}/edit` : "control/polls", { title: byId("poll-title").value, type, options }, editingRevision)) resetEditor();
  });
  lock(true);
  connect(() => refresh(), refresh);
  refresh().then(() => { resetOptions(); lock(false); });
  setInterval(refresh, 30000);
})();
