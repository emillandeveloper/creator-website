/* OBS-only finite effect. The party's existing RAF supplies the clock; no timers/listeners here. */
(function (scope) {
  "use strict";
  const duration = 10000, particleLimit = 900;
  const palette = ["#ffd77d", "#77ecda", "#f69acb", "#91bdff", "#fff5cc"];
  function create(canvas, banner) {
    let ctx, active = false, started = 0, lastDraw = -Infinity, reduced = false, quietPainted = false;
    let width = 1, height = 1, nextLaunch = 450, launches = 0, particles = [], rockets = [], numberBursts = 0;
    function resize() {
      if (!active || !ctx) return;
      width = Math.min(960, Math.ceil(scope.innerWidth / 2));
      height = Math.min(540, Math.ceil(scope.innerHeight / 2));
      canvas.width = width; canvas.height = height; ctx.imageSmoothingEnabled = false;
      quietPainted = false;
    }
    function stop() {
      active = false; particles = []; rockets = [];
      canvas.hidden = true; banner.hidden = true; banner.style.opacity = "";
      if (ctx) ctx.clearRect(0, 0, width, height);
      // Release the backing store between celebrations, including hidden/disconnected sources.
      canvas.width = 1; canvas.height = 1; ctx = null;
    }
    function square(x, y, size, color, alpha = 1) {
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha)); ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    }
    function spark(x, y, color, alpha) {
      square(x - 2, y, 5, color, alpha * .45);
      square(x, y - 2, 1, color, alpha);
      square(x, y + 1, 1, color, alpha);
      square(x, y, 1, "#fffbea", alpha);
    }
    function burst(x, y, index, time, opening = false) {
      const type = index % 4, count = opening ? 104 : type === 3 ? 72 : 88;
      const color = palette[index % palette.length];
      for (let i = 0; i < count && particles.length < particleLimit; i++) {
        const angle = i / count * Math.PI * 2 - Math.PI / 2;
        const star = .48 + .52 * Math.pow((1 + Math.cos(angle * 5 + Math.PI / 2)) / 2, 2);
        const speed = (type === 1 ? (i % 2 ? 36 : 75) : type === 2 ? 85 * star : 34 + i % 4 * 14);
        particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          born: time, life: type === 3 ? 2800 : 2000 + i % 3 * 180,
          gravity: type === 3 ? 16 : 9, color: type === 3 ? palette[i % 7 === 0 ? 4 : 0] : i % 9 === 0 ? palette[4] : color,
          trail: type === 3 ? 4 : 2, twinkle: i % 11 === 0 });
      }
    }
    // Two choreographed shell bursts draw sparkling outlines of 3 and 8.
    // Each spark expands from the shell, drifts under gravity, and expires naturally.
    const glyphs = {
      "3": ["11111","00001","00001","01111","00001","00001","11111"],
      "8": ["11111","10001","10001","11111","10001","10001","11111"]
    };
    function numberBurst(digit, cx, cy, time) {
      const rows = glyphs[digit], points = [];
      for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
        if (rows[y][x] === "1") points.push({ x, y });
      }
      // A fixed budget keeps the existing 18 rockets and radial bursts intact.
      const color = digit === "3" ? "#ffd77d" : "#77ecda";
      for (const dot of points) for (let j = 0; j < 3 && particles.length < particleLimit; j++) {
        const jitterX = (j - 1) * 1.0, jitterY = (j % 2 ? 1 : -1) * .75;
        particles.push({ x: cx, y: cy,
          vx: (dot.x - 2) * 11 + jitterX, vy: (dot.y - 3) * 11 + jitterY,
          born: time, life: 2450 + j * 110, gravity: 2.1,
          color: j === 1 ? "#fff5cc" : color, trail: 2, twinkle: j === 1,
          numeral: true });
      }
      numberBursts++;
    }
    function start(now, quiet = false) {
      stop(); ctx = canvas.getContext("2d");
      // The text still auto-finishes if canvas is unavailable.
      active = true; started = now; lastDraw = -Infinity; reduced = quiet; quietPainted = false;
      nextLaunch = 450; launches = 0; numberBursts = 0; banner.hidden = false;
      if (ctx) {
        canvas.hidden = false; resize();
        if (!reduced) for (let i = 0; i < 3; i++) burst(.24 + i * .26, .2 + (i % 2) * .06, i, 0, true);
      }
    }
    function paint(now, quiet = false) {
      if (!active) return;
      const elapsed = Math.max(0, now - started);
      if (quiet && !reduced) { reduced = true; particles = []; rockets = []; quietPainted = false; }
      const end = reduced ? 4000 : duration;
      if (elapsed >= end) { stop(); return; }
      banner.style.opacity = String(Math.min(1, (end - elapsed) / 700));
      if (!ctx || now - lastDraw < 32) return;
      lastDraw = now;
      if (reduced) {
        if (!quietPainted) {
          ctx.clearRect(0, 0, width, height);
          for (let i = 0; i < 18; i++) spark(width * (.15 + (i % 6) * .14), height * (.17 + Math.floor(i / 6) * .15), palette[i % 5], .85);
          ctx.globalAlpha = 1; quietPainted = true;
        }
        return;
      }
      ctx.clearRect(0, 0, width, height);
      // The number is a firework, not drawn text: two shells expand into 38.
      // Place the silhouettes above the party banner and beneath other bursts.
      if (elapsed >= 3500 && numberBursts === 0) {
        numberBurst("3", .42, .19, elapsed);
        numberBurst("8", .58, .19, elapsed);
      }
      // Fixed launch budget, no catch-up storm if a frame is delayed.
      if (elapsed >= nextLaunch && elapsed < 6600 && launches < 18) {
        const index = launches++;
        rockets.push({ x: .12 + ((index * 7) % 11) * .076, y: .14 + (index % 4) * .09,
          born: elapsed, travel: 620 + index % 3 * 90, index });
        nextLaunch = elapsed + (elapsed < 2300 ? 310 : 410);
      }
      rockets = rockets.filter(r => {
        const age = elapsed - r.born;
        if (age >= r.travel) { burst(r.x, r.y, r.index + 3, elapsed); return false; }
        for (let tail = 6; tail >= 0; tail--) {
          const ratio = Math.max(0, (age - tail * 24) / r.travel), ease = 1 - Math.pow(1 - ratio, 1.5);
          const x = width * (r.x + (1 - ease) * (r.index % 2 ? -.07 : .07));
          const y = height * (.84 + (r.y - .84) * ease);
          square(x, y, tail ? 1 : 2, tail ? palette[r.index % 5] : palette[4], 1 - tail / 8);
        }
        return true;
      });
      particles = particles.filter(p => elapsed - p.born < p.life);
      const scale = Math.min(width / 640, 1.4);
      for (const p of particles) {
        const age = (elapsed - p.born) / 1000, alpha = Math.min(1, (p.life / 1000 - age) * 1.6);
        for (let tail = p.trail; tail >= 0; tail--) {
          const a = Math.max(0, age - tail * .05), drift = (1 - Math.exp(-a * .6)) / .6;
          const shape = p.numeral ? Math.min(1, age / .42) : drift;
          const x = p.x * width + p.vx * shape * scale, y = p.y * height + (p.vy * shape + p.gravity * a * a) * scale;
          if (!tail && p.twinkle) spark(x, y, p.color, alpha);
          else square(x, y, tail ? 1 : 2, p.color, alpha * (1 - tail / (p.trail + 1)));
        }
      }
      ctx.globalAlpha = 1;
    }
    return { start, paint, stop, resize, get active() { return active; }, get particleCount() { return particles.length; }, get numberBursts() { return numberBursts; } };
  }
  const api = { create, duration, particleLimit };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.Level38PartyFireworks = api;
})(typeof window === "undefined" ? globalThis : window);
