(function () {
  "use strict";
  const { byId } = window.Level38;
  if (!byId("level-up")) return;
  const t = (key, params = {}) => window.Level38I18n?.t(key, params) ?? key.replace(/\{(\w+)\}/g, (match, name) => params[name] === undefined ? match : String(params[name]));
  let currentNotice = null, currentCelebration = null;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let genuineActive = false;
  const previews = new Set();
  let ready = false;
  let baselineRevision = -1;
  let sequence = 0;
  let previous = null;
  let lastNotice = -1;
  let toastTimer, noticeTimer, progressTimer, finishTimer, startTimer;
  let stopFireworks = () => {};
  let seen = 0;
  let serverOffset = 0;
  try { seen = Number(sessionStorage.getItem("level38:last-unlock")) || 0; } catch {}
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
    if (!ready) { baselineRevision = state.event.revision; sequence = Math.max(seen, state.event.unlockSequence || 0); ready = true; }
    if (previous && state.event.revision <= previous.revision) return;
    if (previous && (state.event.resetSequence || 0) > (previous.resetSequence || 0)) { dismiss(); baselineRevision = state.event.revision; }
    if (previous && state.event.completed > previous.completed && !reduced?.matches) {
      byId("progress-segments").classList.add("is-progressing");
      clearTimeout(progressTimer); progressTimer = setTimeout(() => byId("progress-segments").classList.remove("is-progressing"), 750);
    }
    previous = state.event;
  }
  function dismiss() {
    clearTimeout(startTimer); clearTimeout(finishTimer); stopFireworks();
    byId("level-up").hidden = true; genuineActive = false;
  }
  function celebrate(event) {
    // The baseline comes only from a connected socket's initial state. Snapshots never replay effects.
    if (!ready || !event || event.version !== 1 || !Number.isInteger(event.sequence) || event.sequence <= sequence ||
        event.revision <= baselineRevision || event.id !== `level38:unlock:${event.sequence}`) return;
    sequence = event.sequence; seen = Math.max(seen, sequence);
    try { sessionStorage.setItem("level38:last-unlock", String(seen)); } catch {}
    // Hidden tabs recover state without bringing a stale fireworks show back to the foreground.
    if (document.hidden || !Number.isFinite(event.startsAt) || Date.now() + serverOffset - event.startsAt > 8000) return;
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
  function showCelebration(event, preview) {
    dismiss(); genuineActive = !preview; clearTimeout(noticeTimer); clearTimeout(toastTimer); byId("event-toast").hidden = true;
    const delay = Math.max(0, Math.min(1000, event.startsAt - Date.now() - serverOffset));
    startTimer = setTimeout(() => {
      if (document.hidden) return;
      currentCelebration = {event, preview};
      renderCelebration();
      byId("level-up").hidden = false;
      if (!reduced?.matches) stopFireworks = fireworks(byId("fireworks"));
      finishTimer = setTimeout(dismiss, Math.min(8000, Math.max(5000, event.durationMs || 6500)));
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
  function fireworks(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => {};
    const width = Math.min(800, Math.ceil(window.innerWidth / 2)); const height = Math.ceil(window.innerHeight / 2);
    canvas.width = width; canvas.height = height; ctx.imageSmoothingEnabled = false;
    const colors = ["#eac779", "#91d9aa", "#97c9ea", "#dba1c0", "#faf0cc"];
    const count = window.innerWidth < 600 ? 18 : 28;
    const rockets = Array.from({ length: 7 }, (_, i) => ({ launch: 300 + i * 740, x: width * (.12 + (i * .31) % .76), y: height * (.12 + (i * .13) % .38), burst: false }));
    let particles = []; let frame; let start; let last = -34; let stopped = false;
    function draw(time) {
      if (stopped) return;
      start ??= time;
      const elapsed = time - start;
      if (elapsed - last >= 33) {
        last = elapsed; ctx.clearRect(0, 0, width, height);
        for (const [index, rocket] of rockets.entries()) {
          const age = elapsed - rocket.launch;
          if (age >= 0 && age < 500) { ctx.fillStyle = colors[index % colors.length]; ctx.fillRect(Math.round(rocket.x), Math.round(height - (height - rocket.y) * age / 500), 2, 5); }
          if (age >= 500 && !rocket.burst) {
            rocket.burst = true;
            for (let i = 0; i < count; i++) { const angle = i / count * Math.PI * 2; const speed = 22 + (i % 5) * 7;
              particles.push({ x: rocket.x, y: rocket.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, birth: elapsed, color: colors[index % colors.length] }); }
          }
        }
        particles = particles.filter((p) => elapsed - p.birth < 1550).slice(-100);
        for (const p of particles) { const age = (elapsed - p.birth) / 1000; ctx.globalAlpha = Math.max(0, 1 - age / 1.55); ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x + p.vx * age), Math.round(p.y + p.vy * age + 20 * age * age), 2, 2); }
        ctx.globalAlpha = 1;
      }
      if (elapsed < 6500) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => { stopped = true; cancelAnimationFrame(frame); ctx.clearRect(0, 0, width, height); };
  }
  byId("celebration-dismiss").addEventListener("click", dismiss);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !byId("level-up").hidden) dismiss(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { dismiss(); byId("event-toast").hidden = true; } });
  reduced?.addEventListener?.("change", () => { if (reduced.matches) stopFireworks(); });
  window.Level38Experience = { observe, attach };
})();
