// la maqueta en vivo se carga después de la página, para que la portada aparezca igual de rápido;
// si no carga (error de red o navegador sin soporte), quedan las vistas de respaldo girando
// En teléfonos con poca memoria o con ahorro de datos ni se intenta el 3D: van directo a las vistas de respaldo.
// Si el 3D no está listo en 15 segundos, también se pasa a las vistas (y el 3D, si llega después, no se muestra).
// Es un archivo aparte (y no un script en línea) porque la política de seguridad del servidor no permite scripts en línea.
const js = (ruta) => new URL(ruta, import.meta.url).href;
const respaldo = () => import(js("portada-giro.js"));
const red = navigator.connection || {};
const debil = red.saveData || /2g$/.test(red.effectiveType || "") || (navigator.deviceMemory || 8) <= 2;
const arrancar = () => setTimeout(() => {
  import(js("congo.js")).catch(() => {});
  if (debil) { respaldo(); return; }
  import(js("recorrido.js")).catch(respaldo);
  setTimeout(() => { if (!document.querySelector(".mapa3d--listo, .mapa3d--sin-3d")) respaldo(); }, 15000);
}, 400);
// un módulo se ejecuta antes del evento «load», pero se cubre también el caso de que ya haya pasado
if (document.readyState === "complete") arrancar(); else addEventListener("load", arrancar);
