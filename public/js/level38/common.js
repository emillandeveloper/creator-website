(function () {
  "use strict";
  const byId = (id) => document.getElementById(id);
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  async function request(path, body) {
    const response = await fetch(`/level38/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json", "X-Level38-Request": "1" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "Request failed. Please try again.");
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function renderState(state, onAction) {
    byId("progress-text").textContent = `${state.event.completed} / ${state.event.target} quests completed`;
    byId("progress").max = state.event.target;
    byId("progress").value = state.event.completed;
    byId("current-game").textContent = state.games.find((game) => game.id === state.event.currentGameId)?.title || "Between adventures";
    byId("secret-count").textContent = `${state.secretCount} secret quests waiting to be revealed.`;
    if (document.body.classList.contains("l38-public")) { renderJournal(state); return; }
    const board = document.createDocumentFragment();
    for (const status of ["ACTIVE", "AVAILABLE", "LOCKED", "COMPLETED", "FAILED", "SKIPPED", "SECRET"]) {
      const quests = state.quests.filter((quest) => status === "SECRET" ? quest.hidden : !quest.hidden && quest.status === status);
      if (status === "SECRET" && !onAction) continue;
      const section = element("section", undefined, "l38-quest-section");
      section.append(element("h2", `${status[0]}${status.slice(1).toLowerCase()} (${quests.length})`));
      const grid = element("div", undefined, "l38-grid");
      for (const quest of quests) {
        const card = element("article", undefined, "l38-card");
        card.dataset.status = quest.status;
        card.append(element("p", state.games.find((game) => game.id === quest.gameId)?.title, "l38-meta"));
        card.append(element("h3", `#${quest.number} · ${quest.title}`), element("p", quest.description));
        for (const action of onAction ? quest.actions || [] : []) {
          const labels = { activate: "Activate quest", complete: "Complete quest", fail: "Fail quest", skip: "Skip quest", reveal: "Reveal secret", available: "Make available" };
          const button = element("button", labels[action]);
          button.type = "button";
          if (["fail", "skip"].includes(action)) button.className = "l38-danger";
          button.setAttribute("aria-label", `${button.textContent} #${quest.number}`);
          button.addEventListener("click", () => onAction(quest, action));
          card.append(button);
        }
        grid.append(card);
      }
      if (!quests.length) grid.append(element("p", "No quests here yet."));
      section.append(grid);
      board.append(section);
    }
    byId("quest-board").replaceChildren(board);
  }
  let journalState = null;
  let journalSignature = "";
  let filtersBound = false;
  function questCard(quest, state) {
    const card = element("article", undefined, "l38-card"); card.dataset.status = quest.status;
    const top = element("div", undefined, "l38-card-top");
    top.append(element("span", `QUEST ${String(quest.number).padStart(2, "0")}`, "l38-quest-number"), element("span", quest.status, "l38-status"));
    card.append(top, element("h3", quest.title), element("p", quest.description), element("p", `◇ ${state.games.find((g) => g.id === quest.gameId)?.title || "Adventure"}`, "l38-meta"));
    return card;
  }
  function filterJournal() {
    const state = journalState;
    if (!state) return;
    const game = byId("quest-game").value; const status = byId("quest-status").value;
    const search = byId("quest-search").value.trim().toLocaleLowerCase();
    const quests = state.quests.filter((quest) => !quest.hidden && (game === "all" || quest.gameId === (game === "current" ? state.event.currentGameId : game)) &&
      (status === "all" || quest.status === status) && `${quest.title} ${quest.description}`.toLocaleLowerCase().includes(search));
    const grid = element("div", undefined, "l38-grid");
    for (const quest of quests) grid.append(questCard(quest, state));
    if (!quests.length) grid.append(element("p", status === "SECRET" ? "Hidden quests have no public details yet." : "No quests on this path. Try another filter.", "l38-empty"));
    byId("quest-board").replaceChildren(grid);
    byId("quest-filter-status").textContent = `${quests.length} matching quest${quests.length === 1 ? "" : "s"}`;
    const secret = byId("secret-placeholder");
    secret.hidden = state.secretCount === 0 || (status !== "all" && status !== "SECRET");
    secret.querySelector("strong").textContent = `${state.secretCount} HIDDEN`;
  }
  function renderJournal(state) {
    const segments = byId("progress-segments");
    if (segments.children.length !== state.event.target) segments.replaceChildren(...Array.from({ length: state.event.target }, () => element("span")));
    Array.from(segments.children).forEach((segment, i) => segment.classList.toggle("is-complete", i < state.event.completed));
    segments.style.setProperty("--segments", state.event.target);
    byId("journey-label").textContent = state.event.completed >= state.event.target ? "TARGET REACHED" : "ADVENTURE IN PROGRESS";
    byId("progress-remaining").textContent = `${Math.max(0, state.event.target - state.event.completed)} TO GO ✦`;
    journalState = state;
    const signature = JSON.stringify([state.quests, state.games, state.event.currentGameId, state.secretCount]);
    if (signature === journalSignature) return;
    journalSignature = signature;
    const active = state.quests.filter((quest) => !quest.hidden && quest.status === "ACTIVE");
    byId("active-count").textContent = `${active.length} ACTIVE`;
    byId("active-board").replaceChildren(...(active.length ? active.map((quest) => questCard(quest, state)) : [element("p", "A moment at the campfire. Leo's next objective will appear here.", "l38-empty")]));
    const game = byId("quest-game"); const selected = game.value;
    const options = [["all", "All games"], ["current", "Current game"], ...state.games.map((g) => [g.id, g.title])];
    game.replaceChildren(...options.map(([value, title]) => { const option = element("option", title); option.value = value; return option; }));
    game.value = options.some(([id]) => id === selected) ? selected : "all";
    byId("journal-count").textContent = `${state.quests.length} KNOWN QUESTS`;
    if (!filtersBound) {
      filtersBound = true;
      for (const id of ["quest-game", "quest-status"]) byId(id).addEventListener("change", filterJournal);
      byId("quest-search").addEventListener("input", filterJournal);
    }
    filterJournal();
  }
  function renderSprite(root, job) {
    const signature = JSON.stringify(job);
    if (root.dataset.sprite === signature) return;
    root.dataset.sprite = signature; root.replaceChildren();
    const fallback = element("span", job ? "✦" : "?", "l38-sprite-fallback"); root.append(fallback);
    if (!job?.sprite) return;
    const sprite = job.sprite;
    const frame = element("span", undefined, "l38-sprite");
    frame.style.setProperty("--frame-width", `${sprite.frameWidth}px`); frame.style.setProperty("--frame-height", `${sprite.frameHeight}px`);
    frame.style.setProperty("--frames", sprite.frames); frame.style.setProperty("--duration", `${sprite.frames / sprite.fps}s`);
    const img = element("img"); img.alt = ""; img.src = sprite.path;
    img.addEventListener("load", () => { fallback.hidden = true; });
    img.addEventListener("error", () => { frame.hidden = true; fallback.hidden = false; });
    frame.append(img); root.append(frame);
  }
  let pollSignature = "";
  let latestPolls = [];
  function renderPolls(state, handlers, myVotes = [], busy = false) {
    latestPolls = state.polls;
    if (byId("vote-nav")) { const open = state.polls.some((poll) => poll.status === "OPEN"); byId("vote-nav").textContent = open ? "Vote now ·" : "Vote"; byId("vote-nav").classList.toggle("is-open", open); }
    const root = byId("poll-board");
    const signature = JSON.stringify(state.polls.map((poll) => ({ id: poll.id, title: poll.title, type: poll.type, status: poll.status,
      options: poll.options.map((option) => ({ id: option.id, label: option.label })), winner: poll.effectiveWinnerId, override: poll.overrideOptionId })));
    if (signature !== pollSignature) {
      pollSignature = signature;
      const board = document.createDocumentFragment();
      const latest = state.polls.find((poll) => poll.status === "OPEN") || state.polls[0];
      const old = handlers.control ? [] : state.polls.filter((poll) => poll.id !== latest?.id);
      const history = old.length ? element("details", undefined, "l38-poll-history") : null;
      if (history) history.append(element("summary", `Earlier voting rounds (${old.length})`));
      for (const poll of state.polls) {
        const card = element("section", undefined, "l38-panel l38-poll");
        card.dataset.pollId = poll.id;
        card.dataset.status = poll.status;
        const roundLabel = handlers.control ? `Poll #${poll.number} · ${poll.type.replaceAll("_", " ")} · ${poll.status}` : `ROUND ${String(poll.number).padStart(2, "0")} · ${poll.status}`;
        card.append(element("p", roundLabel, "l38-meta"), element("h3", poll.title));
        const total = element("p", ""); total.dataset.total = "true"; card.append(total);
        for (const option of poll.options) {
          const row = element("div", undefined, "l38-option");
          row.dataset.choiceId = option.id;
          const tally = element("span", ""); tally.dataset.optionId = option.id; row.append(tally);
          if (!handlers.control) { const percent = element("span", "", "l38-percent"); percent.dataset.percent = option.id; row.append(percent); }
          if (!handlers.control && poll.status === "OPEN") {
            const vote = element("button", "Vote"); vote.type = "button"; vote.dataset.voteId = option.id;
            vote.setAttribute("aria-label", `Vote for ${option.label}`);
            vote.addEventListener("click", () => handlers.vote(poll.id, option.id)); row.append(vote);
          }
          card.append(row);
        }
        if (poll.effectiveWinnerId) {
          card.append(element("p", `Winner: ${poll.options.find((option) => option.id === poll.effectiveWinnerId)?.label || "Unselected"}${poll.overrideOptionId ? " (moderator override)" : ""}`, "l38-result"));
        }
        if (handlers.control) {
          const actions = element("div", undefined, "l38-actions");
          function actionButton(label, handler) { const button = element("button", label); button.type = "button"; button.addEventListener("click", handler); actions.append(button); return button; }
          if (poll.status === "DRAFT") {
            actionButton("Edit draft", () => handlers.edit(latestPolls.find((item) => item.id === poll.id)));
            actionButton("Open poll", () => handlers.status(poll.id, "open"));
          }
          if (poll.status === "OPEN") actionButton("Close poll", () => handlers.status(poll.id, "close"));
          actionButton("New round from this poll", () => handlers.clone(latestPolls.find((item) => item.id === poll.id)));
          card.append(actions);
          if (poll.status === "CLOSED") {
            const select = element("select"); select.setAttribute("aria-label", `Winner for poll #${poll.number}`);
            for (const option of poll.options) { const item = element("option", option.label); item.value = option.id; select.append(item); }
            select.value = poll.effectiveWinnerId || poll.leadingOptionIds[0] || poll.options[0]?.id || "";
            const reason = element("input"); reason.placeholder = "Reason for override"; reason.maxLength = 240;
            reason.setAttribute("aria-label", `Override reason for poll #${poll.number}`);
            const accept = element("button", "Accept selected leader"); accept.type = "button"; accept.dataset.accept = "true";
            const override = element("button", "Override winner"); override.type = "button";
            accept.addEventListener("click", () => handlers.winner(poll.id, select.value, null));
            override.addEventListener("click", () => handlers.winner(poll.id, select.value, reason.value));
            select.addEventListener("change", () => updatePollCounts(myVotes, busy));
            card.append(select, accept, reason, override);
          }
        }
        if (history && poll.id !== latest.id) history.append(card); else board.append(card);
      }
      if (history) board.append(history);
      if (!state.polls.length) { const empty = element("div", undefined, "l38-panel l38-empty"); empty.append(element("span", "?", "l38-empty-icon"), element("h3", handlers.control ? "No polls yet. Create a draft below." : "The next choice is just ahead."), element("p", "When a vote opens, choose Leo's next move right here.")); board.append(empty); }
      root.replaceChildren(board);
    }
    updatePollCounts(myVotes, busy);
  }
  function updatePollCounts(myVotes, busy) {
    for (const poll of latestPolls) {
      const card = byId("poll-board").querySelector(`[data-poll-id="${poll.id}"]`);
      if (!card) continue;
      card.querySelector("[data-total]").textContent = `${poll.totalVotes} vote${poll.totalVotes === 1 ? "" : "s"}`;
      for (const option of poll.options) {
        const tally = card.querySelector(`[data-option-id="${option.id}"]`);
        const text = `${option.label} — ${option.votes}`;
        if (tally.textContent !== text) tally.textContent = text;
        const percent = card.querySelector(`[data-percent="${option.id}"]`);
        const row = card.querySelector(`[data-choice-id="${option.id}"]`);
        const selected = myVotes.some((entry) => entry.pollId === poll.id && entry.optionId === option.id);
        if (percent) { const amount = poll.totalVotes ? Math.round(option.votes / poll.totalVotes * 100) : 0; percent.textContent = `${amount}%`; row.style.setProperty("--vote-percent", `${amount}%`); }
        row.classList.toggle("is-selected", selected); row.classList.toggle("is-winner", poll.effectiveWinnerId === option.id);
        const vote = card.querySelector(`[data-vote-id="${option.id}"]`);
        if (vote) {
          vote.textContent = selected ? "Your vote" : "Vote";
          vote.setAttribute("aria-pressed", String(selected)); vote.disabled = busy;
        }
      }
      const accept = card.querySelector("[data-accept]");
      if (accept) accept.disabled = !!poll.effectiveWinnerId || !poll.leadingOptionIds.includes(card.querySelector("select").value);
    }
  }
  function connect(onState, onReconnect) {
    if (typeof window.io !== "function") {
      byId("connection").textContent = "Live connection unavailable. Checking for updates periodically.";
      return null;
    }
    const socket = window.io("/level38", { path: "/level38/socket.io" });
    socket.on("level38:state", (state) => {
      byId("connection").textContent = "Live updates connected";
      onState(state);
    });
    socket.on("connect", () => { if (onReconnect) onReconnect(); });
    socket.on("disconnect", () => { byId("connection").textContent = "Connection lost. Reconnecting…"; });
    socket.on("connect_error", () => { byId("connection").textContent = "Unable to connect. Retrying…"; });
    socket.on("level38:unavailable", () => { byId("connection").textContent = "Event temporarily unavailable. Retrying…"; });
    return socket;
  }
  let messageTimer;
  function message(text) {
    clearTimeout(messageTimer); byId("message").textContent = text;
    if (document.body.classList.contains("l38-public") && text) messageTimer = setTimeout(() => { byId("message").textContent = ""; }, 6500);
  }
  window.Level38 = { byId, element, request, renderState, renderPolls, renderSprite, connect, message };
})();
