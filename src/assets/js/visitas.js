/* Conteo de visitas propio: sin cookies, sin guardar nada en el navegador y sin servicios externos.
   Envía a /api/visita solo la ruta (sin parámetros ni ancla), el dominio de origen si viene de otro sitio y si la
   pantalla es de celular. Respeta «No rastrear» (DNT) y «Control global de privacidad» (GPC). */
(function () {
  "use strict";
  var n = navigator;
  if (n.doNotTrack === "1" || window.doNotTrack === "1" || n.globalPrivacyControl === true) return;
  if (!n.sendBeacon || location.protocol === "file:") return;
  var origen = "";
  try {
    var r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.hostname !== location.hostname) origen = r.hostname;
  } catch (e) { /* sin origen */ }
  var datos = JSON.stringify({ p: location.pathname, r: origen, d: window.innerWidth < 768 ? "m" : "e" });
  try {
    n.sendBeacon("/api/visita", new Blob([datos], { type: "application/json" }));
  } catch (e) { /* el conteo nunca debe afectar la página */ }
})();
