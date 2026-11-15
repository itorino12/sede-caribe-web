// Página «Usar el sitio sin conexión»: guarda la lista de sin-conexion.json mediante el service worker (sw.js)
// y muestra qué hay guardado. Sin conexión, sw.js trae aquí a quien pide una página que no está guardada.
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var caja = $("[data-sin-conexion]");
  if (!caja) return;
  var estado = $("[data-sc-estado]"), avance = $("[data-sc-avance]"), lista = $("[data-sc-lista]");
  var guardar = $("[data-sc-guardar]"), borrar = $("[data-sc-borrar]"), fotos = $("[data-sc-fotos]");
  var MB = function (b) { return (b / 1048576).toLocaleString("es-CR", { maximumFractionDigits: 1 }) + " MB"; };
  var fecha = function (iso) { return new Date(iso).toLocaleString("es-CR", { dateStyle: "long", timeStyle: "short" }); };

  var pedida = new URLSearchParams(location.search).get("pedida");
  if (pedida) {
    var aviso = $("[data-sc-pedida]");
    aviso.textContent = "No hay conexión y la página que pidió (" + pedida + ") no está guardada en este dispositivo. Abajo están las que sí puede ver.";
    aviso.hidden = false;
  }
  if (!("serviceWorker" in navigator) || !window.caches) { $("[data-sc-sin-soporte]").hidden = false; return; }
  $("[data-sc-panel]").hidden = false;

  var paquete = null;
  function titulo(url) {
    var ruta = url.replace(/^.*?\/([^/]+(?:\/[^/]+)?)$/, "$1");
    var base = new URL(".", location.href).href, rel = url.indexOf(base) === 0 ? url.slice(base.length) : ruta;
    var item = (window.INDICE || []).find(function (i) { return i.u === rel; });
    return { rel: rel, t: item ? item.t : rel };
  }
  function mostrar(conFecha) {
    caches.has("sede-paginas").then(function (hay) { return hay ? caches.open("sede-paginas") : null; }).then(function (c) {
      if (!c) return [[], null];
      return Promise.all([c.keys(), c.match(new URL("__sin-conexion-guardado", new URL(".", location.href)).href)]);
    }).then(function (r) {
      var llaves = r[0].filter(function (k) { return !/__sin-conexion-guardado$/.test(k.url); });
      lista.textContent = "";
      llaves.map(function (k) { return titulo(k.url); }).sort(function (a, b) { return a.t.localeCompare(b.t, "es"); }).forEach(function (p) {
        var li = document.createElement("li"), a = document.createElement("a");
        a.href = p.rel; a.textContent = p.t; li.appendChild(a); lista.appendChild(li);
      });
      if (!llaves.length) { var li = document.createElement("li"); li.textContent = "Todavía nada."; lista.appendChild(li); }
      borrar.hidden = !llaves.length;
      return r[1] ? r[1].json() : null;
    }).then(function (marca) {
      if (marca && conFecha === true) estado.textContent = "Último guardado completo: " + fecha(marca.fecha) + (marca.fotos ? ", con fotos." : ", sin fotos.");
    }).catch(function () {});
  }
  function tamanos() {
    if (!paquete) return;
    $("[data-sc-tam]").textContent = "(unos " + MB(paquete.bytes + (fotos.checked ? paquete.bytes_fotos : 0)) + ")";
    $("[data-sc-tam-fotos]").textContent = "(" + MB(paquete.bytes_fotos) + " más)";
  }
  fetch("sin-conexion.json", { cache: "no-cache" }).then(function (r) { return r.json(); })
    .then(function (p) { paquete = p; tamanos(); })
    .catch(function () { if (!navigator.onLine) { guardar.disabled = true; estado.textContent = "Para guardar hace falta conexión."; } });
  fotos.addEventListener("change", tamanos);

  function trabajador() {
    return navigator.serviceWorker.ready.then(function (reg) { return reg.active; });
  }
  guardar.addEventListener("click", function () {
    if (!paquete) { estado.textContent = "Para guardar hace falta conexión."; return; }
    guardar.disabled = true;
    estado.textContent = "Guardando…";
    avance.hidden = false; avance.value = 0;
    var canal = new MessageChannel();
    canal.port1.onmessage = function (e) {
      var d = e.data;
      avance.max = d.total; avance.value = d.hechos;
      if (!d.fin) return;
      guardar.disabled = false; avance.hidden = true;
      estado.textContent = d.fallas ? "Listo, pero " + d.fallas + " de " + d.total + " archivos no se pudieron guardar. Puede intentarlo de nuevo con mejor señal."
        : "Listo: ya puede usar estas páginas sin conexión.";
      mostrar();
    };
    trabajador().then(function (sw) {
      sw.postMessage({ tipo: "guardar", paginas: paquete.paginas, recursos: paquete.recursos.concat(fotos.checked ? paquete.fotos : []) }, [canal.port2]);
    });
  });
  borrar.addEventListener("click", function () {
    var canal = new MessageChannel();
    canal.port1.onmessage = function () { estado.textContent = "Se borró lo guardado en este dispositivo."; mostrar(); };
    trabajador().then(function (sw) { sw.postMessage({ tipo: "borrar" }, [canal.port2]); });
  });
  document.addEventListener("DOMContentLoaded", function () { mostrar(true); });   // después de indice.js, que da los títulos
})();
