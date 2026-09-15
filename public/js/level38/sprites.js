/* Shared website/future-overlay resolver and clock. No network or participant mutation. */
(function (scope) {
  "use strict";
  const placeholder = "/img/level38/placeholder.svg";
  const renders = new WeakMap();
  const safePath = path => typeof path === "string" && /^\/level38\/classes\/[a-z-]+\/[a-z]+\/(idle|walk|victory)\/\d{2}\.png$/.test(path);
  function resolve(manifest, classId, variantId) {
    const job = manifest.classes.find(entry => entry.classId === classId);
    const variant = job?.variants.find(entry => entry.variantId === variantId);
    const valid = variant && ["idle", "walk", "celebration"].every(action =>
      variant.animations[action]?.frames.length && variant.animations[action].frames.every(frame => safePath(frame.path)));
    return { id: classId, classId, variantId, displayNames: job?.displayNames || { en: "Adventurer", es: "Aventurero" },
      displayName: job?.displayNames.en || "Adventurer", assetVersion: manifest.version,
      sprite: valid ? { canvas: manifest.canvas, anchor: manifest.anchor, renderScale: manifest.renderScale,
        mirrorPolicy: variant.mirrorPolicy, visibleStandingHeight: variant.visibleStandingHeight, animations: variant.animations } : null };
  }
  function frameAt(sprite, action, elapsed) {
    if (!["idle", "walk", "celebration"].includes(action)) return { action: "idle", index: 0 };
    const animation = sprite?.animations[action];
    if (!animation || action === "idle") return { action: "idle", index: 0 };
    const step = Math.floor(Math.max(0, elapsed) / animation.frameDurationMs);
    if (!animation.loop && step >= animation.frames.length * animation.cycles) return { action: "idle", index: 0 };
    return { action, index: step % animation.frames.length };
  }
  function render(root, job, options = {}) {
    if (!root) return;
    const signature = JSON.stringify([job, options.action || "idle", !!options.externalClock]);
    if (renders.get(root)?.signature === signature) return renders.get(root).instance;
    dispose(root);
    root.replaceChildren();
    const state = { signature, timer: null, failed: false };
    renders.set(root, state);
    const frame = root.ownerDocument.createElement("span"); frame.className = "l38-sprite";
    const img = root.ownerDocument.createElement("img"); img.alt = ""; img.width = 32; img.height = 48;
    const canvas = job?.sprite?.canvas || [16, 24], scale = job?.sprite?.renderScale || 2;
    frame.style.width = img.style.width = `${canvas[0] * scale}px`;
    frame.style.height = img.style.height = `${canvas[1] * scale}px`;
    const fallback = root.ownerDocument.createElement("span"); fallback.className = "l38-sprite-fallback";
    fallback.textContent = job ? "✦" : "?";
    root.append(fallback, frame); frame.append(img);
    img.addEventListener("load", () => { fallback.hidden = true; });
    img.addEventListener("error", () => {
      clearTimeout(state.timer); state.failed = true;
      if (img.getAttribute("src") === placeholder) { frame.hidden = true; fallback.hidden = false; }
      else { img.src = placeholder; root.dataset.spriteFallback = "true"; }
    });
    const sprite = job?.sprite;
    const action = root.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "idle" : options.action || "idle";
    const start = Date.now();
    function paint(nextAction, elapsed, mirrored = false) {
      if (state.failed || renders.get(root) !== state) return;
      const selected = frameAt(sprite, nextAction, elapsed);
      const path = sprite?.animations[selected.action]?.frames[selected.index]?.path;
      const src = safePath(path) ? path : placeholder;
      root.dataset.spriteFallback = String(src === placeholder);
      if (img.getAttribute("src") !== src) img.src = src;
      frame.style.transform = mirrored && sprite?.mirrorPolicy?.cosmeticFlip ? "scaleX(-1)" : "none";
      return selected;
    }
    function draw() {
      const selected = paint(action, Date.now() - start);
      if (!selected) return;
      if (sprite && selected.action !== "idle") state.timer = setTimeout(draw, sprite.animations[selected.action].frameDurationMs);
    }
    state.instance = { paint, dispose: () => dispose(root) };
    if (options.externalClock) paint("idle", 0); else draw();
    return state.instance;
  }
  function dispose(root) { clearTimeout(renders.get(root)?.timer); renders.delete(root); }
  const api = { resolve, frameAt, render, dispose, safePath, placeholder };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.Level38Sprites = api;
})(typeof window === "undefined" ? globalThis : window);
