(function () {
  "use strict";
  const t = (key, params = {}) => window.Level38I18n?.t(key, params) ?? key.replace(/\{(\w+)\}/g, (match, name) => params[name] === undefined ? match : String(params[name]));
  const { byId, request, renderState, renderPolls, renderSprite, connect, message, setText } = window.Level38;
  const effects = window.Level38Experience;
  let state = null;
  let viewer = null;
  let identityGeneration = 0;
  let returnFocus = null;
  let welcomeTimer;
  let sessionPromise = null;
  // Polls are displayed here; Twitch owns voting and voter identity.
  const handlers = {};
  function receive(next) {
    if (state && next.event.revision <= state.event.revision) return;
    if (!state || next.event.controlRevision !== state.event.controlRevision) renderState(next);
    state = next;
    renderPolls(state, handlers);
  }
  async function refresh() {
    try { receive(await request("state")); }
    catch { setText("connection", "Updates unavailable. Retrying…"); }
  }
  function showViewer(next) {
    viewer = next;
    window.Level38PartyViewer?.update(viewer);
    byId("stream-visibility").hidden = !viewer.nickname || !viewer.class;
    byId("stream-visible").checked = viewer.streamVisible !== false;
    byId("viewer-status").textContent = viewer.nickname ? t("Welcome back, {name}. Your party is waiting.", { name: viewer.nickname }) : t("Watch the adventure, or pick a name and join the party.");
    byId("viewer-name").textContent = viewer.nickname || t("Wandering adventurer");
    byId("viewer-class").textContent = viewer.class ? (window.Level38I18n?.className(viewer.class) || viewer.class.displayName) : t("Your story starts here");
    renderSprite(byId("viewer-sprite"), viewer.class);
    if (byId("join-form").hidden) byId("nickname").value = viewer.nickname || "";
    byId("join-open").textContent = viewer.nickname ? t("Edit player name") : t("JOIN THE PARTY +");
    byId("join-form").querySelector('[type="submit"]').textContent = viewer.nickname ? t("Save player name") : t("Join party");
    byId("join-open").disabled = false;
    if (viewer.classAssigned) {
      byId("viewer-status").textContent = t("Welcome to the party, {name}!", { name: viewer.nickname });
      byId("welcome-name").textContent = viewer.nickname; byId("welcome-class").textContent = window.Level38I18n?.className(viewer.class) || viewer.class?.displayName || t("Adventurer");
      renderSprite(byId("welcome-sprite"), viewer.class, { action: "celebration" });
      byId("party-welcome").hidden = false;
      clearTimeout(welcomeTimer); welcomeTimer = setTimeout(() => { byId("party-welcome").hidden = true; }, 7000);
    }
  }
  document.addEventListener("level38:language", () => {
    if (state) { renderState(state); renderPolls(state, handlers); }
    if (viewer) { showViewer({ ...viewer, classAssigned: false }); byId("welcome-class").textContent = window.Level38I18n?.className(viewer.class) || viewer.class?.displayName || t("Adventurer"); }
  });
  function session() {
    if (sessionPromise) return sessionPromise;
    sessionPromise = (async () => {
      const identity = identityGeneration;
      const next = await request("session");
      if (identity === identityGeneration) showViewer(next);
      if (state) renderPolls(state, handlers);
    })().finally(() => { sessionPromise = null; });
    return sessionPromise;
  }
  function openJoin() { returnFocus = document.activeElement; byId("join-form").hidden = false; byId("join-form").scrollIntoView({ block: "center", behavior: "instant" }); byId("nickname").focus(); }
  function closeJoin() { byId("join-form").hidden = true; (returnFocus?.isConnected ? returnFocus : byId("join-open")).focus(); }
  const socket = connect((next) => { effects?.observe(next); receive(next); }, refresh);
  effects?.attach(socket);
  refresh();
  session().catch(() => { byId("join-open").disabled = false; message("Joining is temporarily unavailable. Please try again."); });
  setInterval(() => { refresh(); session().catch(() => {}); }, 30000);
  byId("stream-visible").addEventListener("change", async event => {
    const input = event.target; input.disabled = true; identityGeneration++;
    try {
      const next = await request("stream-visibility", { streamVisible: input.checked });
      viewer = { ...viewer, ...next }; input.checked = next.streamVisible;
    } catch (error) { input.checked = viewer?.streamVisible !== false; message(error.message); }
    finally { input.disabled = false; }
  });
  byId("join-open").addEventListener("click", async () => {
    try { if (!viewer) await session(); openJoin(); } catch (error) { message(error.message); }
  });
  byId("join-cancel").addEventListener("click", closeJoin);
  byId("welcome-dismiss").addEventListener("click", () => { byId("party-welcome").hidden = true; byId("join-open").focus(); });
  byId("join-form").addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); closeJoin(); } });
  byId("join-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]'); button.disabled = true;
    identityGeneration++;
    try {
      const name = byId("nickname").value;
      let next;
      try { next = await request("join", {nickname:name}); }
      catch (error) {
        if (error.status !== 401) throw error;
        viewer = null; await session();
        next = await request("join", {nickname:name});
      }
      closeJoin(); showViewer(next); message(next.classAssigned ? "You joined the party. Adventure awaits!" : "Player name saved. Your class is unchanged.");
    } catch (error) { message(error.message); }
    finally { button.disabled = false; }
  });
})();
