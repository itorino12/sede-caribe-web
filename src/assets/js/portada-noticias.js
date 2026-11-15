/* Carrusel de las últimas noticias en la portada.
   - Sin JavaScript se ve solo la primera noticia (CSS); aquí se activa el botón «siguiente».
   - No cambia solo: pasa a la siguiente con el botón (o con las flechas del teclado o deslizando en el celular)
     y, después de la última, vuelve a la primera. Sin cambio automático no hace falta un botón de pausa (WCAG 2.2.2).
   - Las noticias que no se ven quedan inertes: sus enlaces no reciben foco ni los lee el lector de pantalla. */
(function () {
  "use strict";
  var nodo = document.querySelector("[data-carrusel-noticias]");
  if (!nodo) return;
  var diapositivas = Array.prototype.slice.call(nodo.querySelectorAll(".portada__noticia"));
  var siguiente = nodo.querySelector("[data-despues]");
  if (diapositivas.length < 2 || !siguiente) return;

  var pista = nodo.querySelector(".portada__noticias-pista");
  var actual = 0;

  function mostrar(i) {
    actual = (i + diapositivas.length) % diapositivas.length;
    diapositivas.forEach(function (d, k) {
      var activa = k === actual;
      d.classList.toggle("activa", activa);
      d.inert = !activa;
      if (activa) d.removeAttribute("aria-hidden"); else d.setAttribute("aria-hidden", "true");
    });
  }

  siguiente.addEventListener("click", function () {
    pista.setAttribute("aria-live", "polite");   // se anuncia la noticia nueva, solo cuando la persona la pide
    mostrar(actual + 1);
  });
  nodo.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { pista.setAttribute("aria-live", "polite"); mostrar(actual - 1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { pista.setAttribute("aria-live", "polite"); mostrar(actual + 1); e.preventDefault(); }
  });

  // deslizar con el dedo
  var x0 = null, y0 = 0;
  nodo.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  nodo.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) { pista.setAttribute("aria-live", "polite"); mostrar(actual + (dx < 0 ? 1 : -1)); }
  }, { passive: true });

  siguiente.hidden = false;
  nodo.setAttribute("data-listo", "");
  mostrar(0);
})();
