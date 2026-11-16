/* Carrusel de las últimas noticias en la portada.
   - Sin JavaScript se ve solo la primera noticia (CSS); aquí se activa el botón «siguiente».
   - Pasa solo a la siguiente cada 5 s y, después de la tercera, vuelve a la primera. También se puede pasar con el botón
     «siguiente», las flechas del teclado o deslizando en el celular (eso reinicia la cuenta de 5 s).
   - No cambia solo si la persona tiene «reducir movimiento» en su sistema o activa «Detener animaciones» en el panel de
     accesibilidad del sitio (se respeta en vivo): ese es el mecanismo para detenerlo (WCAG 2.2.2). Tampoco cambia mientras
     el cursor o el teclado están dentro del carrusel, mientras hay un dedo encima ni con la pestaña oculta.
   - Las noticias que no se ven quedan inertes: sus enlaces no reciben foco ni los lee el lector de pantalla. */
(function () {
  "use strict";
  var nodo = document.querySelector("[data-carrusel-noticias]");
  if (!nodo) return;
  var diapositivas = Array.prototype.slice.call(nodo.querySelectorAll(".portada__noticia"));
  var siguiente = nodo.querySelector("[data-despues]");
  if (diapositivas.length < 2 || !siguiente) return;

  var pista = nodo.querySelector(".portada__noticias-pista");
  var raiz = document.documentElement;
  var reducido = window.matchMedia("(prefers-reduced-motion: reduce)");
  var ESPERA = 5000;
  var actual = 0, reloj = 0;
  var adentro = false;    // cursor, teclado o dedo dentro del carrusel

  function quieto() { return reducido.matches || raiz.hasAttribute("data-quieto"); }

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
    programar();
  }

  function programar() {
    clearTimeout(reloj);
    if (quieto() || adentro || document.hidden) return;
    reloj = setTimeout(function () { mostrar(actual + 1, true); }, ESPERA);
  }

  siguiente.addEventListener("click", function () { mostrar(actual + 1, false); });
  nodo.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { mostrar(actual - 1, false); e.preventDefault(); }
    else if (e.key === "ArrowRight") { mostrar(actual + 1, false); e.preventDefault(); }
  });

  // el cursor o el teclado dentro del carrusel lo detienen mientras estén ahí
  nodo.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") { adentro = true; programar(); } });
  nodo.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") { adentro = false; programar(); } });
  nodo.addEventListener("focusin", function () { adentro = true; programar(); });
  nodo.addEventListener("focusout", function (e) {
    if (!nodo.contains(e.relatedTarget)) { adentro = false; programar(); }
  });
  document.addEventListener("visibilitychange", programar);
  // «reducir movimiento» del sistema y «Detener animaciones» del sitio, también si cambian con la página abierta
  if (reducido.addEventListener) reducido.addEventListener("change", programar);
  new MutationObserver(programar).observe(raiz, { attributes: true, attributeFilter: ["data-quieto"] });

  // deslizar con el dedo (mientras hay un dedo encima no cambia solo)
  var x0 = null, y0 = 0;
  nodo.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; adentro = true; programar(); }, { passive: true });
  nodo.addEventListener("touchend", function (e) {
    adentro = false;
    if (x0 !== null) {
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) { mostrar(actual + (dx < 0 ? 1 : -1), false); return; }
    }
    programar();
  }, { passive: true });
  nodo.addEventListener("touchcancel", function () { adentro = false; x0 = null; programar(); }, { passive: true });

  siguiente.hidden = false;
  nodo.setAttribute("data-listo", "");
  mostrar(0, true);
})();
