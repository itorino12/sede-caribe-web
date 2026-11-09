/* Malla curricular interactiva de una carrera (carrera.html).
   Al elegir un curso se resaltan sus requisitos (hacia atrás, en cadena) y los cursos que abre (hacia adelante),
   se dibujan las flechas de esa ruta y el panel muestra el detalle con el enlace al programa vigente.
   Los datos vienen del bloque <script id="malla-datos"> que escribe la plantilla. */
(function () {
  "use strict";
  var raiz = (document.currentScript && document.currentScript.dataset.raiz) || "";
  var fuente = document.getElementById("malla-datos");
  var malla = document.querySelector("[data-malla]");
  if (!fuente || !malla) return;
  var datos = JSON.parse(fuente.textContent);
  var panel = document.querySelector("[data-malla-panel]");
  var detalle = panel.querySelector("[data-malla-detalle]");
  var cerrar = panel.querySelector("[data-malla-cerrar]");
  var inicial = detalle.innerHTML;
  var svg = malla.querySelector(".malla__lineas");
  var NS = "http://www.w3.org/2000/svg";

  var cursos = {}, abre = {}, areas = {};
  datos.cursos.forEach(function (c) { cursos[c.sigla] = c; abre[c.sigla] = []; });
  datos.cursos.forEach(function (c) { (c.req || []).forEach(function (r) { if (abre[r]) abre[r].push(c.sigla); }); });
  datos.areas.forEach(function (a) { areas[a.id] = a; });
  var ciclo = {};
  datos.ciclos.forEach(function (c) { ciclo[c.n] = c.nombre; });
  var boton = {};
  malla.querySelectorAll(".curso").forEach(function (b) { boton[b.dataset.sigla] = b; });

  // Todas las siglas de la malla y de los optativos, para distinguir las equivalencias del plan anterior
  var conocidas = {};
  Object.keys(cursos).forEach(function (s) { conocidas[s] = cursos[s].nombre; });
  Object.keys(datos.optativos).forEach(function (a) { datos.optativos[a].forEach(function (o) { conocidas[o.sigla] = o.nombre; }); });

  function cadena(sigla, vecinos) {          // recorrido sin repetir (la malla oficial tiene un ciclo IF-0019 ↔ IF-0030)
    var vistos = {}, pila = [sigla];
    while (pila.length) {
      var s = pila.pop();
      (vecinos(s) || []).forEach(function (v) { if (!vistos[v] && v !== sigla && cursos[v]) { vistos[v] = true; pila.push(v); } });
    }
    return vistos;
  }

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function nombreCorto(c) { return c.optativo ? c.nombre + " (" + ciclo[c.ciclo] + ")" : c.sigla + " " + c.nombre; }
  function enlaceCurso(s) { var c = cursos[s]; return '<button type="button" class="malla-ir" data-ir="' + esc(s) + '">' + esc(nombreCorto(c)) + "</button>"; }
  function programa(p, nombre) {
    return p ? '<a class="boton malla-programa" href="' + raiz + esc(p.archivo) + '" download>Descargar el programa<span class="oculto"> de ' + esc(nombre) + "</span></a>" +
      '<span class="malla-programa__meta">Versión vigente: ' + esc(p.ciclo) + " · PDF de " + p.kb + " kB</span>" : "";
  }

  function equivalencias(c) {
    if (!c.req_texto) return "";
    var otras = (c.req_texto.match(/[A-Z]{2}-\d{4}/g) || []).filter(function (s) { return !conocidas[s]; });
    return otras.length ? '<p class="malla-panel__nota">Del plan anterior también sirven: ' + esc(otras.join(", ")) + ".</p>" : "";
  }

  function mostrar(c) {
    var a = areas[c.area], h = "";
    h += '<p class="malla-panel__area" style="--c:' + a.color + ";--c-o:" + a.oscuro + '">' + esc(a.nombre) + "</p>";
    h += '<h3 id="malla-panel-t">' + (c.optativo ? "" : '<span class="malla-panel__sigla">' + esc(c.sigla) + "</span> ") + esc(c.nombre) + "</h3>";
    h += '<dl class="malla-panel__datos"><dt>Ciclo</dt><dd>' + esc(ciclo[c.ciclo]) + "</dd><dt>Créditos</dt><dd>" + c.creditos + "</dd>";
    if (c.horas) h += "<dt>Horas por semana</dt><dd>" + c.horas.teoria + " de teoría y " + c.horas.practica + " de práctica</dd>";
    h += "</dl>";
    if (c.desc) h += "<p>" + esc(c.desc) + "</p>";
    var req = (c.req || []).filter(function (r) { return cursos[r]; });
    h += '<h4><span class="marca marca--req">Requisitos</span></h4>';
    h += req.length ? "<ul>" + req.map(function (r) { return "<li>" + enlaceCurso(r) + "</li>"; }).join("") + "</ul>" : "<p>Ninguno: se puede llevar desde el inicio.</p>";
    if (c.req_texto && !c.optativo && /\bo\b/.test(c.req_texto) && req.some(function (r) { return cursos[r].optativo; })) h += '<p class="malla-panel__nota">Requisito oficial: ' + esc(c.req_texto) + ".</p>";
    h += equivalencias(c);
    var siguientes = abre[c.sigla];
    h += '<h4><span class="marca marca--abre">Se abren al aprobarlo</span></h4>';
    h += siguientes.length ? "<ul>" + siguientes.map(function (s) { return "<li>" + enlaceCurso(s) + "</li>"; }).join("") + "</ul>" : "<p>No es requisito de otro curso de la malla.</p>";
    if (c.nota) h += '<p class="malla-panel__nota">' + esc(c.nota) + "</p>";
    if (c.optativo) {
      var lista = datos.optativos[c.area] || [];
      h += "<h4>Cursos que puede elegir</h4><ul class=\"malla-panel__opt\">" + lista.map(function (o) {
        return "<li><b>" + esc(o.sigla) + "</b> " + esc(o.nombre) + ' <span class="optativos__meta">Requisito: ' + esc(o.req_texto || "ninguno") + "</span>" +
          (o.programa ? ' <a href="' + raiz + esc(o.programa.archivo) + '" download>Programa (PDF, ' + esc(o.programa.ciclo) + ")</a>" : "") + "</li>";
      }).join("") + "</ul>";
    } else {
      h += c.programa ? programa(c.programa, c.nombre) : '<p class="malla-panel__nota">El programa se publicará cuando el curso se imparta por primera vez en el Plan 07.</p>';
    }
    detalle.innerHTML = h;
  }

  var actual = null;
  function elegir(sigla, enfocar) {
    if (actual === sigla) return limpiar();
    actual = sigla;
    var antes = cadena(sigla, function (s) { return cursos[s] && cursos[s].req; });
    var despues = cadena(sigla, function (s) { return abre[s]; });
    malla.classList.add("hay-seleccion");
    Object.keys(boton).forEach(function (s) {
      var b = boton[s];
      b.classList.toggle("es-activo", s === sigla);
      b.classList.toggle("es-req", !!antes[s]);
      b.classList.toggle("es-abre", !!despues[s]);
      b.setAttribute("aria-pressed", s === sigla ? "true" : "false");
    });
    mostrar(cursos[sigla]);
    cerrar.hidden = false;
    panel.classList.add("abierto");
    dibujar(sigla, antes, despues);
    if (enfocar) boton[sigla].focus();
  }
  function limpiar() {
    actual = null;
    malla.classList.remove("hay-seleccion");
    Object.keys(boton).forEach(function (s) { boton[s].classList.remove("es-activo", "es-req", "es-abre"); boton[s].setAttribute("aria-pressed", "false"); });
    detalle.innerHTML = inicial;
    cerrar.hidden = true;
    panel.classList.remove("abierto");
    while (svg.lastChild && svg.lastChild.nodeName !== "defs") svg.removeChild(svg.lastChild);
  }

  // Flechas de la ruta: de cada requisito al curso que lo pide, solo dentro de la cadena elegida
  function dibujar(sigla, antes, despues) {
    while (svg.lastChild && svg.lastChild.nodeName !== "defs") svg.removeChild(svg.lastChild);
    if (!sigla) return;
    var base = malla.getBoundingClientRect();
    svg.setAttribute("width", malla.scrollWidth); svg.setAttribute("height", malla.scrollHeight);
    function caja(s) { var r = boton[s].getBoundingClientRect(); return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }; }
    function flecha(de, a, tipo) {
      var p = caja(de), q = caja(a), d;
      if (q.y > p.y + p.h - 4) {           // en una fila posterior: de abajo hacia arriba
        var x1 = p.x + p.w / 2, y1 = p.y + p.h, x2 = q.x + q.w / 2, y2 = q.y - 2, k = Math.max(24, (y2 - y1) / 2);
        d = "M" + x1 + " " + y1 + " C" + x1 + " " + (y1 + k) + " " + x2 + " " + (y2 - k) + " " + x2 + " " + y2;
      } else {                             // en la misma fila: de lado a lado
        var a1 = p.x + p.w, b1 = p.y + p.h / 2, a2 = q.x - 2, b2 = q.y + q.h / 2, j = Math.max(16, (a2 - a1) / 2);
        d = "M" + a1 + " " + b1 + " C" + (a1 + j) + " " + b1 + " " + (a2 - j) + " " + b2 + " " + a2 + " " + b2;
      }
      var el = document.createElementNS(NS, "path");
      el.setAttribute("d", d); el.setAttribute("class", "linea linea--" + tipo); el.setAttribute("marker-end", "url(#flecha-" + tipo + ")");
      svg.appendChild(el);
    }
    var enRuta = {}; enRuta[sigla] = true;
    Object.keys(antes).forEach(function (s) { enRuta[s] = true; });
    Object.keys(enRuta).forEach(function (s) { (cursos[s].req || []).forEach(function (r) { if (antes[r]) flecha(r, s, "req"); }); });
    var adelante = {}; adelante[sigla] = true;
    Object.keys(despues).forEach(function (s) { adelante[s] = true; });
    Object.keys(despues).forEach(function (s) { (cursos[s].req || []).forEach(function (r) { if (adelante[r]) flecha(r, s, "abre"); }); });
  }

  malla.addEventListener("click", function (e) { var b = e.target.closest(".curso"); if (b) elegir(b.dataset.sigla); });
  panel.addEventListener("click", function (e) { var b = e.target.closest("[data-ir]"); if (b) { actual = null; elegir(b.dataset.ir, true); } });
  cerrar.addEventListener("click", function () { var s = actual; limpiar(); if (s) boton[s].focus(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && actual) { var s = actual; limpiar(); boton[s].focus(); } });
  var espera;
  window.addEventListener("resize", function () { clearTimeout(espera); espera = setTimeout(function () { if (actual) { var s = actual; actual = null; elegir(s); } }, 120); });

  // Resaltar un área (los botones de la leyenda)
  document.querySelectorAll(".malla-area").forEach(function (b) {
    b.addEventListener("click", function () {
      var on = b.getAttribute("aria-pressed") !== "true";
      document.querySelectorAll(".malla-area").forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", on ? "true" : "false");
      malla.dataset.area = on ? b.dataset.area : "";
    });
  });
})();
