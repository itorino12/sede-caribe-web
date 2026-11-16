// si la maqueta 3D no llega a cargar (red o caché del navegador), queda la maqueta giratoria y no un cuadro vacío
// Es un archivo aparte (y no un script en línea) porque la política de seguridad del servidor no permite scripts en línea.
const js = (ruta) => new URL(ruta, import.meta.url).href;
import(js("recorrido.js")).catch((e) => {
  console.warn("Maqueta 3D: no cargó", e);
  // el motivo queda a la vista (en la nota bajo la maqueta), para poder reportarlo desde el teléfono
  const nota = document.querySelector(".mapa3d__nota");
  if (nota) nota.textContent = `No se pudo cargar la maqueta 3D (${navigator.userAgent.match(/(iPhone OS|Android|Chrome|Version)[ \/][\d._]+/g)?.join(", ") || "navegador"}): ${e && (e.message || e)}`;
  document.querySelector("[data-recorrido]").classList.add("mapa3d--sin-3d");
  import(js("recorrido-giro.js"));
});
