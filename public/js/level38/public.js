(function () {
  "use strict";
  const { byId, request, renderState, renderPolls, connect, message } = window.Level38;
  let state = null;
  let viewer = null;
  let myVotes = [];
  let voting = false;
  let voteGeneration = 0;
  let pendingVote = null;
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
    byId("viewer-status").textContent = viewer.nickname ? `Welcome, ${viewer.nickname}.` : "Enjoy the event without signing in.";
    if (byId("join-form").hidden) byId("nickname").value = viewer.nickname || "";
    byId("join-open").textContent = viewer.nickname ? "Change nickname" : "Join with a nickname";
    byId("join-open").disabled = false;
  }
  async function session() {
    const generation = voteGeneration;
    const next = await request("session");
    showViewer(next);
    if (generation === voteGeneration && !voting) myVotes = next.votes || [];
    if (state) renderPolls(state, handlers, myVotes, voting);
  }
  function openJoin() { byId("join-form").hidden = false; byId("nickname").focus(); }
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
  connect(receive, refresh);
  refresh();
  session().catch(() => { byId("join-open").disabled = false; message("Joining is temporarily unavailable. Try again when you vote."); });
  setInterval(() => { refresh(); if (!voting) session().catch(() => {}); }, 30000);
  byId("join-open").addEventListener("click", async () => {
    pendingVote = null;
    try { if (!viewer) await session(); openJoin(); } catch (error) { message(error.message); }
  });
  byId("join-cancel").addEventListener("click", () => { pendingVote = null; byId("join-form").hidden = true; byId("join-open").focus(); });
  byId("join-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const next = await request("join", { nickname: byId("nickname").value });
      byId("join-form").hidden = true;
      showViewer(next); message("Nickname saved.");
      if (pendingVote) { const vote = pendingVote; pendingVote = null; await castVote(vote.pollId, vote.optionId); }
    } catch (error) { message(error.message); }
    finally { button.disabled = false; }
  });
})();
