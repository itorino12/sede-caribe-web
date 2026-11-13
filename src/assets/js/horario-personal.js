/* Armador de horario personal (horarios.html y horarios-<ciclo>.html).
   Agrega a cada grupo un botón «Agregar a mi horario», detecta choques, dibuja la semana y deja copiar el enlace, copiar
   como texto o imprimir. Todo ocurre en el navegador: lo elegido se guarda solo en este equipo (localStorage) y nunca
   se envía a ningún servidor. Un enlace compartido lleva los grupos en la parte # de la dirección. */
(function () {
  "use strict";

  var DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  var ABR = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  // Todos con contraste ≥ 4,5:1 contra el texto blanco.
  var COLORES = ["#005DA4", "#7A3E9D", "#B3541E", "#1E7A4F", "#A32D5B", "#5B6B00", "#0F6F7A", "#8A4B00"];
  var HORA_PX = 2.4; // rem por hora en el cuadro

  var raiz = document.querySelector("[data-hm]");
  if (!raiz) return;
  var el = function (sel) { return raiz.querySelector(sel); };
  var barra = document.querySelector("[data-hm-barra]");
  var clavePagina = (document.currentScript && document.currentScript.getAttribute("data-clave")) || "ciclo";
  var LLAVE = "sede-horario-" + clavePagina;

  /* ---------- Datos: se leen del propio HTML de la página ---------- */
  var grupos = {};   // "SIGLA|GRUPO" -> {clave, sigla, nombre, grupo, etiquetas, franjas, lis, aulas}
  var porCurso = {}; // sigla -> [claves]

  function leerFranjas(cod) {
    return cod.split(";").filter(Boolean).map(function (t) {
      var p = t.split("|");
      return { d: p[0].split(",").map(Number), i: +p[1], f: +p[2], aula: p[3] || "" };
    }).filter(function (x) { return x.d.length && x.f > x.i; });
  }

  Array.prototype.forEach.call(document.querySelectorAll(".hz-grupo[data-g]"), function (li) {
    var clave = li.getAttribute("data-g");
    var g = grupos[clave];
    if (!g) {
      var partes = clave.split("|");
      var curso = li.closest(".hz-curso");
      var h4 = curso && curso.querySelector(".hz-curso__nombre");
      var nombre = h4 ? h4.textContent.replace(partes[0], "").replace(/\s+/g, " ").trim() : partes[0];
      var etq = Array.prototype.map.call(li.querySelectorAll(".hz-etiqueta"), function (x) { return x.textContent.trim(); });
      g = grupos[clave] = {
        clave: clave, sigla: partes[0], grupo: partes[1], nombre: nombre, etiquetas: etq,
        cerrado: etq.indexOf("Cerrado") >= 0, franjas: leerFranjas(li.getAttribute("data-cod") || ""), lis: [], aulas: {}
      };
      (porCurso[partes[0]] = porCurso[partes[0]] || []).push(clave);
    }
    g.lis.push(li);
    Array.prototype.forEach.call(li.querySelectorAll("a.hz-aula"), function (a) {
      var m = /Aula\s+(\S+)/.exec(a.textContent);
      if (m) g.aulas[m[1]] = a.getAttribute("href");
    });
  });
  if (!Object.keys(grupos).length) return;

  /* ---------- Estado ---------- */
  var sel = [];          // claves elegidas, en orden de llegada
  var compartido = false; // se abrió un enlace compartido y aún no se modificó: no se guarda
  var aviso = "";

  function leerGuardado() {
    try { return JSON.parse(localStorage.getItem(LLAVE) || "[]"); } catch (e) { return []; }
  }
  function guardar() {
    if (compartido) return;
    try { localStorage.setItem(LLAVE, JSON.stringify(sel)); } catch (e) { /* sin almacenamiento: sigue funcionando */ }
  }
  function validas(lista) {
    var vistos = {}, salida = [];
    (Array.isArray(lista) ? lista : []).forEach(function (k) {
      if (typeof k === "string" && grupos[k] && !grupos[k].cerrado && !vistos[grupos[k].sigla]) {
        vistos[grupos[k].sigla] = 1; salida.push(k);
      }
    });
    return salida;
  }
  function desdeHash() {
    var m = /^#mi=([^&]*)/.exec(location.hash);
    if (!m) return null;
    var lista = m[1].split(",").map(function (t) {
      var i = t.lastIndexOf("-");
      return i > 0 ? decodeURIComponent(t.slice(0, i)) + "|" + decodeURIComponent(t.slice(i + 1)) : "";
    });
    return validas(lista);
  }
  function enlace() {
    var h = sel.map(function (k) { return encodeURIComponent(grupos[k].sigla) + "-" + encodeURIComponent(grupos[k].grupo); }).join(",");
    return location.origin + location.pathname + (h ? "#mi=" + h : "");
  }

  /* ---------- Cálculo ---------- */
  function bloques() {
    var salida = [];
    sel.forEach(function (k, n) {
      grupos[k].franjas.forEach(function (f) {
        f.d.forEach(function (d) { salida.push({ clave: k, color: n % COLORES.length, d: d, i: f.i, f: f.f, aula: f.aula }); });
      });
    });
    return salida;
  }
  function choques(bs) {
    var salida = [], vistos = {};
    for (var a = 0; a < bs.length; a++) {
      for (var b = a + 1; b < bs.length; b++) {
        var x = bs[a], y = bs[b];
        if (x.clave === y.clave || x.d !== y.d || !(x.i < y.f && y.i < x.f)) continue;
        var id = [x.clave, y.clave].sort().join("~") + "@" + x.d;
        if (vistos[id]) continue;
        vistos[id] = 1;
        salida.push({ a: x.clave, b: y.clave, d: x.d, i: Math.max(x.i, y.i), f: Math.min(x.f, y.f) });
      }
    }
    return salida;
  }
  function hhmm(m) { return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
  function duracion(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  }
  function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }
  function textoFranjas(g) {
    return g.franjas.map(function (f) {
      var dias = f.d.map(function (d) { return ABR[d]; });
      var d = dias.length === 1 ? dias[0] : dias.slice(0, -1).join(", ") + " y " + dias[dias.length - 1];
      return d + " " + hhmm(f.i) + "–" + hhmm(f.f) + (f.aula && f.aula !== "9999" ? " · Aula " + f.aula : "");
    }).join("; ");
  }
  function etiqueta(k) { return grupos[k].sigla + " grupo " + grupos[k].grupo; }

  /* ---------- Botones en cada grupo ---------- */
  Object.keys(grupos).forEach(function (k) {
    var g = grupos[k];
    g.lis.forEach(function (li) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "hm-agregar";
      b.setAttribute("data-hm-clave", k);
      if (g.cerrado) { b.disabled = true; b.textContent = "Grupo cerrado"; }
      li.appendChild(b);
    });
  });
  function pintarBotones() {
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k], on = sel.indexOf(k) >= 0;
      g.lis.forEach(function (li) {
        var b = li.querySelector(".hm-agregar");
        if (!b || g.cerrado) return;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.textContent = on ? "En mi horario ✓" : "Agregar a mi horario";
        b.setAttribute("aria-label", (on ? "Quitar " : "Agregar ") + etiqueta(k) + (on ? " de mi horario" : " a mi horario"));
      });
    });
  }
  var intro = document.querySelector(".hz-intro");
  if (intro) {
    var ayuda = document.createElement("p");
    ayuda.className = "hz-intro hm-ayuda";
    ayuda.textContent = "Para armar su horario, toque «Agregar a mi horario» en el grupo que quiera cursar. Se avisa si dos cursos chocan.";
    intro.insertAdjacentElement("afterend", ayuda);
  }

  /* ---------- Cuadro semanal ---------- */
  function dibujarCuadro(bs, enChoque) {
    var cuadro = el("[data-hm-cuadro]");
    cuadro.textContent = "";
    if (!bs.length) return;
    var dmax = Math.max.apply(null, bs.map(function (b) { return b.d; }));
    var ndias = Math.max(5, dmax + 1);
    var ini = Math.max(6, Math.min(8, Math.floor(Math.min.apply(null, bs.map(function (b) { return b.i; })) / 60)));
    var fin = Math.min(23, Math.max(17, Math.ceil(Math.max.apply(null, bs.map(function (b) { return b.f; })) / 60)));
    var horas = fin - ini, alto = (horas * HORA_PX) + "rem";
    cuadro.style.setProperty("--hm-dias", ndias);
    cuadro.style.setProperty("--hm-hora", HORA_PX + "rem");

    var cab = document.createElement("div"); cab.className = "hm-c__cab";
    cab.appendChild(document.createElement("span"));
    for (var d = 0; d < ndias; d++) { var s = document.createElement("span"); s.textContent = ABR[d]; cab.appendChild(s); }
    cuadro.appendChild(cab);

    var cuerpo = document.createElement("div"); cuerpo.className = "hm-c__cuerpo";
    var eje = document.createElement("div"); eje.className = "hm-c__eje"; eje.style.height = alto;
    for (var h = ini; h < fin; h++) {
      var t = document.createElement("span"); t.textContent = h + ":00";
      t.style.top = ((h - ini) / horas * 100) + "%";
      eje.appendChild(t);
    }
    cuerpo.appendChild(eje);

    for (var dia = 0; dia < ndias; dia++) {
      var col = document.createElement("div"); col.className = "hm-c__dia"; col.style.height = alto;
      var delDia = bs.filter(function (b) { return b.d === dia; }).sort(function (a, b) { return a.i - b.i || a.f - b.f; });
      // carriles: los bloques que se superponen se reparten el ancho de la columna
      var grupo = [], finGrupo = -1;
      var cerrarGrupo = function () {
        var carriles = [];
        grupo.forEach(function (b) {
          var c = 0;
          while (carriles[c] !== undefined && carriles[c] > b.i) c++;
          carriles[c] = b.f; b.carril = c;
        });
        grupo.forEach(function (b) { b.carriles = carriles.length; });
      };
      delDia.forEach(function (b) {
        if (grupo.length && b.i >= finGrupo) { cerrarGrupo(); grupo = []; finGrupo = -1; }
        grupo.push(b); finGrupo = Math.max(finGrupo, b.f);
      });
      if (grupo.length) cerrarGrupo();
      delDia.forEach(function (b) {
        var g = grupos[b.clave], div = document.createElement("div");
        div.className = "hm-bloque" + (enChoque[b.clave] ? " hm-bloque--choque" : "");
        div.style.top = ((b.i - ini * 60) / (horas * 60) * 100) + "%";
        div.style.height = ((b.f - b.i) / (horas * 60) * 100) + "%";
        div.style.left = (b.carril / b.carriles * 100) + "%";
        div.style.width = (100 / b.carriles) + "%";
        div.style.backgroundColor = COLORES[b.color];
        var tx = document.createElement("b"); tx.textContent = (enChoque[b.clave] ? "⚠ " : "") + g.sigla;
        div.appendChild(tx);
        var sub = document.createElement("span"); sub.textContent = "G" + g.grupo + (b.aula && b.aula !== "9999" ? " · " + b.aula : "");
        div.appendChild(sub);
        div.title = g.sigla + " " + g.nombre + ", grupo " + g.grupo + ", " + ABR[b.d] + " " + hhmm(b.i) + "–" + hhmm(b.f);
        col.appendChild(div);
      });
      cuerpo.appendChild(col);
    }
    cuadro.appendChild(cuerpo);
  }

  /* ---------- Pintado ---------- */
  function pintar() {
    var bs = bloques(), ch = choques(bs), enChoque = {};
    ch.forEach(function (c) { enChoque[c.a] = 1; enChoque[c.b] = 1; });
    var minutos = bs.reduce(function (t, b) { return t + (b.f - b.i); }, 0);
    var cursos = sel.length;

    document.body.classList.toggle("hm-con-barra", cursos > 0);
    barra.hidden = cursos === 0;
    el("[data-hm-estado]").textContent = aviso;
    var resumen = plural(cursos, "curso", "cursos") + " · " + duracion(minutos) + " de clase por semana" +
      (ch.length ? " · ⚠ " + plural(ch.length, "choque", "choques") : "");
    document.querySelector("[data-hm-resumen]").textContent = cursos ? resumen : "";
    barra.classList.toggle("hm-barra--choque", ch.length > 0);

    var zonaCh = el("[data-hm-choques]");
    zonaCh.textContent = "";
    if (ch.length) {
      var p = document.createElement("p"); p.className = "hm__choques-t";
      p.textContent = "⚠ " + plural(ch.length, "choque de horario", "choques de horario") + ". Cambie uno de los grupos o quite el curso.";
      zonaCh.appendChild(p);
      var ul = document.createElement("ul");
      ch.forEach(function (c) {
        var li = document.createElement("li");
        li.textContent = etiqueta(c.a) + " choca con " + etiqueta(c.b) + " el " + DIAS[c.d] + " de " + hhmm(c.i) + " a " + hhmm(c.f) + ".";
        ul.appendChild(li);
      });
      zonaCh.appendChild(ul);
    }

    var lista = el("[data-hm-lista]");
    lista.textContent = "";
    if (!cursos) {
      var vacio = document.createElement("li"); vacio.className = "hm__vacio";
      vacio.textContent = "Aún no ha agregado cursos. Cierre esta ventana y toque «Agregar a mi horario» en un grupo.";
      lista.appendChild(vacio);
    }
    sel.forEach(function (k, n) {
      var g = grupos[k], li = document.createElement("li");
      li.className = "hm-item" + (enChoque[k] ? " hm-item--choque" : "");
      li.style.borderLeftColor = COLORES[n % COLORES.length];
      var t = document.createElement("div"); t.className = "hm-item__t";
      var b = document.createElement("b"); b.textContent = g.sigla + " · Grupo " + g.grupo;
      t.appendChild(b);
      t.appendChild(document.createTextNode(" " + g.nombre + (g.etiquetas.length ? " (" + g.etiquetas.join(", ") + ")" : "")));
      li.appendChild(t);
      var h = document.createElement("div"); h.className = "hm-item__h";
      h.appendChild(document.createTextNode(textoFranjas(g)));
      Object.keys(g.aulas).forEach(function (a) {
        var enl = document.createElement("a"); enl.href = g.aulas[a]; enl.className = "hm-item__aula";
        enl.textContent = "Ver aula " + a + " en el recorrido 3D";
        h.appendChild(enl);
      });
      li.appendChild(h);
      if (enChoque[k]) {
        var w = document.createElement("div"); w.className = "hm-item__choque"; w.textContent = "⚠ Choca con otro curso de su horario.";
        li.appendChild(w);
      }
      var q = document.createElement("button"); q.type = "button"; q.className = "hm-boton"; q.setAttribute("data-hm-quitar", k);
      q.textContent = "Quitar"; q.setAttribute("aria-label", "Quitar " + etiqueta(k) + " de mi horario");
      li.appendChild(q);
      lista.appendChild(li);
    });
    dibujarCuadro(bs, enChoque);
    pintarBotones();
  }

  /* ---------- Acciones ---------- */
  function cambiar(nuevo, mensaje) {
    sel = nuevo; compartido = false; aviso = mensaje || "";
    guardar(); pintar();
  }
  function alternar(k) {
    var g = grupos[k];
    if (sel.indexOf(k) >= 0) {
      cambiar(sel.filter(function (x) { return x !== k; }), etiqueta(k) + " se quitó de su horario.");
      return;
    }
    var otro = sel.filter(function (x) { return grupos[x].sigla === g.sigla; })[0];
    var lista = sel.filter(function (x) { return grupos[x].sigla !== g.sigla; }).concat(k);
    cambiar(lista, otro ? "Se cambió " + etiqueta(otro) + " por " + etiqueta(k) + " (un curso lleva un solo grupo)." : etiqueta(k) + " se agregó a su horario.");
  }
  function copiar(texto, mensaje) {
    var listo = function () { aviso = mensaje; el("[data-hm-estado]").textContent = mensaje; };
    var respaldo = function () {
      var t = document.createElement("textarea"); t.value = texto; t.setAttribute("readonly", "");
      t.style.position = "fixed"; t.style.opacity = "0"; raiz.appendChild(t); t.select();
      try { document.execCommand("copy"); listo(); } catch (e) { el("[data-hm-estado]").textContent = "No se pudo copiar. Seleccione y copie la dirección del navegador."; }
      raiz.removeChild(t);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(listo, respaldo); else respaldo();
  }
  function comoTexto() {
    var titulo = document.querySelector("#hm-titulo").textContent;
    return titulo + "\n" + sel.map(function (k) {
      var g = grupos[k];
      return g.sigla + " " + g.nombre + " · Grupo " + g.grupo + " · " + textoFranjas(g);
    }).join("\n") + "\n\nPlaneado en " + location.origin + location.pathname + " (no es una matrícula; confirme con su carrera o con Registro).";
  }
  function abrir() {
    if (typeof raiz.showModal === "function") { if (!raiz.open) raiz.showModal(); } else raiz.setAttribute("open", "");
  }
  function cerrar() {
    if (typeof raiz.close === "function") raiz.close(); else raiz.removeAttribute("open");
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("button, dialog") : null;
    if (!t) return;
    if (t.classList && t.classList.contains("hm-agregar")) alternar(t.getAttribute("data-hm-clave"));
    else if (t.hasAttribute("data-hm-quitar")) alternar(t.getAttribute("data-hm-quitar"));
    else if (t.hasAttribute("data-hm-abrir")) abrir();
    else if (t.hasAttribute("data-hm-cerrar")) cerrar();
    else if (t.hasAttribute("data-hm-copiar-enlace")) copiar(enlace(), "Enlace copiado. Quien lo abra verá estos mismos grupos.");
    else if (t.hasAttribute("data-hm-copiar-texto")) copiar(comoTexto(), "Horario copiado como texto.");
    else if (t.hasAttribute("data-hm-vaciar")) { cambiar([], "Se quitaron todos los cursos."); cerrar(); }
    else if (t.hasAttribute("data-hm-imprimir")) {
      document.documentElement.classList.add("hm-imprimiendo");
      var fin = function () { document.documentElement.classList.remove("hm-imprimiendo"); window.removeEventListener("afterprint", fin); };
      window.addEventListener("afterprint", fin);
      window.print();
    } else if (t === raiz && e.target === raiz) cerrar(); // clic en el fondo
  });

  /* ---------- Arranque ---------- */
  var enlazado = desdeHash();
  if (enlazado && enlazado.length) {
    sel = enlazado; compartido = true;
    aviso = "Está viendo un horario compartido. No se guardó en este equipo; si lo modifica, se guardará.";
    if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
  } else {
    sel = validas(leerGuardado());
  }
  pintar();
  if (compartido) abrir();
})();
