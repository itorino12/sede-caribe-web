// UCR Sede del Caribe: menú, buscador, filtros, panel de accesibilidad y tablero «Hoy en la Sede».
(function () {
  "use strict";
  var raiz = document.currentScript.dataset.raiz || "";
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var normal = function (t) { return (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };

  // ---------- menú principal y submenús
  var botonMenu = $("[data-menu]"), menu = $("#menu");
  if (botonMenu) botonMenu.addEventListener("click", function () {
    var abierto = menu.classList.toggle("abierto");
    botonMenu.setAttribute("aria-expanded", abierto);
  });
  var subs = $$("[data-sub]");
  var cerrarSubs = function (excepto) { subs.forEach(function (b) { if (b !== excepto) b.setAttribute("aria-expanded", "false"); }); };
  subs.forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      cerrarSubs(b);
      b.setAttribute("aria-expanded", b.getAttribute("aria-expanded") !== "true");
    });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".menu__item--sub")) cerrarSubs(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { var abierto = subs.filter(function (b) { return b.getAttribute("aria-expanded") === "true"; })[0]; if (abierto) { cerrarSubs(); abierto.focus(); } }
  });

  // ---------- diálogos (buscador y accesibilidad)
  $$("[data-abrir]").forEach(function (b) {
    var d = document.getElementById(b.dataset.abrir);
    if (!d || !d.showModal) return;
    b.addEventListener("click", function () { d.showModal(); b.setAttribute("aria-expanded", "true"); var c = $("input", d); if (c && d.id === "buscador") c.focus(); });
    d.addEventListener("close", function () { b.setAttribute("aria-expanded", "false"); b.focus(); });
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
  });

  // ---------- buscador del sitio (índice generado al compilar)
  var campo = $("#buscador-campo"), lista = $("#buscador-resultados"), estado = $("#buscador-estado");
  function buscar(q) {
    var indice = window.INDICE || [];
    var terminos = normal(q).split(/\s+/).filter(function (t) { return t.length > 1; });
    lista.innerHTML = "";
    if (!terminos.length) { estado.textContent = ""; return; }
    var res = indice.map(function (e) {
      var t = normal(e.t), x = normal(e.x), p = 0;
      for (var i = 0; i < terminos.length; i++) {
        var k = terminos[i];
        if (t.indexOf(k) > -1) p += 10; else if (x.indexOf(k) > -1) p += 1; else return null;
      }
      return { e: e, p: p };
    }).filter(Boolean).sort(function (a, b) { return b.p - a.p; }).slice(0, 12);
    estado.textContent = res.length ? res.length + (res.length === 1 ? " resultado" : " resultados") : "No hay resultados. Pruebe con otra palabra o revise el directorio.";
    res.forEach(function (r) {
      var li = document.createElement("li"), a = document.createElement("a"), s = document.createElement("strong"), sp = document.createElement("span");
      a.href = raiz + r.e.u; s.textContent = r.e.t;
      var x = r.e.x, i = normal(x).indexOf(terminos[0]);
      sp.textContent = (i > 60 ? "…" : "") + x.substr(Math.max(0, i - 60), 160) + "…";
      a.appendChild(s); a.appendChild(sp); li.appendChild(a); lista.appendChild(li);
    });
  }
  if (campo) {
    var espera;
    campo.addEventListener("input", function () { clearTimeout(espera); espera = setTimeout(function () { buscar(campo.value); }, 120); });
    $(".buscador__form").addEventListener("submit", function (e) {
      var primero = $("a", lista);
      if (campo.value && primero) { e.preventDefault(); location.href = primero.href; }
    });
  }
  document.addEventListener("keydown", function (e) {
    var escribiendo = /input|textarea|select/i.test(document.activeElement.tagName);
    if ((e.key === "/" && !escribiendo) || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault(); var d = $("#buscador"); if (d && !d.open) { d.showModal(); campo.focus(); }
    }
  });
  var directa = $("[data-busqueda-directa]");
  if (directa) directa.addEventListener("submit", function (e) {
    e.preventDefault(); var q = $("input", directa).value; var d = $("#buscador");
    d.showModal(); campo.value = q; buscar(q); campo.focus();
  });

  // ---------- filtros por botón (carreras por área, noticias por tema)
  $$("[data-filtro]").forEach(function (grupo) {
    var objetivo = document.getElementById(grupo.dataset.filtro);
    var botones = $$("button", grupo);
    function aplicar(valor) {
      botones.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.valor === valor); });
      $$("[data-area]", objetivo).forEach(function (el) { el.hidden = !!valor && el.dataset.area !== valor; });
    }
    botones.forEach(function (b) { b.addEventListener("click", function () { aplicar(b.dataset.valor); }); });
    var inicial = new URLSearchParams(location.search).get("categoria");
    if (inicial && botones.some(function (b) { return b.dataset.valor === inicial; })) aplicar(inicial);
  });

  // ---------- filtro de texto del directorio
  $$("[data-filtrar-tabla]").forEach(function (input) {
    var cont = document.getElementById(input.dataset.filtrarTabla), est = $("[data-estado-filtro]");
    input.addEventListener("input", function () {
      var q = normal(input.value.trim()), total = 0;
      $$("[data-grupo]", cont).forEach(function (g) {
        var visibles = 0, coincideGrupo = normal($("h2", g).textContent).indexOf(q) > -1;
        $$("[data-fila]", g).forEach(function (f) {
          var ok = !q || coincideGrupo || normal(f.textContent).indexOf(q) > -1;
          f.hidden = !ok; if (ok) visibles++;
        });
        g.hidden = visibles === 0; total += visibles;
      });
      est.textContent = q ? (total ? total + " coincidencias" : "Nada coincide. Llame a la central, 2511-7300, y le comunican.") : "";
    });
    // directorio.html?buscar=... llega ya filtrado (lo usan los enlaces del menú Administración)
    var pedido = new URLSearchParams(location.search).get("buscar");
    if (pedido) { input.value = pedido; input.dispatchEvent(new Event("input")); }
  });

  // ---------- panel de accesibilidad
  var r = document.documentElement, pref = {};
  try { pref = JSON.parse(localStorage.getItem("sc-a11y") || "{}"); } catch (e) {}
  function guardar() { try { localStorage.setItem("sc-a11y", JSON.stringify(pref)); } catch (e) {} }
  function marcar() {
    $$("[data-escala]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.escala === String(pref.escala || "1"))); });
    $$("[data-tema]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tema === (pref.tema || "claro"))); });
    $$("[data-opcion]").forEach(function (c) { c.checked = !!pref[c.dataset.opcion]; });
  }
  $$("[data-escala]").forEach(function (b) { b.addEventListener("click", function () { pref.escala = b.dataset.escala; r.style.setProperty("--escala", pref.escala); guardar(); marcar(); }); });
  $$("[data-tema]").forEach(function (b) { b.addEventListener("click", function () { pref.tema = b.dataset.tema; if (pref.tema === "oscuro") r.dataset.tema = "oscuro"; else delete r.dataset.tema; guardar(); marcar(); }); });
  $$("[data-opcion]").forEach(function (c) { c.addEventListener("change", function () {
    pref[c.dataset.opcion] = c.checked; if (c.checked) r.setAttribute("data-" + c.dataset.opcion, ""); else r.removeAttribute("data-" + c.dataset.opcion); guardar();
  }); });
  marcar();

  // ---------- «Hoy en la Sede»: fecha del visitante y antigüedad de la información
  var hoy = $(".hoy");
  if (hoy) {
    var ahora = new Date();
    var cr = new Intl.DateTimeFormat("es-CR", { timeZone: "America/Costa_Rica", day: "numeric", weekday: "long", month: "long", year: "numeric" }).formatToParts(ahora);
    var parte = function (t) { return (cr.filter(function (p) { return p.type === t; })[0] || {}).value; };
    $("[data-hoy-dia]").textContent = parte("day");
    $("[data-hoy-semana]").textContent = parte("weekday");
    $("[data-hoy-mes]").textContent = parte("month") + " de " + parte("year");
    var compilado = new Date(hoy.dataset.compilado), min = Math.round((ahora - compilado) / 60000), txt;
    if (!isNaN(min) && min >= 0) {
      if (min < 2) txt = "Actualizado hace un momento";
      else if (min < 60) txt = "Actualizado hace " + min + " minutos";
      else if (min < 1440) txt = "Actualizado hace " + Math.round(min / 60) + (Math.round(min / 60) === 1 ? " hora" : " horas");
      else txt = "Actualizado hace " + Math.round(min / 1440) + (Math.round(min / 1440) === 1 ? " día" : " días");
      $("[data-hace]").textContent = txt;
    }
  }
})();
