/* ============================================================
   SLIDER LATERAL — navegación entre secciones con los botones del menú
   ============================================================ */
(function () {
  const track   = document.getElementById("track");
  const buttons = Array.from(document.querySelectorAll(".nav-btn"));
  // URL fragments are routes, not DOM anchors: native fragment scrolling
  // would add scrollLeft on top of the track transform when returning from a detail.
  const slides = Array.from(track.querySelectorAll(":scope > .slide"));
  const viewport = document.querySelector(".slider-viewport");
  let current   = 0;

  function goTo(index, record = true) {
    if (index < 0 || index >= buttons.length) return;
    current = index;
    track.style.transform = `translateX(-${index * 100}%)`;
    buttons.forEach((b, i) => b.classList.toggle("active", i === index));
    slides.forEach((slide, i) => {
      slide.inert = i !== index;
      slide.setAttribute("aria-hidden", String(i !== index));
    });
    const hash = `#${slides[index].dataset.section}`;
    if (record && window.location.hash !== hash) window.history.pushState(null, "", hash);
    document.querySelectorAll(".lang-toggle a").forEach((link) => {
      const url = new URL(link.href);
      url.hash = hash;
      link.href = url.href;
    });
    viewport.scrollLeft = 0;
  }

  function fromLocation() {
    const index = slides.findIndex((slide) => `#${slide.dataset.section}` === window.location.hash);
    goTo(index < 0 ? 0 : index, false);
  }
  window.addEventListener("popstate", fromLocation);
  window.addEventListener("hashchange", fromLocation);
  fromLocation();

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      goTo(parseInt(btn.dataset.slide, 10));
    });
  });

  /* Navegación con teclado (flechas izq/der) */
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (e.key === "ArrowRight") goTo(current + 1);
    if (e.key === "ArrowLeft")  goTo(current - 1);
  });

  /* Swipe táctil en móvil */
  let startX = 0;
  viewport.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
  viewport.addEventListener("touchend", (e) => {
    const diff = e.changedTouches[0].clientX - startX;
    if (Math.abs(diff) > 60) {
      if (diff < 0) goTo(current + 1);
      else          goTo(current - 1);
    }
  }, { passive: true });
})();
