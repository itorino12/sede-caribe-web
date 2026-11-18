// UCR Sede del Caribe: menú, buscador, filtros, panel de accesibilidad y tablero «Hoy en la Sede».
(function () {
  "use strict";
  var raiz = document.currentScript.dataset.raiz || "";
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var normal = function (t) { return (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };

  // ---------- menú principal y submenús
  var botonMenu = $("[data-menu]"), menu = $("#menu");
  // Al abrir o cerrar el panel cambia la altura de la cabecera y el navegador reajusta el desplazamiento;
  // ese salto no debe contar como «el usuario desplazó la página» (si no, el menú se cierra al abrirlo).
  var quietoHasta = 0;
  if (botonMenu) botonMenu.addEventListener("click", function () {
    var abierto = menu.classList.toggle("abierto");
    botonMenu.setAttribute("aria-expanded", abierto);
    quietoHasta = Date.now() + 400;
  });
  var subs = $$("[data-sub]");
  var cerrarSubs = function (excepto) { subs.forEach(function (b) { if (b !== excepto) b.setAttribute("aria-expanded", "false"); }); $$("[data-sub2]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); }); };
  subs.forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      cerrarSubs(b);
      b.setAttribute("aria-expanded", b.getAttribute("aria-expanded") !== "true");
      quietoHasta = Date.now() + 400;
    });
  });
  var subs2 = $$("[data-sub2]");
  subs2.forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = b.getAttribute("aria-expanded") !== "true";
      subs2.forEach(function (o) { o.setAttribute("aria-expanded", "false"); });
      b.setAttribute("aria-expanded", abrir);
      quietoHasta = Date.now() + 400;
    });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".menu__item--sub")) cerrarSubs(); });
  // Al desplazar la página con el menú desplegado (submenús en PC, panel en celular), el menú se cierra.
  // Se ignoran movimientos de menos de 24 px para no cerrarlo por un roce.
  var yMenu = 0;
  document.addEventListener("click", function () { yMenu = window.scrollY; }, true);
  window.addEventListener("scroll", function () {
    if (Date.now() < quietoHasta) { yMenu = window.scrollY; return; }
    if (Math.abs(window.scrollY - yMenu) < 24) return;
    var hayAbierto = subs.some(function (b) { return b.getAttribute("aria-expanded") === "true"; });
    if (hayAbierto) cerrarSubs();
    if (menu && menu.classList.contains("abierto")) {
      menu.classList.remove("abierto");
      if (botonMenu) botonMenu.setAttribute("aria-expanded", "false");
    }
    yMenu = window.scrollY;
  }, { passive: true });
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
  // consulta compartida con la barra de la portada: el mismo índice, el mismo orden y los mismos extractos
  function consultar(q, maximo, minimo) {
    var indice = window.INDICE || [];
    minimo = minimo || 2;
    var terminos = normal(q).split(/\s+/).filter(function (t) { return t.length >= minimo; });
    if (!terminos.length) return { terminos: terminos, res: [] };
    var res = indice.map(function (e) {
      var t = normal(e.t), x = normal(e.x), p = 0;
      for (var i = 0; i < terminos.length; i++) {
        var k = terminos[i];
        if (k.length === 1) {   // una sola letra: solo títulos con una palabra que empieza con ella
          if (new RegExp("(^|[^a-z0-9])" + k).test(t)) p += t.indexOf(k) === 0 ? 12 : 10; else return null;
        } else if (t.indexOf(k) > -1) p += 10; else if (x.indexOf(k) > -1) p += 1; else return null;
      }
      return { e: e, p: p };
    }).filter(Boolean).sort(function (a, b) { return b.p - a.p; }).slice(0, maximo);
    return { terminos: terminos, res: res };
  }
  function extracto(x, termino) {
    var i = normal(x).indexOf(termino);
    return (i > 60 ? "…" : "") + x.substr(Math.max(0, i - 60), 160) + "…";
  }
  function elemento(r, terminos) {
    var a = document.createElement("a"), s = document.createElement("strong"), sp = document.createElement("span");
    a.href = raiz + r.e.u; s.textContent = r.e.t; sp.textContent = extracto(r.e.x, terminos[0]);
    a.appendChild(s); a.appendChild(sp);
    return a;
  }
  var SIN_RESULTADOS = "No hay resultados. Pruebe con otra palabra o revise el directorio.";
  function buscar(q) {
    var c = consultar(q, 12), res = c.res;
    lista.innerHTML = "";
    if (!c.terminos.length) { estado.textContent = ""; return; }
    estado.textContent = res.length ? res.length + (res.length === 1 ? " resultado" : " resultados") : SIN_RESULTADOS;
    res.forEach(function (r) {
      var li = document.createElement("li");
      li.appendChild(elemento(r, c.terminos)); lista.appendChild(li);
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
  // ---------- barra de la portada: lista desplegable con resultados en vivo desde la primera letra.
  // Es un «combobox»: el foco se queda en el cuadro y las flechas recorren los resultados. La lista va en la capa
  // superior del navegador (popover) porque la portada recorta lo que se sale de ella.
  var directa = $("[data-busqueda-directa]");
  if (directa && campo) {
    var entrada = $("input", directa), marco = $(".portada__campo", directa);
    var panel = document.createElement("div"), ul = document.createElement("ul"), avisoVivo = document.createElement("p");
    var hay = typeof panel.showPopover === "function";
    var activo = -1, esperaPortada, abierta = false, hechos = [], pintada = null;
    panel.className = "portada__resultados"; panel.id = "portada-resultados";
    if (hay) panel.setAttribute("popover", "manual");
    panel.hidden = true;
    ul.setAttribute("role", "listbox"); ul.setAttribute("aria-label", "Resultados de la búsqueda");
    avisoVivo.className = "oculto"; avisoVivo.setAttribute("aria-live", "polite"); avisoVivo.setAttribute("role", "status");
    panel.appendChild(ul); directa.appendChild(panel); directa.appendChild(avisoVivo);
    entrada.setAttribute("role", "combobox"); entrada.setAttribute("aria-autocomplete", "list"); entrada.setAttribute("aria-haspopup", "listbox");
    entrada.setAttribute("aria-controls", panel.id); entrada.setAttribute("aria-expanded", "false");
    panel.addEventListener("mousedown", function (e) { e.preventDefault(); });   // elegir con el ratón no le quita el foco al cuadro

    var colocar = function () {
      if (!abierta) return;
      var r = marco.getBoundingClientRect(), alto = (window.visualViewport ? window.visualViewport.height : innerHeight);
      panel.style.left = r.left + "px"; panel.style.top = (r.bottom + 6) + "px"; panel.style.width = r.width + "px";
      panel.style.maxHeight = Math.max(150, Math.min(alto - r.bottom - 16, 440)) + "px";
    };
    var marcar = function (i) {
      var ops = $$("a", ul);
      activo = ops.length ? (i + ops.length) % ops.length : -1;
      ops.forEach(function (a, k) { a.setAttribute("aria-selected", k === activo ? "true" : "false"); a.classList.toggle("activo", k === activo); });
      if (activo > -1) { entrada.setAttribute("aria-activedescendant", ops[activo].id); ops[activo].scrollIntoView({ block: "nearest" }); }
      else entrada.removeAttribute("aria-activedescendant");
    };
    var cerrar = function () {
      if (!abierta) return;
      abierta = false; activo = -1; hechos = [];
      entrada.setAttribute("aria-expanded", "false"); entrada.removeAttribute("aria-activedescendant");
      if (hay && panel.matches(":popover-open")) panel.hidePopover();
      panel.hidden = true;
    };
    var abrir = function () {
      abierta = true; panel.hidden = false;
      if (hay && !panel.matches(":popover-open")) panel.showPopover();
      entrada.setAttribute("aria-expanded", "true");
      colocar();
    };
    var pintar = function () {
      var q = entrada.value, c = consultar(q, 8, 1);
      pintada = q;
      if (!c.terminos.length) { cerrar(); avisoVivo.textContent = ""; return; }
      ul.innerHTML = ""; activo = -1; entrada.removeAttribute("aria-activedescendant");
      hechos = c.res;
      if (!c.res.length) {
        var vacio = document.createElement("li"); vacio.className = "portada__resultados-vacio"; vacio.setAttribute("role", "presentation");
        vacio.textContent = SIN_RESULTADOS; ul.appendChild(vacio);
        avisoVivo.textContent = SIN_RESULTADOS;
      } else {
        c.res.forEach(function (r, k) {
          var li = document.createElement("li"), a = elemento(r, c.terminos);
          li.setAttribute("role", "presentation"); a.setAttribute("role", "option"); a.id = "portada-resultado-" + k; a.tabIndex = -1; a.setAttribute("aria-selected", "false");
          li.appendChild(a); ul.appendChild(li);
        });
        avisoVivo.textContent = c.res.length + (c.res.length === 1 ? " resultado" : " resultados") + ". Use las flechas para elegir.";
      }
      abrir();
    };
    // desde la primera letra: sin espera larga (el índice está en memoria; 60 ms solo agrupa teclas muy seguidas)
    entrada.addEventListener("input", function () { clearTimeout(esperaPortada); esperaPortada = setTimeout(pintar, 60); });
    entrada.addEventListener("focus", function () { if (entrada.value && !abierta) pintar(); });
    entrada.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" && abierta && hechos.length) { e.preventDefault(); marcar(activo + 1); }
      else if (e.key === "ArrowUp" && abierta && hechos.length) { e.preventDefault(); marcar(activo < 0 ? -1 : activo - 1); }
      else if (e.key === "Escape" && abierta) { e.preventDefault(); e.stopPropagation(); cerrar(); }
    });
    directa.addEventListener("focusout", function (e) { if (!directa.contains(e.relatedTarget)) cerrar(); });
    window.addEventListener("resize", colocar);
    window.addEventListener("scroll", colocar, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", colocar);

    directa.addEventListener("submit", function (e) {
      e.preventDefault();
      clearTimeout(esperaPortada);
      if (!entrada.value.trim()) { entrada.focus(); return; }
      if (pintada !== entrada.value) pintar();   // si no, se conserva la opción elegida con las flechas
      var ops = $$("a", ul), a = ops[activo > -1 ? activo : 0];
      if (a) { location.href = a.href; return; }
      // sin coincidencias: se abre el cuadro completo de la barra, que explica qué hacer
      cerrar(); var q = entrada.value, d = $("#buscador");
      d.showModal(); campo.value = q; buscar(q); campo.focus();
    });
  }

  // ---------- portada: una sola búsqueda a la vista (la lupa del encabezado se oculta mientras se ve el buscador de la portada)
  var buscarPortada = $(".portada__buscar");
  if (buscarPortada && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) {
      document.body.classList.toggle("buscador-portada-visible", e[0].isIntersecting);
    }).observe(buscarPortada);
  }

  // ---------- filtros por botón (carreras por área, noticias por tema)
  $$("[data-filtro]").forEach(function (grupo) {
    var objetivo = document.getElementById(grupo.dataset.filtro);
    var botones = $$("button", grupo);
    function aplicar(valor) {
      botones.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.valor === valor); });
      $$("[data-area]", objetivo).forEach(function (el) { el.hidden = !!valor && el.dataset.area !== valor; });
      // agenda: un mes (o el bloque de anteriores) sin nada visible se oculta entero
      $$("[data-grupo-filtro]", objetivo).reverse().forEach(function (g) {
        g.hidden = !!valor && !$$("[data-area]", g).some(function (el) { return !el.hidden; });
      });
    }
    botones.forEach(function (b) { b.addEventListener("click", function () { aplicar(b.dataset.valor); }); });
    var inicial = new URLSearchParams(location.search).get("categoria");
    if (inicial && botones.some(function (b) { return b.dataset.valor === inicial; })) aplicar(inicial);
  });

  // ---------- un enlace a una actividad anterior abre el bloque plegado que la contiene
  function abrirDestino() {
    var id = decodeURIComponent(location.hash.slice(1)), el = id && document.getElementById(id), d = el && el.closest("details");
    if (d && !d.open) { d.open = true; el.scrollIntoView(); }
  }
  window.addEventListener("hashchange", abrirDestino);
  abrirDestino();

  // ---------- filtro de texto del directorio
  $$("[data-filtrar-tabla]").forEach(function (input) {
    var cont = document.getElementById(input.dataset.filtrarTabla), est = $("[data-estado-filtro]");
    input.addEventListener("input", function () {
      var q = normal(input.value.trim()), total = 0;
      $$("[data-grupo]", cont).forEach(function (g) {
        var visibles = 0, coincideGrupo = normal($("h2, h3", g).textContent).indexOf(q) > -1;
        $$("[data-fila]", g).forEach(function (f) {
          var ok = !q || coincideGrupo || normal(f.textContent).indexOf(q) > -1;
          f.hidden = !ok; if (ok) visibles++;
        });
        $$("[data-subgrupo]", g).forEach(function (s) {
          s.hidden = !$("[data-fila]:not([hidden])", s);
          if (s.tagName === "DETAILS") s.open = q ? !s.hidden : s.hasAttribute("data-abierto");
        });
        g.hidden = visibles === 0; total += visibles;
        if (g.tagName === "DETAILS") g.open = q ? visibles > 0 : false;
      });
      est.textContent = q ? (total ? total + " coincidencias" : (input.dataset.vacio || "Nada coincide. Llame a la central, 2511-7300, y le comunican.")) : "";
    });
    // directorio.html?buscar=... llega ya filtrado (lo usan los enlaces del menú Administración)
    var pedido = new URLSearchParams(location.search).get("buscar");
    if (pedido) { input.value = pedido; input.dispatchEvent(new Event("input")); }
  });

  // horarios.html: los accesos por carrera abren la pestaña a la que apuntan
  function abrirDestino() {
    var d = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (d && d.tagName === "DETAILS") { d.open = true; d.scrollIntoView(); }
  }
  window.addEventListener("hashchange", abrirDestino); abrirDestino();

  // ---------- panel de accesibilidad
  var r = document.documentElement, pref = {};
  try { pref = JSON.parse(localStorage.getItem("sc-a11y") || "{}"); } catch (e) {}
  function guardar() { try { localStorage.setItem("sc-a11y", JSON.stringify(pref)); } catch (e) {} }
  function marcar() {
    $$("[data-escala]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.escala === String(pref.escala || "1"))); });
    $$("button[data-tema]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tema === (pref.tema || "claro"))); });
    $$("[data-opcion]").forEach(function (c) { c.checked = !!pref[c.dataset.opcion]; });
    $$("[data-colores]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.colores === (pref.paleta || "institucional"))); });
  }
  $$("[data-escala]").forEach(function (b) { b.addEventListener("click", function () { pref.escala = b.dataset.escala; r.style.setProperty("--escala", pref.escala); guardar(); marcar(); }); });
  $$("button[data-tema]").forEach(function (b) { b.addEventListener("click", function () { pref.tema = b.dataset.tema; if (pref.tema === "oscuro") r.dataset.tema = "oscuro"; else delete r.dataset.tema; guardar(); marcar(); }); });
  // combinación de colores: el mismo menú está en la portada y en este panel; «institucional» es la de siempre
  $$("[data-colores]").forEach(function (b) { b.addEventListener("click", function () {
    var v = b.dataset.colores;
    if (v === "institucional") { delete pref.paleta; delete r.dataset.paleta; } else { pref.paleta = v; r.dataset.paleta = v; }
    guardar(); marcar();
  }); });
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
  // ---------- galerías: carrusel en la página y visor en grande en la misma pantalla
  // (flechas, deslizar, teclado; se cierra con la X, con Esc o tocando fuera de la foto)
  var mover = !matchMedia("(prefers-reduced-motion: reduce)").matches && document.documentElement.dataset.movimiento !== "no";
  function carrusel(nodo) {
    var pista = nodo.querySelector(".carrusel__pista"), cuenta = nodo.querySelector(".carrusel__cuenta"), c = { actual: 0 };
    if (!pista || !cuenta) { c.ir = function () {}; c.marcar = function () {}; return c; } // mosaico: sin pista, solo abre el visor
    var total = function () { return pista.children.length; };
    var marcar = function () { cuenta.textContent = total() > 1 ? (c.actual + 1) + " / " + total() : ""; };
    c.ir = function (i, ya) {
      if (!total()) return;
      c.actual = (i + total()) % total();
      pista.scrollTo({ left: c.actual * pista.clientWidth, behavior: ya || !mover ? "auto" : "smooth" });
      marcar();
    };
    nodo.querySelector("[data-antes]").addEventListener("click", function () { c.ir(c.actual - 1); });
    nodo.querySelector("[data-despues]").addEventListener("click", function () { c.ir(c.actual + 1); });
    pista.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); c.ir(c.actual - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); c.ir(c.actual + 1); }
    });
    var espera;
    pista.addEventListener("scroll", function () {
      clearTimeout(espera);
      espera = setTimeout(function () {
        var i = Math.round(pista.scrollLeft / Math.max(pista.clientWidth, 1));
        if (i !== c.actual) { c.actual = i; marcar(); }
      }, 80);
    }, { passive: true });
    c.pista = pista; c.marcar = marcar;
    return c;
  }
  var galerias = Array.prototype.slice.call(document.querySelectorAll("[data-galeria]"));
  if (galerias.length) {
    var visor = document.createElement("dialog");
    visor.className = "visor-fotos";
    visor.setAttribute("aria-label", "Fotos en grande");
    visor.innerHTML = '<div class="carrusel carrusel--grande" role="group" aria-roledescription="carrusel">' +
      '<ul class="carrusel__pista" tabindex="0"></ul>' +
      '<button type="button" class="carrusel__boton carrusel__boton--antes" data-antes aria-label="Foto anterior">‹</button>' +
      '<button type="button" class="carrusel__boton carrusel__boton--despues" data-despues aria-label="Foto siguiente">›</button>' +
      '<p class="carrusel__cuenta" aria-live="polite"></p></div>' +
      '<button type="button" class="visor-fotos__cerrar" aria-label="Cerrar fotos">×</button>';
    document.body.appendChild(visor);
    var grande = carrusel(visor.querySelector(".carrusel"));
    var origen = null;
    var cerrar = function () { if (visor.open) visor.close(); };
    visor.querySelector(".visor-fotos__cerrar").addEventListener("click", cerrar);
    visor.addEventListener("click", function (e) { if (e.target === visor || e.target.classList.contains("carrusel__foto")) cerrar(); });
    visor.addEventListener("close", function () {
      document.documentElement.classList.remove("sin-desplazar");
      if (origen) { origen.c.ir(grande.actual, true); var a = origen.enlaces[grande.actual]; if (a) a.focus({ preventScroll: true }); }
    });
    galerias.forEach(function (nodo) {
      var c = carrusel(nodo), enlaces = Array.prototype.slice.call(nodo.querySelectorAll(".carrusel__foto a"));
      enlaces.forEach(function (a, i) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          origen = { c: c, enlaces: enlaces };
          grande.pista.innerHTML = "";
          enlaces.forEach(function (b, j) {
            var li = document.createElement("li"), img = document.createElement("img"), chica = b.querySelector("img");
            li.className = "carrusel__foto";
            li.setAttribute("aria-label", (j + 1) + " de " + enlaces.length);
            img.src = b.dataset.m;
            img.srcset = b.dataset.s + " 640w, " + b.dataset.m + " 1280w, " + b.href + " 1920w";
            img.sizes = "100vw";
            img.alt = chica ? chica.alt : "";
            img.decoding = "async";
            li.appendChild(img);
            grande.pista.appendChild(li);
          });
          visor.querySelector(".carrusel").classList.toggle("carrusel--una", enlaces.length < 2);
          visor.querySelector(".carrusel").setAttribute("aria-label", nodo.getAttribute("aria-label") || "Fotos");
          document.documentElement.classList.add("sin-desplazar");
          visor.showModal();
          grande.ir(i, true);
          grande.pista.focus();
        });
      });
    });
    addEventListener("resize", function () { if (visor.open) grande.ir(grande.actual, true); });
  }

  // ---------- sin conexión: sw.js guarda las páginas vistas (y las de sin-conexion.html); sin señal se avisa arriba
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register(raiz + "sw.js", { scope: raiz || "./" }).catch(function () {});
  }
  var avisoRed = $("[data-sin-red]");
  var marcarRed = function () { if (avisoRed) avisoRed.hidden = navigator.onLine; };
  addEventListener("online", marcarRed); addEventListener("offline", marcarRed);
  marcarRed();
})();
