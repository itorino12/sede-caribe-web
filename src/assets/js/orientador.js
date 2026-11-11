/* Orientador de carreras (estudiar.html). Sin dependencias.
   Datos: <script type="application/json" id="orientador-datos"> (src/data/orientador.json + carreras publicadas).
   La puntuación usa la similitud del coseno entre lo que marcó la persona y el perfil de cada carrera,
   para que las carreras con más rasgos no tengan ventaja sobre las más específicas. */
(function () {
  "use strict";

  /* sel: {rasgo: puntos}. Devuelve las carreras ordenadas de mayor a menor coincidencia. */
  function puntuar(datos, sel) {
    var rasgos = Object.keys(datos.rasgos);
    var normaU = Math.sqrt(rasgos.reduce(function (s, r) { return s + Math.pow(sel[r] || 0, 2); }, 0));
    return datos.carreras.map(function (c, orden) {
      var perfil = datos.perfiles[c.id] || {};
      var punto = 0, normaW = 0;
      rasgos.forEach(function (r) { punto += (sel[r] || 0) * (perfil[r] || 0); normaW += Math.pow(perfil[r] || 0, 2); });
      var coseno = normaU && normaW ? punto / (normaU * Math.sqrt(normaW)) : 0;
      var coinciden = rasgos.filter(function (r) { return (sel[r] || 0) > 0 && (perfil[r] || 0) >= 2; })
        .sort(function (a, b) { return (sel[b] * perfil[b]) - (sel[a] * perfil[a]); });
      return { carrera: c, coseno: coseno, punto: punto, orden: orden, coinciden: coinciden };
    }).sort(function (a, b) { return (b.coseno - a.coseno) || (b.punto - a.punto) || (a.orden - b.orden); });
  }

  if (typeof module !== "undefined" && module.exports) { module.exports = { puntuar: puntuar }; }
  if (typeof document === "undefined") { return; }

  var form = document.getElementById("orientador");
  var datosEl = document.getElementById("orientador-datos");
  if (!form || !datosEl) { return; }
  var datos = JSON.parse(datosEl.textContent);
  var aviso = document.getElementById("orientador-aviso");
  var avance = document.getElementById("orientador-avance");
  var resultado = document.getElementById("orientador-resultado");
  var gustos = form.querySelectorAll('input[name="gusto"]');
  var preguntas = form.querySelectorAll("fieldset[data-pregunta]");

  function lista(r) { return r.length > 1 ? r.slice(0, -1).join(", ") + " y " + r[r.length - 1] : r[0]; }
  function rasgosDe(el) { return (el.getAttribute("data-r") || "").split(" ").filter(Boolean); }
  function el(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) { n.className = clase; }
    if (texto) { n.textContent = texto; }
    return n;
  }

  function estado() {
    var marcados = form.querySelectorAll('input[name="gusto"]:checked').length;
    var respondidas = 0;
    preguntas.forEach(function (p) { if (p.querySelector("input:checked")) { respondidas++; } });
    return { marcados: marcados, respondidas: respondidas, total: preguntas.length };
  }

  function actualizarAvance() {
    var s = estado();
    avance.textContent = "Ha marcado " + s.marcados + " " + (s.marcados === 1 ? "gusto" : "gustos") +
      " y respondido " + s.respondidas + " de " + s.total + " preguntas.";
  }

  function seleccion() {
    var sel = {};
    function sumar(input, peso) { rasgosDe(input).forEach(function (r) { sel[r] = (sel[r] || 0) + peso; }); }
    form.querySelectorAll('input[name="gusto"]:checked').forEach(function (i) { sumar(i, datos.pesos.gusto); });
    preguntas.forEach(function (p) { var i = p.querySelector("input:checked"); if (i) { sumar(i, datos.pesos.escenario); } });
    return sel;
  }

  function mostrarAviso(mensaje, enfocar) {
    aviso.textContent = mensaje;
    aviso.hidden = false;
    if (enfocar) { enfocar.focus(); }
  }

  function tarjeta(r, posicion) {
    var c = r.carrera;
    var li = el("li", "orientador__carrera" + (posicion === 0 ? " orientador__carrera--primera" : ""));
    li.appendChild(el("p", "orientador__puesto", posicion === 0 ? "Es la que más se acerca a usted" : posicion === 1 ? "También le puede interesar" : "Otra opción para mirar"));
    var h = el("h3", "orientador__nombre");
    var a = el("a", "", c.nombre);
    a.href = c.url;
    h.appendChild(a);
    li.appendChild(h);
    li.appendChild(el("p", "orientador__grado", c.grados + " · " + c.area));
    var porque = r.coinciden.slice(0, 3).map(function (k) { return datos.rasgos[k]; });
    li.appendChild(el("p", "orientador__porque", porque.length
      ? "Coincide con lo que usted marcó sobre " + lista(porque) + "."
      : "Se acerca a sus respuestas en conjunto, aunque ningún gusto suyo coincide de lleno con ella."));
    var enlaces = el("p", "orientador__enlaces");
    var ficha = el("a", "", "Conocer la carrera");
    ficha.href = c.url;
    enlaces.appendChild(ficha);
    if (c.plan) {
      var plan = el("a", "", "Ver el plan de estudios");
      plan.href = c.plan;
      plan.target = "_blank";
      plan.rel = "noopener";
      plan.appendChild(el("span", "oculto", " (se abre en una pestaña nueva)"));
      enlaces.appendChild(plan);
    }
    li.appendChild(enlaces);
    return li;
  }

  function mostrarResultado(res) {
    var cont = resultado.querySelector("[data-lista]");
    cont.textContent = "";
    res.slice(0, 3).forEach(function (r, i) { cont.appendChild(tarjeta(r, i)); });
    form.hidden = true;
    resultado.hidden = false;
    var t = resultado.querySelector("h2");
    t.focus();
    resultado.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  form.addEventListener("change", function () { aviso.hidden = true; actualizarAvance(); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var s = estado();
    var falta = [];
    if (s.marcados < datos.minimo_gustos) { falta.push("marque al menos " + datos.minimo_gustos + " gustos (lleva " + s.marcados + ")"); }
    if (s.respondidas < s.total) { falta.push("responda las " + s.total + " preguntas (lleva " + s.respondidas + ")"); }
    if (falta.length) {
      var primero = s.marcados < datos.minimo_gustos ? form.querySelector("fieldset[data-gustos]") :
        Array.prototype.find.call(preguntas, function (p) { return !p.querySelector("input:checked"); });
      mostrarAviso("Para ver su resultado, " + falta.join(" y ") + ".", primero);
      return;
    }
    mostrarResultado(puntuar(datos, seleccion()));
  });

  resultado.querySelector("[data-cambiar]").addEventListener("click", function () {
    resultado.hidden = true;
    form.hidden = false;
    form.querySelector("fieldset[data-gustos]").focus();
  });

  resultado.querySelector("[data-reiniciar]").addEventListener("click", function () {
    form.reset();
    actualizarAvance();
    resultado.hidden = true;
    form.hidden = false;
    aviso.hidden = true;
    form.querySelector("fieldset[data-gustos]").focus();
  });

  actualizarAvance();
})();
