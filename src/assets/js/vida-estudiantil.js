/* Pestaña «Vida estudiantil»: buscador de servicios, fechas clave con estado, trámites en pestañas,
   agenda semanal y preguntas. Sin JavaScript todo queda visible en una sola página. */
(function () {
  "use strict";
  var raiz = document.querySelector("[data-ve]");
  if (!raiz) return;
  raiz.classList.add("ve--js");
  var $ = function (s, c) { return (c || raiz).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || raiz).querySelectorAll(s)); };
  var normal = function (t) { return (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function dia(txt) { var p = txt.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var hoy = new Date(); hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  function entre(a, b) { return Math.round((b - a) / 864e5); }
  function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

  // ---------- buscador de servicios
  var tarjetas = $$(".ve-serv"), q = $("[data-ve-q]"), cats = $("[data-ve-cats]"), estado = $("[data-ve-estado]"), cat = "";
  function filtrar() {
    var t = normal(q.value.trim()).split(/\s+/).filter(Boolean), n = 0;
    tarjetas.forEach(function (c) {
      var texto = normal(c.dataset.texto), ok = (!cat || c.dataset.cat === cat) && t.every(function (w) { return texto.indexOf(w) > -1; });
      c.hidden = !ok; if (ok) n++;
    });
    estado.textContent = (q.value.trim() || cat) ? (n ? plural(n, "servicio encontrado", "servicios encontrados") : "Nada coincide. Llame a la central, 2511-7300, y le comunican con la oficina.") : "";
  }
  q.addEventListener("input", filtrar);
  $$("button", cats).forEach(function (b) {
    b.addEventListener("click", function () {
      cat = b.dataset.valor;
      $$("button", cats).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      filtrar();
    });
  });
  var pedido = new URLSearchParams(location.search).get("buscar");
  if (pedido) { q.value = pedido; filtrar(); }

  // ---------- fechas clave
  var fechas = $$(".ve-fecha").map(function (li) {
    return { li: li, desde: dia(li.dataset.desde), hasta: dia(li.dataset.hasta), titulo: li.dataset.titulo, detalle: li.dataset.detalle, id: li.dataset.id };
  });
  var pasadas = $("[data-ve-pasadas]");
  fechas.forEach(function (f) {
    var e = $("[data-estado]", f.li), antes = entre(hoy, f.desde), resta = entre(hoy, f.hasta);
    if (resta < 0) { f.tipo = "paso"; e.textContent = "Ya pasó"; }
    else if (antes > 0) { f.tipo = "viene"; e.textContent = antes === 1 ? "Empieza mañana" : "Empieza en " + plural(antes, "día", "días"); }
    else { f.tipo = "curso"; e.textContent = resta === 0 ? "Termina hoy" : "En curso, quedan " + plural(resta, "día", "días"); }
    f.li.dataset.estado = f.tipo;
  });
  function mostrarPasadas() { fechas.forEach(function (f) { f.li.hidden = f.tipo === "paso" && !pasadas.checked; }); }
  pasadas.addEventListener("change", mostrarPasadas); mostrarPasadas();

  // tarjeta «lo que sigue»: lo que está en curso (primero lo que vence antes) y luego lo que viene
  var vigentes = fechas.filter(function (f) { return f.tipo !== "paso"; }).sort(function (a, b) {
    return (a.tipo === b.tipo ? (a.tipo === "curso" ? a.hasta - b.hasta : a.desde - b.desde) : (a.tipo === "curso" ? -1 : 1));
  }).slice(0, 3);
  var prox = $("[data-ve-proximo]");
  if (vigentes.length) {
    var h = '<h2>Lo que sigue</h2><ul>';
    vigentes.forEach(function (f) {
      var cuando = f.tipo === "curso" ? "Termina el " + f.hasta.getDate() + " de " + MESES[f.hasta.getMonth()] : "Empieza el " + f.desde.getDate() + " de " + MESES[f.desde.getMonth()];
      var n = f.tipo === "curso" ? entre(hoy, f.hasta) : entre(hoy, f.desde);
      h += '<li><a href="#' + f.id + '"><strong>' + (n === 0 ? "Hoy" : n + "<small>" + (n === 1 ? "día" : "días") + "</small>") + '</strong><span class="ve__que">' + f.titulo + '<small>' + cuando + '</small></span></a></li>';
    });
    prox.innerHTML = h + "</ul>"; prox.hidden = false;
    $$("a", prox).forEach(function (a) { a.addEventListener("click", function () {
      var f = fechas.filter(function (x) { return "#" + x.id === a.getAttribute("href"); })[0];
      if (f) { f.li.hidden = false; f.li.id = f.id; }
    }); });
  }
  fechas.forEach(function (f) { f.li.id = f.id; });

  // «Agregar a mi calendario»: archivo .ics con las fechas que aún no pasan
  function ics(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
  function ymd(d) { return d.getFullYear() + ("0" + (d.getMonth() + 1)).slice(-2) + ("0" + d.getDate()).slice(-2); }
  $("[data-ve-ics]").addEventListener("click", function () {
    var sello = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    var l = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UCR Sede del Caribe//Vida estudiantil//ES", "CALSCALE:GREGORIAN"];
    fechas.filter(function (f) { return f.tipo !== "paso"; }).forEach(function (f) {
      var fin = new Date(f.hasta.getFullYear(), f.hasta.getMonth(), f.hasta.getDate() + 1);
      l.push("BEGIN:VEVENT", "UID:" + f.id + "@sedecaribe.ucr.ac.cr", "DTSTAMP:" + sello, "DTSTART;VALUE=DATE:" + ymd(f.desde), "DTEND;VALUE=DATE:" + ymd(fin),
        "SUMMARY:" + ics(f.titulo), "DESCRIPTION:" + ics(f.detalle + " Confirme en las páginas oficiales de la UCR."), "END:VEVENT");
    });
    l.push("END:VCALENDAR");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([l.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
    a.download = "fechas-vida-estudiantil.ics"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  });

  // ---------- trámites en pestañas
  var rutas = $$(".ve-ruta"), cont = $("[data-ve-rutas]");
  if (rutas.length > 1) {
    var lista = document.createElement("div");
    lista.className = "ve__pestanas"; lista.setAttribute("role", "tablist"); lista.setAttribute("aria-label", "Trámites");
    var tabs = rutas.map(function (r, i) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "tab"); b.id = "tab-" + r.id; b.setAttribute("aria-controls", r.id); b.textContent = r.dataset.nombre;
      r.setAttribute("role", "tabpanel"); r.setAttribute("aria-labelledby", b.id);
      b.addEventListener("click", function () { ir(i); });
      b.addEventListener("keydown", function (e) {
        var d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (d) { e.preventDefault(); ir((i + d + tabs.length) % tabs.length); tabs[(i + d + tabs.length) % tabs.length].focus(); }
      });
      lista.appendChild(b); return b;
    });
    function ir(n) {
      rutas.forEach(function (r, i) { r.hidden = i !== n; tabs[i].setAttribute("aria-selected", i === n); tabs[i].tabIndex = i === n ? 0 : -1; });
    }
    cont.insertBefore(lista, cont.firstChild);
    var h0 = location.hash.replace("#ruta-", ""), ini = rutas.map(function (r) { return r.id; }).indexOf("ruta-" + h0);
    ir(ini > -1 ? ini : 0);
    window.addEventListener("hashchange", function () {
      var i = rutas.map(function (r) { return "#" + r.id; }).indexOf(location.hash); if (i > -1) ir(i);
    });
  }

  // ---------- agenda semanal
  var dias = $("[data-ve-dias]"), acts = $$(".ve-act"), estAct = $("[data-ve-estado-act]");
  var hoyN = ((new Date().getDay() + 6) % 7) + 1;
  acts.forEach(function (a) {
    if (a.dataset.dias.split(",").indexOf(String(hoyN)) > -1) { a.classList.add("ve-act--hoy"); a.querySelector("h3").insertAdjacentHTML("beforeend", ' <span class="ve-act__hoy">Hoy</span>'); }
  });
  $$("button", dias).forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.dataset.valor, n = 0;
      $$("button", dias).forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      acts.forEach(function (a) { var ok = !v || a.dataset.dias.split(",").indexOf(v) > -1; a.hidden = !ok; if (ok) n++; });
      estAct.textContent = v ? (n ? plural(n, "actividad", "actividades") + " ese día." : "No hay actividades publicadas ese día.") : "";
    });
  });

  // ---------- preguntas frecuentes
  var det = $$("details", $("[data-ve-preguntas]")), todas = $("[data-ve-abrir]");
  todas.addEventListener("click", function () {
    var abrir = det.some(function (d) { return !d.open; });
    det.forEach(function (d) { d.open = abrir; });
    todas.textContent = abrir ? "Cerrar todas" : "Abrir todas";
  });
})();
