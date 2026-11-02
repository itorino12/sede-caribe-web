// Aplica las preferencias de accesibilidad antes de pintar la página (evita el destello de tema).
(function () {
  var r = document.documentElement;
  try {
    var p = JSON.parse(localStorage.getItem("sc-a11y") || "{}");
    if (p.tema === "oscuro") r.dataset.tema = "oscuro";  // el sitio es claro salvo que la persona elija lo contrario
    if (p.escala) r.style.setProperty("--escala", p.escala);
    ["contraste", "subrayado", "quieto"].forEach(function (k) { if (p[k]) r.setAttribute("data-" + k, ""); });
  } catch (e) { /* sin almacenamiento: se usan los valores por defecto */ }
})();
