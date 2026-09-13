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
  let pollSignature = "";
  let latestPolls = [];
  function renderPolls(state, handlers, myVotes = [], busy = false) {
    latestPolls = state.polls;
    const root = byId("poll-board");
    const signature = JSON.stringify(state.polls.map((poll) => ({ id: poll.id, title: poll.title, type: poll.type, status: poll.status,
      options: poll.options.map((option) => ({ id: option.id, label: option.label })), winner: poll.effectiveWinnerId, override: poll.overrideOptionId })));
    if (signature !== pollSignature) {
      pollSignature = signature;
      const board = document.createDocumentFragment();
      for (const poll of state.polls) {
        const card = element("section", undefined, "l38-panel l38-poll");
        card.dataset.pollId = poll.id;
        card.dataset.status = poll.status;
        card.append(element("p", `Poll #${poll.number} · ${poll.type.replaceAll("_", " ")} · ${poll.status}`, "l38-meta"), element("h3", poll.title));
        const total = element("p", ""); total.dataset.total = "true"; card.append(total);
        for (const option of poll.options) {
          const row = element("div", undefined, "l38-option");
          const tally = element("span", ""); tally.dataset.optionId = option.id; row.append(tally);
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
        board.append(card);
      }
      if (!state.polls.length) board.append(element("p", handlers.control ? "No polls yet. Create a draft below." : "No poll is open yet. Check back during the event."));
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
        card.querySelector(`[data-option-id="${option.id}"]`).textContent = `${option.label} — ${option.votes}`;
        const vote = card.querySelector(`[data-vote-id="${option.id}"]`);
        if (vote) {
          const selected = myVotes.some((entry) => entry.pollId === poll.id && entry.optionId === option.id);
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
  window.Level38 = { byId, element, request, renderState, renderPolls, connect, message: (text) => { byId("message").textContent = text; } };
})();
