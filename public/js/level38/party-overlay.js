/* Movement adapter only. Identity, frame selection, scale, mirroring and fallbacks live in sprites.js. */
(function () {
  "use strict";
  const stage = document.getElementById("party-stage"), overflow = document.getElementById("party-overflow");
  const sprites = window.Level38Sprites, avatars = new Map(), members = new Map();
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const finale = window.Level38PartyFireworks.create(document.getElementById("party-fireworks"), document.getElementById("party-celebration"));
  const unlockKey = "level38:party:last-unlock";
  let unlockSequence = 0;
  try { const saved = Number(sessionStorage.getItem(unlockKey)); if (Number.isSafeInteger(saved) && saved > 0) unlockSequence = saved; } catch {}
  let manifest, socket, raf = 0, previous = 0, width = innerWidth, height = innerHeight, running = false, destroyed = false, ready = false;
  let config = { enabled: true, nameMode: "ALWAYS", maxVisible: 30 }, lastLanes = 1, crowdGap = 132;
  const preview = Number(document.body.dataset.preview);
  function hash(text) { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return value >>> 0; }
  function random(a) { a.seed ^= a.seed << 13; a.seed ^= a.seed >>> 17; a.seed ^= a.seed << 5; return (a.seed >>> 0) / 4294967296; }
  function create(member) {
    const node = document.createElement("div"), art = document.createElement("div"), label = document.createElement("span");
    node.className = "party-avatar"; node.dataset.presenceId = member.presenceId; art.className = "party-art"; label.className = "party-name";
    node.append(art, label); stage.append(node);
    const job = sprites.resolve(manifest, member.classId, member.variantId), now = performance.now();
    const seed = hash(member.presenceId) || 1;
    return { member, node, art, label, job, renderer: sprites.render(art, job, { externalClock: true }), seed,
      x: 0, lane: 0, direction: seed % 2 ? -1 : 1, speed: 18 + seed % 15, phase: seed % 400,
      moving: true, pauseUntil: 0, changeAt: now + 2500 + seed % 5500, nameUntil: now + 5000,
      celebrationAt: now, celebrationUntil: now + 1500, hopAt: -Infinity, placed: false };
  }
  function remove(id) { const a = avatars.get(id); a.renderer?.dispose(); a.node.remove(); avatars.delete(id); }
  function reconcile() {
    if (!manifest || destroyed) return;
    const selected = config.enabled ? [...members.values()].slice(0, config.maxVisible) : [];
    const ids = new Set(selected.map(m => m.presenceId));
    for (const id of avatars.keys()) if (!ids.has(id)) remove(id);
    for (const member of selected) {
      let a = avatars.get(member.presenceId);
      if (!a) { a = create(member); avatars.set(member.presenceId, a); }
      a.member = member; a.label.textContent = member.nickname; a.label.title = member.nickname;
      // Server identities normally change only nickname; resolve safely if appearance metadata changes.
      if (!a.renderer || a.job.classId !== member.classId || a.job.variantId !== member.variantId) {
        a.job = sprites.resolve(manifest, member.classId, member.variantId); a.renderer = sprites.render(a.art, a.job, { externalClock: true });
      }
    }
    layout();
    const extra = config.enabled ? Math.max(0, members.size - selected.length) : 0;
    overflow.hidden = !extra; overflow.textContent = `+${extra} PARTY MEMBERS`;
    if (!config.enabled) finale.stop();
    if (running && (avatars.size || finale.active) && !raf) raf = requestAnimationFrame(frame);
    if (!avatars.size && !finale.active) { cancelAnimationFrame(raf); raf = 0; previous = 0; }
  }
  function layout() {
    const list = [...avatars.values()], lanes = list.length > 15 ? 2 : 1;
    const columns = Math.ceil(list.length / lanes), spacing = (width - 144) / Math.max(1, columns);
    crowdGap = Math.min(132, spacing);
    const lanesChanged = lanes !== lastLanes; lastLanes = lanes;
    list.forEach((a, i) => {
      a.lane = i % lanes;
      if (lanesChanged) a.x = 72 + (Math.floor(i / lanes) + .5) * spacing;
      a.label.style.maxWidth = `${Math.max(30, crowdGap - 8)}px`;
      const standingHeight = a.job.sprite?.visibleStandingHeight || manifest.canvas[1];
      a.label.style.bottom = `${standingHeight * (a.job.sprite?.renderScale || manifest.renderScale) + 7}px`;
    });
    for (const a of list) {
      if (!a.placed && !lanesChanged) {
        // Insert into the widest available gap, rather than appending every arrival near the right edge.
        const occupied = [72, ...list.filter(other => other !== a && other.placed && other.lane === a.lane).map(other => other.x).sort((x,y) => x-y), width - 72];
        let widest = -1;
        for (let i = 1; i < occupied.length; i++) if (occupied[i] - occupied[i-1] > widest) {
          widest = occupied[i] - occupied[i-1]; a.x = (occupied[i] + occupied[i-1]) / 2;
        }
      }
      a.placed = true;
      a.x = Math.max(72, Math.min(width - 72, a.x));
    }
    // Resolve coincident positions after cap/lane changes with deterministic minimum spacing.
    for (let lane = 0; lane < lanes; lane++) {
      const row = list.filter(a => a.lane === lane).sort((a, b) => a.x - b.x);
      const gap = Math.min(crowdGap, (width - 144) / Math.max(1, row.length - 1));
      row.forEach((a, i) => { if (i) a.x = Math.max(a.x, row[i - 1].x + gap); });
      for (let i = row.length - 1; i >= 0; i--) row[i].x = Math.min(row[i].x, width - 72 - (row.length - 1 - i) * gap);
    }
  }
  function reaction(action, presenceId) {
    const now = performance.now();
    for (const a of avatars.values()) if (!presenceId || a.member.presenceId === presenceId) {
      a.nameUntil = now + 5000;
      if (action === "vote") a.hopAt = now;
      else { a.celebrationAt = now; a.celebrationUntil = now + 1500; }
    }
  }
  function celebrate() {
    if (!running || !config.enabled) return;
    reaction("finale"); finale.start(performance.now(), motion.matches);
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function unlock(event) {
    // Only the genuine server event enters here. Its durable sequence is the dedupe key;
    // snapshots never replay history, and local preview never writes this acknowledgement.
    if (!event || event.version !== 1 || !Number.isSafeInteger(event.sequence) || event.sequence <= unlockSequence || event.id !== `level38:unlock:${event.sequence}`) return;
    unlockSequence = event.sequence;
    try { sessionStorage.setItem(unlockKey, String(unlockSequence)); } catch {}
    celebrate();
  }
  function frame(now) {
    raf = 0;
    if (!running || destroyed) return;
    const dt = previous ? Math.min(.05, (now - previous) / 1000) : 0; previous = now;
    const list = [...avatars.values()];
    for (const a of list) {
      const celebrating = now < a.celebrationUntil;
      if (now >= a.changeAt) {
        a.moving = !a.moving; a.pauseUntil = a.moving ? 0 : now + 900 + random(a) * 2200;
        a.changeAt = a.moving ? now + 2500 + random(a) * 6000 : a.pauseUntil;
        if (a.moving && random(a) < .35) a.direction *= -1;
      }
      const walking = a.moving && !celebrating && !motion.matches;
      if (walking) {
        let next = a.x + a.direction * a.speed * dt;
        if (next < 72 || next > width - 72) { a.direction *= -1; next = Math.max(72, Math.min(width - 72, next)); }
        const blocked = list.some(other => other !== a && other.lane === a.lane && Math.abs(other.x - next) < crowdGap - 2 && (other.x - a.x) * a.direction > 0);
        if (blocked) { a.direction *= -1; a.moving = false; a.changeAt = now + 400 + random(a) * 900; }
        else a.x = next;
      }
      const action = motion.matches ? "idle" : celebrating ? "celebration" : walking ? "walk" : "idle";
      a.renderer.paint(action, celebrating ? now - a.celebrationAt : now + a.phase, a.direction > 0);
      const hopAge = now - a.hopAt, hop = !motion.matches && hopAge >= 0 && hopAge < 350 ? Math.sin(hopAge / 350 * Math.PI) * 12 : 0;
      const scale = a.job.sprite?.renderScale || manifest.renderScale, anchor = a.job.sprite?.anchor || manifest.anchor;
      const baseline = height - 32 - a.lane * 86;
      a.node.style.transform = `translate(${Math.round(a.x - anchor[0] * scale)}px, ${Math.round(baseline - anchor[1] * scale - hop)}px)`;
      a.node.dataset.action = action; a.node.dataset.direction = String(a.direction); a.node.dataset.lane = String(a.lane);
      a.label.hidden = config.nameMode === "OFF";
      a.label.classList.toggle("is-faded", config.nameMode === "ENTRY" && now >= a.nameUntil);
    }
    finale.paint(now, motion.matches);
    if (avatars.size || finale.active) raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); raf = 0; previous = 0; finale.stop(); }
  function start() { running = ready && !destroyed && !document.hidden; if (running && !raf && (avatars.size || finale.active)) raf = requestAnimationFrame(frame); }
  function resize() {
    const previousWidth = width; width = innerWidth; height = innerHeight;
    for (const a of avatars.values()) a.x = 72 + (a.x - 72) * (width - 144) / Math.max(1, previousWidth - 144);
    layout(); finale.resize();
  }
  function visibility() { if (document.hidden) stop(); else start(); }
  function destroy() {
    destroyed = true; stop(); for (const id of avatars.keys()) remove(id); members.clear();
    socket?.removeAllListeners(); socket?.disconnect();
    window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", visibility);
  }
  window.addEventListener("resize", resize); document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", destroy, { once: true });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
  fetch("/level38/classes/manifest.json").then(response => { if (!response.ok) throw new Error("Manifest unavailable"); return response.json(); }).then(data => {
    if (destroyed) return; manifest = data;
    if (preview) {
      const appearances = manifest.classes.flatMap(c => c.variants.map(v => ({ classId: c.classId, variantId: v.variantId })));
      for (let i = 0; i < preview; i++) members.set(`preview-${i}`, { presenceId: `preview-${i}`, nickname: `Adventurer ${i + 1}`, ...appearances[(i * 7) % appearances.length] });
      document.getElementById("preview-vote").addEventListener("click", () => reaction("vote", "preview-0"));
      document.getElementById("preview-victory").addEventListener("click", () => reaction("quest"));
      document.getElementById("preview-finale").addEventListener("click", celebrate);
      document.getElementById("preview-names").addEventListener("change", event => { config.nameMode = event.target.value; });
      ready = true; start(); reconcile(); return;
    }
    socket = window.io("/level38-party", { path: "/level38/socket.io", auth: { kind: "overlay" } });
    socket.on("party:snapshot", snapshot => { members.clear(); for (const m of snapshot.members) members.set(m.presenceId, m); config = snapshot.config; ready = true; start(); reconcile(); });
    socket.on("party:joined", member => { members.set(member.presenceId, member); reconcile(); });
    socket.on("party:updated", member => { members.set(member.presenceId, member); reconcile(); });
    socket.on("party:left", member => { members.delete(member.presenceId); reconcile(); });
    socket.on("party:config", next => { config = next; reconcile(); });
    socket.on("party:action", event => reaction(event.action, event.presenceId));
    socket.on("level38:unlocked", unlock);
    socket.on("disconnect", () => {
      ready = false; stop(); stage.hidden = true; overflow.hidden = true;
      // A frame/placeholder request can fail while offline. Recreate image resources
      // on the next snapshot while retaining avatar positions and entry clocks.
      for (const a of avatars.values()) { a.renderer.dispose(); a.renderer = null; }
    });
    socket.on("party:snapshot", () => { stage.hidden = false; });
  }).catch(() => { stop(); }); // Remain transparent on outage; never paint an error page over gameplay.
})();
