/* Proponer horarios: el estudiante elige los cursos que quiere llevar y el sitio busca las combinaciones de grupos
   sin choques. Un grupo con teoría y práctica (901 y 951) es una sola unidad: entra completo. Todo se calcula en el
   navegador, con los mismos datos de la página. «Usar esta opción» la carga en «Mi horario» (horario-personal.js). */
(function () {
  "use strict";
  var api = window.sedeHorario;
  if (!api) return;
  var ABR = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  var MAX_CURSOS = 10, MOSTRAR = 5, TOPE_COMBOS = 50000, TOPE_NODOS = 1500000;
  var grupos = api.grupos, porCurso = api.porCurso;
  var LLAVE = "sede-propuesta-" + api.clave;
  var norm = function (t) { return (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
  var plural = function (n, uno, varios) { return n + " " + (n === 1 ? uno : varios); };

  // cursos con al menos una unidad abierta y con horario
  var cursos = {};
  Object.keys(porCurso).forEach(function (s) {
    var us = porCurso[s].filter(function (k) { return !grupos[k].cerrado && grupos[k].franjas.length; });
    if (us.length) cursos[s] = { sigla: s, nombre: grupos[us[0]].nombre, unidades: us };
  });
  var todas = Object.keys(cursos).sort();
  if (!todas.length) return;

  var elegidos = [];
  var orden = "dias";
  try {
    var g0 = JSON.parse(localStorage.getItem(LLAVE) || "[]");
    if (Array.isArray(g0)) elegidos = g0.filter(function (s) { return cursos[s]; }).slice(0, MAX_CURSOS);
  } catch (e) { /* sin almacenamiento: no se recuerda */ }
  function guardar() { try { localStorage.setItem(LLAVE, JSON.stringify(elegidos)); } catch (e) { /* nada */ } }

  /* ---------- cálculo ---------- */
  var memo = {};
  function chocan(a, b) {
    var k = a < b ? a + "~" + b : b + "~" + a;
    if (memo[k] !== undefined) return memo[k];
    var r = grupos[a].franjas.some(function (fa) {
      return grupos[b].franjas.some(function (fb) {
        return fa.d.some(function (d) { return fb.d.indexOf(d) >= 0; }) && fa.i < fb.f && fb.i < fa.f;
      });
    });
    return (memo[k] = r);
  }
  function metricas(claves) {
    var porDia = {};
    claves.forEach(function (k) {
      grupos[k].franjas.forEach(function (f) { f.d.forEach(function (d) { (porDia[d] = porDia[d] || []).push([f.i, f.f]); }); });
    });
    var dias = 0, huecos = 0, inicios = 0, fin = 0;
    Object.keys(porDia).forEach(function (d) {
      var v = porDia[d].sort(function (a, b) { return a[0] - b[0]; });
      dias++; inicios += v[0][0];
      for (var i = 1; i < v.length; i++) huecos += Math.max(0, v[i][0] - v[i - 1][1]);
      v.forEach(function (x) { fin = Math.max(fin, x[1]); });
    });
    return { claves: claves, dias: dias, dias_lista: Object.keys(porDia).map(Number).sort(), huecos: huecos, inicio: dias ? inicios / dias : 0, fin: fin };
  }
  var CLAVES = {
    dias: function (m) { return [m.dias, m.huecos, m.fin]; },
    huecos: function (m) { return [m.huecos, m.dias, m.fin]; },
    tarde: function (m) { return [-m.inicio, m.dias, m.huecos]; }
  };
  function menor(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return false; }

  // soloExiste: parar en la primera combinación (para diagnosticar)
  function resolver(siglas, criterio, soloExiste) {
    var listas = siglas.map(function (s) { return cursos[s].unidades; }).sort(function (a, b) { return a.length - b.length; });
    var res = { total: 0, tope: false, mejores: [] }, actual = [], nodos = 0, clave = CLAVES[criterio];
    (function dfs(i) {
      if (res.tope || (soloExiste && res.total)) return;
      if (i === listas.length) {
        res.total++;
        if (!soloExiste) {
          var m = metricas(actual.slice()); m.k = clave(m);
          var pos = res.mejores.length;
          while (pos > 0 && menor(m.k, res.mejores[pos - 1].k)) pos--;
          if (pos < MOSTRAR) { res.mejores.splice(pos, 0, m); if (res.mejores.length > MOSTRAR) res.mejores.pop(); }
        }
        if (res.total >= TOPE_COMBOS) res.tope = true;
        return;
      }
      for (var j = 0; j < listas[i].length; j++) {
        var u = listas[i][j];
        if (++nodos > TOPE_NODOS) { res.tope = true; return; }
        if (actual.every(function (v) { return !chocan(u, v); })) { actual.push(u); dfs(i + 1); actual.pop(); }
      }
    })(0);
    return res;
  }

  /* ---------- pantalla ---------- */
  function h(tag, atr, hijos) {
    var n = document.createElement(tag);
    Object.keys(atr || {}).forEach(function (a) { if (a === "texto") n.textContent = atr[a]; else n.setAttribute(a, atr[a]); });
    (hijos || []).forEach(function (c) { n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  var dlg = h("dialog", { "class": "hm hp", "aria-labelledby": "hp-titulo" });
  var entrada = h("input", { type: "search", id: "hp-q", autocomplete: "off", placeholder: "Sigla o nombre, p. ej. IF0004 o programación" });
  var sugerencias = h("ul", { "class": "hp__sug" });
  var chips = h("ul", { "class": "hp__elegidos" });
  var estado = h("p", { "class": "hm__estado", role: "status" });
  var opciones = h("ol", { "class": "hp__opciones" });
  var cerrarB = h("button", { type: "button", "class": "hm-boton" }, ["Cerrar"]);
  var filaOrden = h("fieldset", { "class": "hp__orden" }, [h("legend", { texto: "Ordenar las opciones por" })]);
  [["dias", "Menos días en el campus"], ["huecos", "Menos huecos entre lecciones"], ["tarde", "Empezar más tarde"]].forEach(function (o) {
    var r = h("input", { type: "radio", name: "hp-orden", value: o[0] });
    if (o[0] === orden) r.checked = true;
    r.addEventListener("change", function () { orden = o[0]; calcular(); });
    filaOrden.appendChild(h("label", {}, [r, " " + o[1]]));
  });
  dlg.appendChild(h("div", { "class": "hm__cab" }, [h("h2", { id: "hp-titulo", texto: "Proponer horarios" }), cerrarB]));
  dlg.appendChild(h("p", { "class": "hm__aviso", texto: "Elija los cursos que quiere llevar y se buscan las combinaciones de grupos sin choques. Los grupos con teoría y práctica (por ejemplo 901 y 951) van siempre juntos y los grupos cerrados no se incluyen. Es una ayuda para planear, no una matrícula: confirme con su carrera o con Registro." }));
  dlg.appendChild(h("form", { "class": "hp__buscar", role: "search" }, [h("label", { "for": "hp-q", texto: "Agregar un curso" }), entrada, sugerencias]));
  dlg.appendChild(h("h3", { "class": "hm__sub", texto: "Cursos elegidos" }));
  dlg.appendChild(chips);
  dlg.appendChild(filaOrden);
  dlg.appendChild(estado);
  dlg.appendChild(opciones);
  document.body.appendChild(dlg);

  function pintarSugerencias() {
    var q = norm(entrada.value).split(/\s+/).filter(Boolean);
    sugerencias.replaceChildren();
    if (!q.length) return;
    var pat = q.map(function (p) { return new RegExp("(^|[^a-z0-9])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); });
    var hallados = todas.filter(function (s) {
      if (elegidos.indexOf(s) >= 0) return false;
      var pajar = norm(s + " " + cursos[s].nombre);
      return pat.every(function (re) { return re.test(pajar); });
    }).slice(0, 8);
    hallados.forEach(function (s) {
      var b = h("button", { type: "button", "data-sigla": s }, [h("strong", { texto: s }), " " + cursos[s].nombre + " · " + plural(cursos[s].unidades.length, "opción de grupo", "opciones de grupo")]);
      sugerencias.appendChild(h("li", {}, [b]));
    });
    if (!hallados.length) sugerencias.appendChild(h("li", { "class": "hp__vacio", texto: "Ningún curso con grupos abiertos coincide." }));
  }
  function pintarChips() {
    chips.replaceChildren();
    if (!elegidos.length) { chips.appendChild(h("li", { "class": "hp__vacio", texto: "Aún no ha elegido cursos." })); return; }
    elegidos.forEach(function (s) {
      var q = h("button", { type: "button", "class": "hm-boton", "data-quitar": s, "aria-label": "Quitar " + s + " " + cursos[s].nombre }, ["Quitar"]);
      chips.appendChild(h("li", {}, [h("span", {}, [h("strong", { texto: s }), " " + cursos[s].nombre]), q]));
    });
  }
  var hhmm = api.hhmm;
  function tarjeta(m, n) {
    var li = h("li", { "class": "hp__op" });
    li.appendChild(h("p", { "class": "hp__res" }, [h("strong", { texto: "Opción " + n }),
      " · " + plural(m.dias, "día", "días") + " (" + m.dias_lista.map(function (d) { return ABR[d]; }).join(", ") + ")" +
      " · huecos entre lecciones: " + (m.huecos ? api.duracion(m.huecos) : "ninguno") + " · termina a las " + hhmm(m.fin)]));
    var ul = h("ul", { "class": "hp__det" });
    m.claves.slice().sort().forEach(function (k) {
      var g = grupos[k];
      ul.appendChild(h("li", {}, [h("strong", { texto: g.sigla }), " " + g.nombre + " · " + (g.nums.length > 1 ? "Grupos " : "Grupo ") + api.numeros(g) + " · " + api.textoFranjas(g)]));
    });
    li.appendChild(ul);
    var usar = h("button", { type: "button", "class": "hm-boton hm-boton--fuerte", "data-usar": String(n - 1) },
      ["Usar esta opción" + (api.actual().length ? " (reemplaza su horario actual)" : "")]);
    li.appendChild(usar);
    return li;
  }
  var ultima = [];
  function diagnostico() {
    var partes = [];
    for (var i = 0; i < elegidos.length; i++) for (var j = i + 1; j < elegidos.length; j++) {
      var a = cursos[elegidos[i]].unidades, b = cursos[elegidos[j]].unidades;
      if (a.every(function (x) { return b.every(function (y) { return chocan(x, y); }); }))
        partes.push(elegidos[i] + " y " + elegidos[j] + " chocan en todos sus grupos abiertos, así que no se pueden llevar juntos este ciclo.");
    }
    if (!partes.length && elegidos.length > 2) {
      var libres = elegidos.filter(function (c) {
        return resolver(elegidos.filter(function (x) { return x !== c; }), "dias", true).total > 0;
      });
      partes.push(libres.length
        ? "Sin " + libres.join(" o sin ") + " sí hay combinación."
        : "Ningún curso, por sí solo, es el problema: pruebe quitando dos.");
    }
    return partes.join(" ");
  }
  function calcular() {
    pintarChips(); guardar();
    opciones.replaceChildren(); ultima = [];
    if (elegidos.length < 2) { estado.textContent = elegidos.length ? "Agregue al menos otro curso para buscar combinaciones." : ""; return; }
    var r = resolver(elegidos, orden, false);
    if (!r.total) {
      estado.textContent = "No hay ninguna combinación sin choques. " + diagnostico();
      return;
    }
    ultima = r.mejores;
    estado.textContent = (r.tope ? "Hay más de " + TOPE_COMBOS.toLocaleString("es-CR") + " combinaciones sin choques; " : "Hay " + plural(r.total, "combinación", "combinaciones") + " sin choques; ") +
      "se muestran las " + (r.mejores.length === 1 ? "única" : r.mejores.length + " mejores") + " según el orden elegido.";
    r.mejores.forEach(function (m, i) { opciones.appendChild(tarjeta(m, i + 1)); });
  }

  entrada.addEventListener("input", pintarSugerencias);
  entrada.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); var b = sugerencias.querySelector("button"); if (b) b.click(); }
    else if (e.key === "ArrowDown" && sugerencias.querySelector("button")) { e.preventDefault(); sugerencias.querySelector("button").focus(); }
  });
  sugerencias.addEventListener("keydown", function (e) {
    var bs = Array.prototype.slice.call(sugerencias.querySelectorAll("button")), i = bs.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && bs[i + 1]) { e.preventDefault(); bs[i + 1].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); (bs[i - 1] || entrada).focus(); }
  });
  dlg.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    if (b.hasAttribute("data-sigla")) {
      if (elegidos.length >= MAX_CURSOS) { estado.textContent = "Puede comparar hasta " + MAX_CURSOS + " cursos a la vez."; return; }
      elegidos.push(b.getAttribute("data-sigla")); entrada.value = ""; pintarSugerencias(); calcular(); entrada.focus();
    } else if (b.hasAttribute("data-quitar")) {
      elegidos = elegidos.filter(function (s) { return s !== b.getAttribute("data-quitar"); }); calcular(); entrada.focus();
    } else if (b.hasAttribute("data-usar")) {
      var m = ultima[Number(b.getAttribute("data-usar"))];
      if (!m) return;
      dlg.close();
      api.aplicar(m.claves, "Se cargó la opción " + (Number(b.getAttribute("data-usar")) + 1) + " propuesta. Puede ajustarla a mano.");
    }
  });
  cerrarB.addEventListener("click", function () { dlg.close(); });

  function abrir() {
    if (!elegidos.length) elegidos = api.actual().map(function (k) { return grupos[k].sigla; }).filter(function (s, i, a) { return cursos[s] && a.indexOf(s) === i; });
    calcular();
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    entrada.focus();
  }
  var ayuda = document.querySelector(".hm-ayuda");
  if (ayuda) {
    var boton = h("button", { type: "button", "class": "hm-boton hm-boton--fuerte", "data-hp-abrir": "" }, ["Proponer horarios sin choques"]);
    boton.addEventListener("click", abrir);
    ayuda.insertAdjacentElement("afterend", h("p", { "class": "hz-intro hp-entrada" }, [boton, " Elija los cursos que quiere llevar y se buscan las combinaciones que no chocan."]));
  }
})();
