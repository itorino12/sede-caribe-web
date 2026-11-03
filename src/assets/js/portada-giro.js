// Respaldo de la portada: si la maqueta 3D no arranca (teléfono sin 3D, error al cargar o contexto gráfico
// perdido), se pasan lentamente vistas ya dibujadas de la maqueta alrededor del campus (herramientas/portada.py),
// con un fundido entre una y otra. Una vuelta dura lo mismo que la maqueta en vivo: unos dos minutos.
// Las imágenes se piden de una en una, justo antes de mostrarlas, para no gastar datos de golpe.
const VUELTA_MS = 120000;
const figura = document.querySelector(".portada__foto--3d");

if (figura && !figura.dataset.giro) {
  figura.dataset.giro = "activo";
  figura.querySelector(".mapa3d")?.classList.add("mapa3d--sin-3d");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) arrancar().catch(() => {});   // si falla, queda la imagen fija
}

async function arrancar() {
  const base = new URL("../img/portada-giro/", import.meta.url).href;
  const { cuadros } = await fetch(base + "giro.json").then((r) => r.json());
  const fija = figura.querySelector(".portada__maqueta-fija");
  const encima = fija.cloneNode(false);
  encima.removeAttribute("fetchpriority");
  encima.classList.add("portada__maqueta-giro");
  fija.after(encima);

  let enPantalla = true;
  new IntersectionObserver(([e]) => { enPantalla = e.isIntersecting; }).observe(figura);
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

  let actual = 0, arribaVisible = false;
  for (;;) {
    await esperar(VUELTA_MS / cuadros);
    while (!enPantalla || document.hidden) await esperar(1000);
    const siguiente = (actual + 1) % cuadros;
    const im = new Image();
    im.src = base + `vista-${String(siguiente).padStart(2, "0")}.webp`;
    try { await im.decode(); } catch { continue; }   // si una vista no carga, se intenta de nuevo en el próximo paso
    // la capa de arriba aparece con la vista nueva, o se desvanece y deja ver la de abajo ya cambiada
    if (arribaVisible) fija.src = im.src; else encima.src = im.src;
    arribaVisible = !arribaVisible;
    encima.classList.toggle("portada__maqueta-giro--visible", arribaVisible);
    actual = siguiente;
  }
}
