(function () {
  "use strict";
  const { byId } = window.Level38;
  if (!byId("level-up")) return;
  const t = (key, params = {}) => window.Level38I18n?.t(key, params) ?? key.replace(/\{(\w+)\}/g, (match, name) => params[name] === undefined ? match : String(params[name]));
  let currentNotice = null, currentCelebration = null;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const overlay = byId("level-up");
  const ackKey = "level38:acknowledged-unlock";
  const pendingKey = "level38:pending-unlock";
  let genuineActive = false, pending = null, restoreFocus = null;
  let inertElements = [];
  const read = key => { try { return sessionStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch {} };
  let acknowledged = Number(read(ackKey) || read("level38:last-unlock")) || 0;
  try { pending = JSON.parse(read(pendingKey)); } catch {}
  if (!pending?.event || !Number.isInteger(pending.event.sequence) || pending.event.sequence <= acknowledged) pending = null;
  const previews = new Set();
  let ready = false;
  let baselineRevision = -1;
  let sequence = 0;
  let previous = null;
  let lastNotice = -1;
  let toastTimer, noticeTimer, progressTimer, startTimer;
  let stopFireworks = () => {};
  let serverOffset = 0;
  const messages = {
    "quest:completed": "QUEST COMPLETE · Another step toward LV.38!",
    "quest:activated": "NEW QUEST · A new objective awaits.",
    "quest:revealed": "SECRET REVEALED · A new path is open.",
    "poll:opened": "THE PARTY DECIDES · A new vote is open.",
    "poll:winner": "PARTY CHOICE · The result is in!",
    "game:changed": "NEW ADVENTURE · Leo changed games.",
  };
  function observe(state) {
    // Calibrate from the adjacent server snapshot, so device clock skew does not skip the finale.
    if (Number.isFinite(state.serverTime)) serverOffset = state.serverTime - Date.now();
    if (!ready) {
      baselineRevision = state.event.revision; sequence = Math.max(acknowledged, state.event.unlockSequence || 0); ready = true;
      if (pending && (pending.event.sequence !== state.event.unlockSequence || pending.resetSequence !== (state.event.resetSequence || 0))) {
        pending = null; write(pendingKey, null); closeCelebration();
      }
      if (pending && !currentCelebration) showCelebration(pending.event, false, true);
    }
    if (previous && state.event.revision <= previous.revision) return;
    if (previous && (state.event.resetSequence || 0) > (previous.resetSequence || 0)) { pending = null; write(pendingKey, null); closeCelebration(); baselineRevision = state.event.revision; }
    if (previous && state.event.completed > previous.completed && !reduced?.matches) {
      byId("progress-segments").classList.add("is-progressing");
      clearTimeout(progressTimer); progressTimer = setTimeout(() => byId("progress-segments").classList.remove("is-progressing"), 750);
    }
    previous = state.event;
  }
  function stopAnimation() { stopFireworks(); stopFireworks = () => {}; }
  function closeCelebration() {
    clearTimeout(startTimer); stopAnimation();
    overlay.hidden = true; genuineActive = false; currentCelebration = null;
    document.body.classList.remove("l38-finale-open");
    for (const [element, wasInert] of inertElements) element.inert = wasInert;
    inertElements = [];
    if (restoreFocus?.isConnected) restoreFocus.focus({preventScroll:true});
    restoreFocus = null;
  }
  function dismiss() {
    if (overlay.hidden) return;
    if (currentCelebration && !currentCelebration.preview) {
      acknowledged = Math.max(acknowledged, currentCelebration.event.sequence);
      write(ackKey, String(acknowledged)); pending = null; write(pendingKey, null);
    }
    closeCelebration();
  }
  function celebrate(event) {
    // A new arrival must follow this socket's baseline. Only a locally pending
    // genuine event can resume from a snapshot after refresh; new visitors see no history.
    if (!ready || !event || event.version !== 1 || !Number.isInteger(event.sequence) || event.sequence <= sequence ||
        event.revision <= baselineRevision || event.id !== `level38:unlock:${event.sequence}`) return;
    sequence = event.sequence;
    if (!Number.isFinite(event.startsAt) || Date.now() + serverOffset - event.startsAt > 8000) return;
    pending = {event, resetSequence: previous?.resetSequence || 0};
    write(pendingKey, JSON.stringify(pending));
    showCelebration(event, false);
  }
  function preview(event) {
    if (!ready || genuineActive || !event || event.version !== 1 || typeof event.id !== "string" || previews.has(event.id) || document.hidden ||
        !Number.isFinite(event.startsAt) || Math.abs(Date.now() + serverOffset - event.startsAt) > 8000) return;
    previews.add(event.id); if (previews.size > 32) previews.delete(previews.values().next().value);
    showCelebration(event, true);
  }
  function renderCelebration() {
    if (!currentCelebration) return;
    const {event, preview} = currentCelebration;
    const label = byId("celebration-preview-label"); if (label) label.hidden = !preview;
    byId("celebration-progress").textContent = preview ? t("Visual preview — event progress is unchanged.") : t("{completed} / {target} QUESTS COMPLETED", event);
  }
  function startAnimation() {
    stopAnimation();
    if (!overlay.hidden && !document.hidden && !reduced?.matches) stopFireworks = window.Level38Fireworks?.start(byId("fireworks")) || (() => {});
  }
  function showCelebration(event, preview, resume = false) {
    closeCelebration(); genuineActive = !preview; currentCelebration = {event, preview};
    clearTimeout(noticeTimer); clearTimeout(toastTimer); byId("event-toast").hidden = true;
    const delay = resume ? 0 : Math.max(0, Math.min(1000, event.startsAt - Date.now() - serverOffset));
    startTimer = setTimeout(() => {
      if (document.hidden) return;
      renderCelebration(); overlay.hidden = false;
      restoreFocus = document.activeElement;
      for (const element of document.body.children) {
        if (element !== overlay && !element.contains(overlay) && element.tagName !== "SCRIPT") {
          inertElements.push([element, element.inert]); element.inert = true;
        }
      }
      document.body.classList.add("l38-finale-open");
      byId("celebration-dismiss").focus({preventScroll:true});
      startAnimation();
      // No finish timer: preview and genuine finales both need local dismissal.
    }, delay);
  }
  function notify(type, event) {
    if (!ready || event.revision <= baselineRevision || event.revision <= lastNotice || document.hidden) return;
    lastNotice = event.revision;
    // A burst of operator actions becomes one short notification, never an unbounded queue.
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      if (!byId("level-up").hidden) return;
      currentNotice = type; byId("event-toast").textContent = t(messages[type]); byId("event-toast").hidden = false;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { byId("event-toast").hidden = true; }, 2600);
    }, 180);
  }
  document.addEventListener("level38:language", () => {
    if (currentNotice) byId("event-toast").textContent = t(messages[currentNotice]);
    renderCelebration();
  });
  function attach(socket, { notices = true } = {}) {
    if (!socket) return;
    socket.on("connect", () => { ready = false; previous = null; });
    socket.on("disconnect", () => { ready = false; previous = null; });
    socket.on("level38:unlocked", celebrate);
    socket.on("level38:celebration-preview", preview);
    if (notices) for (const type of Object.keys(messages)) socket.on(type, (event) => notify(type, event));
  }
  overlay.addEventListener("click", dismiss);
  document.addEventListener("keydown", event => {
    if (overlay.hidden) return;
    if (["Escape", "Enter", " "].includes(event.key)) { event.preventDefault(); event.stopPropagation(); dismiss(); }
    else if (event.key === "Tab") { event.preventDefault(); byId("celebration-dismiss").focus(); }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(startTimer); stopAnimation(); byId("event-toast").hidden = true;
      if (currentCelebration?.preview) closeCelebration();
    } else if (currentCelebration) {
      if (overlay.hidden) showCelebration(currentCelebration.event, currentCelebration.preview, true);
      else startAnimation();
    }
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(toastTimer); clearTimeout(noticeTimer); clearTimeout(progressTimer); closeCelebration();
  });
  window.addEventListener("pageshow", event => { if (event.persisted && pending && ready) showCelebration(pending.event, false, true); });
  reduced?.addEventListener?.("change", startAnimation);
  window.Level38Experience = { observe, attach };
})();
