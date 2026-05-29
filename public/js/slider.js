/* ============================================================
   SLIDER LATERAL — navegación entre secciones con los botones del menú
   ============================================================ */
(function () {
  const track   = document.getElementById("track");
  const buttons = Array.from(document.querySelectorAll(".nav-btn"));
  let current   = 0;

  function goTo(index) {
    if (index < 0 || index >= buttons.length) return;
    current = index;
    track.style.transform = `translateX(-${index * 100}%)`;
    buttons.forEach((b, i) => b.classList.toggle("active", i === index));
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      goTo(parseInt(btn.dataset.slide, 10));
    });
  });

  /* Navegación con teclado (flechas izq/der) */
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") goTo(current + 1);
    if (e.key === "ArrowLeft")  goTo(current - 1);
  });

  /* Swipe táctil en móvil */
  let startX = 0;
  const viewport = document.querySelector(".slider-viewport");
  viewport.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
  viewport.addEventListener("touchend", (e) => {
    const diff = e.changedTouches[0].clientX - startX;
    if (Math.abs(diff) > 60) {
      if (diff < 0) goTo(current + 1);
      else          goTo(current - 1);
    }
  }, { passive: true });
})();
