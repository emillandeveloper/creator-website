(function () {
  "use strict";
  const { byId, request, renderState, renderPolls, renderSprite, connect, message } = window.Level38;
  const effects = window.Level38Experience;
  let state = null;
  let viewer = null;
  let myVotes = [];
  let voting = false;
  let voteGeneration = 0;
  let pendingVote = null;
  let identityGeneration = 0;
  let returnFocus = null;
  let welcomeTimer;
  let sessionPromise = null;
  const handlers = { vote: castVote };
  function receive(next) {
    if (state && next.event.revision <= state.event.revision) return;
    if (!state || next.event.controlRevision !== state.event.controlRevision) renderState(next);
    state = next;
    renderPolls(state, handlers, myVotes, voting);
  }
  async function refresh() {
    try { receive(await request("state")); }
    catch { byId("connection").textContent = "Updates unavailable. Retrying…"; }
  }
  function showViewer(next) {
    viewer = next;
    byId("viewer-status").textContent = viewer.nickname ? `Welcome back, ${viewer.nickname}. Your party is waiting.` : "Watch the adventure, or pick a name and join the party.";
    byId("viewer-name").textContent = viewer.nickname || "Wandering adventurer";
    byId("viewer-class").textContent = viewer.class?.displayName || "Your story starts here";
    renderSprite(byId("viewer-sprite"), viewer.class);
    if (byId("join-form").hidden) byId("nickname").value = viewer.nickname || "";
    byId("join-open").textContent = viewer.nickname ? "Edit player name" : "JOIN THE PARTY +";
    byId("join-form").querySelector('[type="submit"]').textContent = viewer.nickname ? "Save player name" : "Join party";
    byId("join-open").disabled = false;
    if (viewer.classAssigned) {
      byId("viewer-status").textContent = `Welcome to the party, ${viewer.nickname}!`;
      byId("welcome-name").textContent = viewer.nickname; byId("welcome-class").textContent = viewer.class?.displayName || "Adventurer";
      renderSprite(byId("welcome-sprite"), viewer.class);
      byId("party-welcome").hidden = false;
      clearTimeout(welcomeTimer); welcomeTimer = setTimeout(() => { byId("party-welcome").hidden = true; }, 7000);
    }
  }
  function session() {
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const generation = voteGeneration;
      const identity = identityGeneration;
      const next = await request("session");
      if (identity === identityGeneration) showViewer(next);
      if (generation === voteGeneration && !voting) myVotes = next.votes || [];
      if (state) renderPolls(state, handlers, myVotes, voting);
    })().finally(() => { sessionPromise = null; });
    return sessionPromise;
  }
  function openJoin() { returnFocus = document.activeElement; byId("join-form").hidden = false; byId("join-form").scrollIntoView({ block: "center", behavior: "instant" }); byId("nickname").focus(); }
  function closeJoin() { byId("join-form").hidden = true; (returnFocus?.isConnected ? returnFocus : byId("join-open")).focus(); }
  async function castVote(pollId, optionId) {
    if (voting) return;
    if (!viewer?.nickname) {
      pendingVote = { pollId, optionId };
      try { if (!viewer) await session(); openJoin(); message("Choose a nickname to submit your vote."); }
      catch (error) { message(error.message); }
      return;
    }
    voting = true; voteGeneration++;
    if (state) renderPolls(state, handlers, myVotes, true);
    try {
      receive(await request(`polls/${encodeURIComponent(pollId)}/vote`, { optionId }));
      myVotes = [...myVotes.filter((vote) => vote.pollId !== pollId), { pollId, optionId }];
      message("Vote saved. You can change it while the poll is open.");
    } catch (error) { message(error.message); if (error.status === 401) viewer = null; }
    finally { voting = false; if (state) renderPolls(state, handlers, myVotes, false); }
  }
  const socket = connect((next) => { effects?.observe(next); receive(next); }, refresh);
  effects?.attach(socket);
  refresh();
  session().catch(() => { byId("join-open").disabled = false; message("Joining is temporarily unavailable. Try again when you vote."); });
  setInterval(() => { refresh(); if (!voting) session().catch(() => {}); }, 30000);
  byId("join-open").addEventListener("click", async () => {
    pendingVote = null;
    try { if (!viewer) await session(); openJoin(); } catch (error) { message(error.message); }
  });
  byId("join-cancel").addEventListener("click", () => { pendingVote = null; closeJoin(); });
  byId("welcome-dismiss").addEventListener("click", () => { byId("party-welcome").hidden = true; byId("join-open").focus(); });
  byId("join-form").addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); pendingVote = null; closeJoin(); } });
  byId("join-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true;
    identityGeneration++;
    try {
      const next = await request("join", { nickname: byId("nickname").value });
      closeJoin(); showViewer(next); message(next.classAssigned ? "You joined the party. Adventure awaits!" : "Player name saved. Your class is unchanged.");
      if (pendingVote) { const vote = pendingVote; pendingVote = null; await castVote(vote.pollId, vote.optionId); }
    } catch (error) { message(error.message); }
    finally { button.disabled = false; }
  });
})();
