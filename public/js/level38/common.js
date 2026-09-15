(function () {
  "use strict";
  const t = (key, params = {}) => window.Level38I18n?.t(key, params) ?? key.replace(/\{(\w+)\}/g, (match, name) => params[name] === undefined ? match : String(params[name]));
  const byId = (id) => document.getElementById(id);
  const language = () => window.Level38I18n?.language || "en";
  const questText = (quest, field) => window.Level38I18n?.questText(quest, field) || quest[field] || t(field === "title" ? "Quest" : "No description available.");
  const optionLabel = (poll, option) => !option ? t("Unselected") : poll.type === "YES_NO" ? t(option.label) : poll.type === "NEXT_QUEST" ? questText({ ...option, title: option.label }, "title") : option.label;
  function setText(id, key, params = {}) {
    const node = byId(id); if (!node) return;
    node.dataset.i18n = key; node.dataset.i18nParams = JSON.stringify(params); node.textContent = t(key, params);
  }
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
    setText("progress-text", "{completed} / {target} quests completed", state.event);
    byId("progress").max = state.event.target;
    byId("progress").value = state.event.completed;
    byId("current-game").textContent = state.games.find((game) => game.id === state.event.currentGameId)?.title || t("Between adventures");
    setText("secret-count", "{count} secret quests waiting to be revealed.", { count: state.secretCount });
    renderSegments(state);
    if (document.body.classList.contains("l38-public")) { renderJournal(state); return; }
    const board = document.createDocumentFragment();
    for (const status of ["ACTIVE", "AVAILABLE", "LOCKED", "COMPLETED", "FAILED", "SKIPPED", "SECRET"]) {
      const quests = state.quests.filter((quest) => status === "SECRET" ? quest.hidden : !quest.hidden && quest.status === status);
      if (status === "SECRET" && !onAction) continue;
      const section = element(status === "ACTIVE" ? "section" : "details", undefined, "l38-quest-section");
      section.dataset.questSection = status;
      if (status === "AVAILABLE" || status === "SECRET") section.open = true;
      const heading = element(status === "ACTIVE" ? "h2" : "summary", `${t(status)} (${quests.length})`);
      section.append(heading);
      const grid = element("div", undefined, "l38-grid");
      for (const quest of quests) {
        const card = questCard(quest, state);
        for (const action of onAction ? quest.actions || [] : []) {
          const labels = { activate: t("Activate quest"), complete: t("Complete quest"), fail: t("Fail quest"), skip: t("Skip quest"), reveal: t("Reveal secret"), available: t("Make available") };
          const button = element("button", labels[action]);
          button.type = "button";
          if (["fail", "skip"].includes(action)) button.className = "l38-danger";
          button.setAttribute("aria-label", `${button.textContent} #${quest.number}`);
          button.addEventListener("click", () => onAction(quest, action));
          card.append(button);
        }
        grid.append(card);
      }
      if (!quests.length) grid.append(element("p", t("No quests here yet.")));
      section.append(grid);
      board.append(section);
    }
    const previous = new Map(Array.from(byId("quest-board").querySelectorAll("details[data-quest-section]")).map(node => [node.dataset.questSection, node.open]));
    for (const node of board.querySelectorAll("details[data-quest-section]")) if (previous.has(node.dataset.questSection)) node.open = previous.get(node.dataset.questSection);
    byId("quest-board").replaceChildren(board);
    setText("control-active-count", "{count} ACTIVE", { count: state.quests.filter(q => q.status === "ACTIVE" && !q.hidden).length });
  }
  let journalState = null;
  let journalSignature = "";
  let filtersBound = false;
  function questCard(quest, state) {
    const card = element("article", undefined, "l38-card"); card.dataset.status = quest.status;
    const top = element("div", undefined, "l38-card-top");
    top.append(element("span", t("QUEST {number}", { number: String(quest.number).padStart(2, "0") }), "l38-quest-number"), element("span", t(quest.status), "l38-status"));
    card.append(top, element("h3", questText(quest, "title")), element("p", questText(quest, "description")), element("p", `◇ ${state.games.find((g) => g.id === quest.gameId)?.title || t("Adventure")}`, "l38-meta"));
    return card;
  }
  function filterJournal() {
    const state = journalState;
    if (!state) return;
    const game = byId("quest-game").value; const status = byId("quest-status").value;
    const search = byId("quest-search").value.trim().toLocaleLowerCase();
    const quests = state.quests.filter((quest) => !quest.hidden && (game === "all" || quest.gameId === (game === "current" ? state.event.currentGameId : game)) &&
      (status === "all" || quest.status === status) && `${questText(quest, "title")} ${questText(quest, "description")}`.toLocaleLowerCase().includes(search));
    const grid = element("div", undefined, "l38-grid");
    for (const quest of quests) grid.append(questCard(quest, state));
    if (!quests.length) grid.append(element("p", status === "SECRET" ? t("Hidden quests have no public details yet.") : t("No quests on this path. Try another filter."), "l38-empty"));
    byId("quest-board").replaceChildren(grid);
    setText("quest-filter-status", quests.length === 1 ? "{count} matching quest" : "{count} matching quests", { count: quests.length });
    const secret = byId("secret-placeholder");
    secret.hidden = state.secretCount === 0 || (status !== "all" && status !== "SECRET");
    secret.querySelector("strong").textContent = t("{count} HIDDEN", { count: state.secretCount });
  }
  function renderSegments(state) {
    const segments = byId("progress-segments");
    if (!segments) return;
    if (segments.children.length !== state.event.target) segments.replaceChildren(...Array.from({ length: state.event.target }, () => element("span")));
    Array.from(segments.children).forEach((segment, i) => segment.classList.toggle("is-complete", i < state.event.completed));
    segments.style.setProperty("--segments", state.event.target);
  }
  function renderJournal(state) {
    setText("journey-label", state.event.completed >= state.event.target ? "TARGET REACHED" : "ADVENTURE IN PROGRESS");
    setText("progress-remaining", "{count} TO GO ✦", { count: Math.max(0, state.event.target - state.event.completed) });
    journalState = state;
    const signature = JSON.stringify([language(), state.quests, state.games, state.event.currentGameId, state.secretCount]);
    if (signature === journalSignature) return;
    journalSignature = signature;
    const active = state.quests.filter((quest) => !quest.hidden && quest.status === "ACTIVE");
    setText("active-count", "{count} ACTIVE", { count: active.length });
    byId("active-board").replaceChildren(...(active.length ? active.map((quest) => questCard(quest, state)) : [element("p", t("A moment at the campfire. Leo's next objective will appear here."), "l38-empty")]));
    const game = byId("quest-game"); const selected = game.value;
    const options = [["all", t("All games")], ["current", t("Current game")], ...state.games.map((g) => [g.id, g.title])];
    game.replaceChildren(...options.map(([value, title]) => { const option = element("option", title); option.value = value; return option; }));
    game.value = options.some(([id]) => id === selected) ? selected : "all";
    setText("journal-count", "{count} KNOWN QUESTS", { count: state.quests.length });
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
    if (byId("vote-nav")) { const open = state.polls.some((poll) => poll.status === "OPEN"); byId("vote-nav").textContent = open ? t("Vote now ·") : t("Vote"); byId("vote-nav").classList.toggle("is-open", open); }
    const root = byId("poll-board");
    const signature = language() + JSON.stringify(state.polls.map((poll) => ({ id: poll.id, title: poll.title, type: poll.type, status: poll.status,
      options: poll.options.map((option) => ({ id: option.id, label: optionLabel(poll, option) })), winner: poll.effectiveWinnerId, override: poll.overrideOptionId })));
    if (signature !== pollSignature) {
      const savedInputs = new Map(Array.from(root.querySelectorAll("[data-poll-id]")).map(card => [card.dataset.pollId, { value: card.querySelector("select")?.value, reason: card.querySelector("input")?.value }]));
      const historyOpen = root.querySelector(".l38-poll-history")?.open;
      pollSignature = signature;
      const board = document.createDocumentFragment();
      const latest = state.polls.find((poll) => poll.status === "OPEN") || state.polls[0];
      const old = state.polls.filter((poll) => handlers.control ? poll.status === "CLOSED" && poll.effectiveWinnerId : poll.id !== latest?.id);
      const history = old.length ? element("details", undefined, "l38-poll-history") : null;
      if (history) { history.open = historyOpen || false; history.append(element("summary", t("Earlier voting rounds ({count})", { count: old.length }))); }
      for (const poll of state.polls) {
        const card = element("section", undefined, "l38-panel l38-poll");
        card.dataset.pollId = poll.id;
        card.dataset.status = poll.status;
        const roundLabel = handlers.control ? t("Poll #{number} · {type} · {status}", { number: poll.number, type: t(poll.type), status: t(poll.status) }) : t("ROUND {number} · {status}", { number: String(poll.number).padStart(2, "0"), status: t(poll.status) });
        card.append(element("p", roundLabel, "l38-meta"), element("h3", poll.title));
        const total = element("p", ""); total.dataset.total = "true"; card.append(total);
        for (const option of poll.options) {
          const row = element("div", undefined, "l38-option");
          row.dataset.choiceId = option.id;
          const tally = element("span", ""); tally.dataset.optionId = option.id; row.append(tally);
          if (!handlers.control) { const percent = element("span", "", "l38-percent"); percent.dataset.percent = option.id; row.append(percent); }
          if (!handlers.control && poll.status === "OPEN") {
            const vote = element("button", t("Vote")); vote.type = "button"; vote.dataset.voteId = option.id;
            vote.setAttribute("aria-label", t("Vote for {label}", { label: optionLabel(poll, option) }));
            vote.addEventListener("click", () => handlers.vote(poll.id, option.id)); row.append(vote);
          }
          card.append(row);
        }
        if (poll.effectiveWinnerId) {
          card.append(element("p", t("Winner: {label}{override}", { label: optionLabel(poll, poll.options.find(option => option.id === poll.effectiveWinnerId)), override: poll.overrideOptionId ? t(" (moderator override)") : "" }), "l38-result"));
        }
        if (handlers.control) {
          const actions = element("div", undefined, "l38-actions");
          function actionButton(label, handler) { const button = element("button", label); button.type = "button"; button.addEventListener("click", handler); actions.append(button); return button; }
          if (poll.status === "DRAFT") {
            actionButton(t("Edit draft"), () => handlers.edit(latestPolls.find((item) => item.id === poll.id)));
            actionButton(t("Open poll"), () => handlers.status(poll.id, "open"));
          }
          if (poll.status === "OPEN") actionButton(t("Close poll"), () => handlers.status(poll.id, "close"));
          actionButton(t("New round from this poll"), () => handlers.clone(latestPolls.find((item) => item.id === poll.id)));
          card.append(actions);
          if (poll.status === "CLOSED") {
            const select = element("select"); select.setAttribute("aria-label", t("Winner for poll #{number}", { number: poll.number }));
            for (const option of poll.options) { const item = element("option", optionLabel(poll, option)); item.value = option.id; select.append(item); }
            select.value = poll.effectiveWinnerId || poll.leadingOptionIds[0] || poll.options[0]?.id || "";
            const reason = element("input"); reason.placeholder = t("Reason for override"); reason.maxLength = 240;
            reason.setAttribute("aria-label", t("Override reason for poll #{number}", { number: poll.number }));
            const saved = savedInputs.get(poll.id);
            if (saved?.value && poll.options.some(option => option.id === saved.value)) select.value = saved.value;
            reason.value = saved?.reason || "";
            const accept = element("button", t("Accept selected leader")); accept.type = "button"; accept.dataset.accept = "true";
            const override = element("button", t("Override winner"), "l38-danger"); override.type = "button";
            accept.addEventListener("click", () => handlers.winner(poll.id, select.value, null));
            override.addEventListener("click", () => handlers.winner(poll.id, select.value, reason.value));
            select.addEventListener("change", () => updatePollCounts(myVotes, busy));
            card.append(select, accept, reason, override);
          }
        }
        if (history && old.some(item => item.id === poll.id)) history.append(card); else board.append(card);
      }
      if (history) board.append(history);
      if (!state.polls.length) { const empty = element("div", undefined, "l38-panel l38-empty"); empty.append(element("span", "?", "l38-empty-icon"), element("h3", handlers.control ? t("No polls yet. Create a draft below.") : t("The next choice is just ahead.")), element("p", t("When a vote opens, choose Leo's next move right here."))); board.append(empty); }
      root.replaceChildren(board);
    }
    updatePollCounts(myVotes, busy);
  }
  function updatePollCounts(myVotes, busy) {
    for (const poll of latestPolls) {
      const card = byId("poll-board").querySelector(`[data-poll-id="${poll.id}"]`);
      if (!card) continue;
      card.querySelector("[data-total]").textContent = t(poll.totalVotes === 1 ? "{count} vote" : "{count} votes", { count: poll.totalVotes });
      for (const option of poll.options) {
        const tally = card.querySelector(`[data-option-id="${option.id}"]`);
        const text = `${optionLabel(poll, option)} — ${option.votes}`;
        if (tally.textContent !== text) tally.textContent = text;
        const percent = card.querySelector(`[data-percent="${option.id}"]`);
        const row = card.querySelector(`[data-choice-id="${option.id}"]`);
        const selected = myVotes.some((entry) => entry.pollId === poll.id && entry.optionId === option.id);
        if (percent) { const amount = poll.totalVotes ? Math.round(option.votes / poll.totalVotes * 100) : 0; percent.textContent = `${amount}%`; row.style.setProperty("--vote-percent", `${amount}%`); }
        row.classList.toggle("is-selected", selected); row.classList.toggle("is-winner", poll.effectiveWinnerId === option.id);
        const vote = card.querySelector(`[data-vote-id="${option.id}"]`);
        if (vote) {
          vote.textContent = selected ? t("Your vote") : t("Vote");
          vote.setAttribute("aria-pressed", String(selected)); vote.disabled = busy;
        }
      }
      const accept = card.querySelector("[data-accept]");
      if (accept) accept.disabled = !!poll.effectiveWinnerId || !poll.leadingOptionIds.includes(card.querySelector("select").value);
    }
  }
  function connect(onState, onReconnect) {
    if (typeof window.io !== "function") {
      setText("connection", "Live connection unavailable. Checking for updates periodically.");
      return null;
    }
    const socket = window.io("/level38", { path: "/level38/socket.io" });
    socket.on("level38:state", (state) => {
      setText("connection", "Live updates connected");
      onState(state);
    });
    socket.on("connect", () => { if (onReconnect) onReconnect(); });
    socket.on("disconnect", () => setText("connection", "Connection lost. Reconnecting…"));
    socket.on("connect_error", () => setText("connection", "Unable to connect. Retrying…"));
    socket.on("level38:unavailable", () => setText("connection", "Event temporarily unavailable. Retrying…"));
    return socket;
  }
  let messageTimer;
  function auditDescription(entry, state) {
    if (!entry) return t("No action yet.");
    const ownerActions = {"owner:progress":"reset event progress", "owner:participants":"cleared test participants", "owner:prepare":"prepared a clean event", "owner:preview":"previewed the finale for connected clients"};
    if (ownerActions[entry.action]) return t(ownerActions[entry.action]);
    const before = entry.before || {}, after = entry.after || {}, metadata = entry.metadata || {};
    const verbs = { "quest:activated": "activated", "quest:completed": "completed", "quest:failed": "failed", "quest:skipped": "skipped", "quest:revealed": "revealed", "quest:available": "made available" };
    const quest = state?.quests.find(item => item.id === entry.entityId);
    if (verbs[entry.action]) return t(`${verbs[entry.action]} quest #{number} “{title}”`, { number: after.number, title: quest ? questText(quest, "title") : after.title || t("Quest") });
    if (entry.action === "game:changed") return t("changed game from {before} to {after}", { before: before.gameTitle || t("Between adventures"), after: after.gameTitle || t("Between adventures") });
    if (entry.action === "game:configured") return t("configured game “{title}”", { title: after.title });
    if (entry.action === "game:mapped") return t("mapped Twitch category for “{title}”", { title: after.title });
    if (entry.action === "game:source") return t("returned game source to Twitch Auto");
    if (entry.action === "action:undone") return t("undid {action} (#{entity})", { action: t(String(metadata.originalAction).replace(":", " ")), entity: after.number ?? after.title ?? after.gameTitle ?? "—" });
    if (entry.action === "poll:winner") {
      const poll = state?.polls.find(item => item.id === entry.entityId);
      const label = value => {
        const option = poll?.options.find(item => item.label === value);
        return option ? optionLabel(poll, option) : value || t("Unselected");
      };
      return t(metadata.override ? "overrode poll #{number} winner from {before} to {after}" : "accepted poll #{number} winner from {before} to {after}", { number: after.number, before: label(before.winnerLabel), after: label(after.winnerLabel) });
    }
    if (["poll:created", "poll:edited", "poll:opened", "poll:closed"].includes(entry.action)) return t(`${entry.action.slice(5)} poll #{number} “{title}”`, { number: after.number, title: after.title });
    return entry.description || t("Legacy activity");
  }
  function message(text) {
    clearTimeout(messageTimer); setText("message", text);
    if (document.body.classList.contains("l38-public") && text) messageTimer = setTimeout(() => setText("message", ""), 6500);
  }
  window.Level38 = { byId, element, request, renderState, renderPolls, renderSprite, connect, message, t, setText, questText, optionLabel, language, auditDescription };
})();
