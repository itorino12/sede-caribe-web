/* Carrusel de las últimas noticias en la portada.
   - Sin JavaScript se ve solo la primera noticia (CSS); aquí se activan los controles.
   - Cambia solo cada 8 s, salvo que la persona lo pause (botón), tenga activado «reducir movimiento» (o «quieto» en el sitio), tenga el
     cursor o el teclado dentro del carrusel, o la pestaña esté oculta (WCAG 2.2.2).
   - Las noticias que no se ven quedan inertes: sus enlaces no reciben foco ni los lee el lector de pantalla. */
(function () {
  "use strict";
  var nodo = document.querySelector("[data-carrusel-noticias]");
  if (!nodo) return;
  var diapositivas = Array.prototype.slice.call(nodo.querySelectorAll(".portada__noticia"));
  var mando = nodo.querySelector(".portada__noticias-mando");
  if (diapositivas.length < 2 || !mando) return;

  var pista = nodo.querySelector(".portada__noticias-pista");
  var puntos = Array.prototype.slice.call(nodo.querySelectorAll("[data-ir]"));
  var botonPausa = nodo.querySelector("[data-pausa]");
  var reducido = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ESPERA = 8000;
  var actual = 0, reloj = 0;
  var detenido = reducido.matches || document.documentElement.hasAttribute("data-quieto");   // pausa pedida por la persona, por su sistema o por el ajuste «quieto» del sitio
  var adentro = false;               // cursor o teclado dentro del carrusel

  function mostrar(i, automatico) {
    actual = (i + diapositivas.length) % diapositivas.length;
    // mientras cambia solo no se anuncia nada; si la persona lo mueve, se anuncia la noticia nueva
    pista.setAttribute("aria-live", automatico ? "off" : "polite");
    diapositivas.forEach(function (d, k) {
      var activa = k === actual;
      d.classList.toggle("activa", activa);
      d.inert = !activa;
      if (activa) d.removeAttribute("aria-hidden"); else d.setAttribute("aria-hidden", "true");
    });
    puntos.forEach(function (p, k) {
      if (k === actual) p.setAttribute("aria-current", "true"); else p.removeAttribute("aria-current");
    });
    programar();
  }

  function programar() {
    clearTimeout(reloj);
    if (detenido || adentro || document.hidden) return;
    reloj = setTimeout(function () { mostrar(actual + 1, true); }, ESPERA);
  }

  function actualizarPausa() {
    botonPausa.setAttribute("aria-pressed", detenido ? "true" : "false");
    botonPausa.setAttribute("aria-label", detenido ? "Reanudar el cambio automático" : "Pausar el cambio automático");
    nodo.classList.toggle("portada__noticias--pausa", detenido);
  }

  nodo.querySelector("[data-antes]").addEventListener("click", function () { mostrar(actual - 1, false); });
  nodo.querySelector("[data-despues]").addEventListener("click", function () { mostrar(actual + 1, false); });
  puntos.forEach(function (p) {
    p.addEventListener("click", function () { mostrar(parseInt(p.getAttribute("data-ir"), 10), false); });
  });
  botonPausa.addEventListener("click", function () {
    detenido = !detenido;
    actualizarPausa();
    programar();
  });

  // el cursor o el teclado dentro del carrusel lo detienen mientras estén ahí
  nodo.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") { adentro = true; programar(); } });
  nodo.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { adentro = false; programar(); } });
  nodo.addEventListener("focusin", function () { adentro = true; programar(); });
  nodo.addEventListener("focusout", function (e) {
    if (!nodo.contains(e.relatedTarget)) { adentro = false; programar(); }
  });
  nodo.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { mostrar(actual - 1, false); e.preventDefault(); }
    else if (e.key === "ArrowRight") { mostrar(actual + 1, false); e.preventDefault(); }
  });
  document.addEventListener("visibilitychange", programar);

  // deslizar con el dedo
  var x0 = null, y0 = 0;
  nodo.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  nodo.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) mostrar(actual + (dx < 0 ? 1 : -1), false);
  }, { passive: true });

  mando.hidden = false;
  nodo.setAttribute("data-listo", "");
  actualizarPausa();
  mostrar(0, true);
})();
