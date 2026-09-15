(function () {
  "use strict";
  // Half-resolution canvas, integer squares, capped particles and a 30fps draw budget.
  // All resources belong to one run; start() returns its complete cleanup function.
  function start(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => {};
    const palette = ["#f3d187", "#91d9aa", "#97c9ea", "#dba1c0", "#faf0cc"];
    const types = ["radial", "double", "chrysanthemum", "star", "willow"];
    let width, height, limit, mobile, frame, stopped = false, startTime, last = -34, next = 0, launches = 0;
    let rockets = [], particles = [];
    function resize() {
      const oldWidth = width, oldHeight = height;
      mobile = window.innerWidth < 600;
      width = Math.min(900, Math.ceil(window.innerWidth / 2)); height = Math.min(600, Math.ceil(window.innerHeight / 2));
      canvas.width = width; canvas.height = height; ctx.imageSmoothingEnabled = false;
      limit = mobile ? 420 : 780;
      if (oldWidth && oldHeight) {
        const sx = width / oldWidth, sy = height / oldHeight;
        for (const rocket of rockets) { rocket.x *= sx; rocket.fromX *= sx; rocket.y *= sy; }
        for (const p of particles) { p.x *= sx; p.y *= sy; p.vx *= sx; p.vy *= sy; p.gravity *= sy; }
        particles = particles.slice(-limit);
      }
    }
    resize(); window.addEventListener("resize", resize);
    function launch(time, opening = false) {
      const index = launches++;
      const foreground = opening || index % 3 !== 0;
      // Alternate sides and heights, keeping the central message comparatively calm.
      const x = width * (index % 2 ? .72 + Math.random() * .18 : .1 + Math.random() * .18);
      const y = height * (.08 + Math.random() * (foreground ? .31 : .48));
      rockets.push({x, y, fromX: x + (index % 2 ? -1 : 1) * width * .09, birth:time,
        travel: opening ? 700 + index % 3 * 100 : 850 + Math.random() * 200,
        color:palette[index % palette.length], type:types[index % types.length], foreground});
    }
    function burst(rocket, time) {
      const {x, y, color, type, foreground} = rocket;
      const scale = Math.min(width / 440, 1) * (foreground ? 1 : .55);
      const count = type === "chrysanthemum" ? 100 : type === "double" ? 80 : type === "willow" ? 58 : 48;
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2 - Math.PI / 2;
        let speed = 52, life = 1.9, gravity = 15;
        if (type === "double") speed = i % 2 ? 38 : 75;
        if (type === "chrysanthemum") { speed = 35 + (i % 4) * 18; life = 2.6; gravity = 12; }
        if (type === "star") { speed = 30 + 50 * Math.pow((1 + Math.cos(angle * 5 + Math.PI / 2)) / 2, 2); life = 2.1; }
        if (type === "willow") { speed = 32 + i % 3 * 13; life = 3.8; gravity = 19; }
        particles.push({x, y, vx: Math.cos(angle) * speed * scale, vy: Math.sin(angle) * speed * scale,
          birth:time, life, gravity:gravity * scale, color:type === "willow" ? palette[i % 4 === 0 ? 4 : 0] : (type === "double" && i % 2 ? palette[4] : color),
          size:foreground ? 2 : 1, trail:type === "willow" ? 7 : type === "chrysanthemum" ? 4 : 3});
      }
      particles = particles.slice(-limit);
    }
    function square(x, y, size, color, alpha) {
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), size, size);
    }
    function draw(time) {
      if (stopped) return;
      startTime ??= time;
      const elapsed = time - startTime;
      if (time - last >= 32) {
        last = time; ctx.clearRect(0, 0, width, height);
        if (elapsed >= next) {
          if (launches === 0) { for (let i = 0; i < 3; i++) launch(elapsed, true); next = elapsed + 700; }
          else {
            launch(elapsed);
            if (elapsed < 7000 && !mobile) launch(elapsed + 180);
            // Dense first seven seconds; then a relaxed, indefinite cadence.
            next = elapsed + (elapsed < 2000 ? 480 : elapsed < 7000 ? 420 : 1100 + Math.random() * 500);
          }
        }
        rockets = rockets.filter(rocket => {
          const age = elapsed - rocket.birth;
          if (age < 0) return true;
          if (age >= rocket.travel) { burst(rocket, elapsed); return false; }
          for (let trail = 7; trail >= 0; trail--) {
            const ratio = Math.max(0, (age - trail * 25) / rocket.travel);
            const eased = 1 - Math.pow(1 - ratio, 1.5);
            square(rocket.fromX + (rocket.x - rocket.fromX) * eased, height + 5 + (rocket.y - height - 5) * eased,
              trail === 0 ? 2 : 1, trail === 0 ? palette[4] : rocket.color, 1 - trail / 9);
          }
          return true;
        });
        particles = particles.filter(p => elapsed - p.birth < p.life * 1000);
        for (const p of particles) {
          const age = (elapsed - p.birth) / 1000;
          const alpha = Math.min(1, (p.life - age) * 1.3);
          for (let trail = p.trail; trail >= 0; trail--) {
            const a = Math.max(0, age - trail * .045);
            // Drag fans the shells out, then lets the golden willow fall slowly.
            const drift = (1 - Math.exp(-a * .65)) / .65;
            square(p.x + p.vx * drift, p.y + p.vy * drift + p.gravity * a * a,
              trail === 0 ? p.size : 1, p.color, alpha * (1 - trail / (p.trail + 1)));
          }
        }
        ctx.globalAlpha = 1;
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      if (stopped) return;
      stopped = true; cancelAnimationFrame(frame); window.removeEventListener("resize", resize);
      rockets.length = 0; particles.length = 0; ctx.clearRect(0, 0, width, height);
    };
  }
  window.Level38Fireworks = {start};
})();
