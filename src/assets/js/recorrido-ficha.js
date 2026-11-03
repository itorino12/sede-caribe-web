// Partes del recorrido que comparten la maqueta 3D y la maqueta giratoria (sin 3D):
// la ficha del lugar con su carrusel de fotos y el visor de fotos en grande.
const raiz = document.querySelector("[data-recorrido]");
export const ficha = raiz.querySelector(".mapa3d__ficha");
export const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.movimiento === "no";

// ---------- carrusel de fotos: en la ficha y, al tocar una foto, en grande a pantalla completa
// Si una foto no carga, casi siempre es porque el navegador guardó una versión vieja de la página
// (que apunta a fotos que ya se reemplazaron). Se recarga una sola vez, pidiendo la página nueva.
function fotoPerdida() {
  try {
    if (sessionStorage.getItem("recorrido-recargado")) return;
    sessionStorage.setItem("recorrido-recargado", "1");
  } catch (e) { return; }
  const u = new URL(location.href);
  u.searchParams.set("act", Date.now().toString(36));
  location.replace(u.toString());
}

export class Carrusel {
  constructor(nodo, grande, alTocar) {
    this.nodo = nodo; this.grande = grande; this.alTocar = alTocar;
    this.pista = nodo.querySelector(".carrusel__pista");
    this.cuenta = nodo.querySelector(".carrusel__cuenta");
    this.fotos = []; this.actual = 0;
    nodo.querySelector("[data-antes]").addEventListener("click", () => this.ir(this.actual - 1));
    nodo.querySelector("[data-despues]").addEventListener("click", () => this.ir(this.actual + 1));
    this.pista.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); this.ir(this.actual - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); this.ir(this.actual + 1); }
    });
    let espera;
    this.pista.addEventListener("scroll", () => { clearTimeout(espera); espera = setTimeout(() => this.leerPosicion(), 80); }, { passive: true });
  }
  cargar(fotos, titulo, inicio = 0) {
    this.fotos = fotos; this.actual = 0;
    this.nodo.hidden = !fotos.length;
    this.nodo.setAttribute("aria-label", titulo);
    this.nodo.classList.toggle("carrusel--una", fotos.length < 2);
    this.pista.replaceChildren(...fotos.map((f, i) => {
      const li = document.createElement("li");
      li.className = "carrusel__foto";
      li.setAttribute("aria-label", `${i + 1} de ${fotos.length}`);
      const img = document.createElement("img");
      img.src = raiz.dataset.raiz + (this.grande ? f.m : f.s);
      img.srcset = `${raiz.dataset.raiz + f.s} 640w, ${raiz.dataset.raiz + f.m} 1280w, ${raiz.dataset.raiz + f.g} 1920w`;
      img.sizes = this.grande ? "100vw" : "420px";
      img.alt = f.alt; img.loading = i ? "lazy" : "eager"; img.decoding = "async";
      img.addEventListener("error", fotoPerdida, { once: true });
      if (this.alTocar) { img.addEventListener("click", () => this.alTocar(i)); img.classList.add("carrusel__ampliable"); }
      li.appendChild(img);
      return li;
    }));
    this.pista.scrollLeft = 0;
    if (inicio) requestAnimationFrame(() => this.ir(inicio, true)); else this.marcar();
  }
  ir(i, inmediato) {
    if (!this.fotos.length) return;
    this.actual = (i + this.fotos.length) % this.fotos.length;
    this.pista.scrollTo({ left: this.actual * this.pista.clientWidth, behavior: inmediato || sinMovimiento ? "auto" : "smooth" });
    this.marcar();
  }
  leerPosicion() {
    const i = Math.round(this.pista.scrollLeft / Math.max(this.pista.clientWidth, 1));
    if (i !== this.actual) { this.actual = i; this.marcar(); }
  }
  marcar() { this.cuenta.textContent = this.fotos.length > 1 ? `${this.actual + 1} / ${this.fotos.length}` : ""; }
}
const visor = document.querySelector(".visor-fotos");
const carruselGrande = new Carrusel(visor.querySelector("[data-carrusel]"), true);
export const carruselFicha = new Carrusel(ficha.querySelector("[data-carrusel]"), false, (i) => {
  carruselGrande.cargar(carruselFicha.fotos, ficha.querySelector(".mapa3d__ficha-titulo").textContent, i);
  visor.showModal();
  carruselGrande.pista.focus();
});
visor.querySelector(".visor-fotos__cerrar").addEventListener("click", () => visor.close());
visor.addEventListener("click", (e) => { if (e.target === visor) visor.close(); });

export function rellenarFicha(l) {
  ficha.hidden = false;
  ficha.querySelector(".mapa3d__ficha-zona").textContent = l.zona ? `Zona ${l.zona} · Lugar ${l.id}` : "Áreas deportivas";
  ficha.querySelector(".mapa3d__ficha-titulo").textContent = l.nombre;
  ficha.querySelector(".mapa3d__ficha-texto").textContent = l.texto || "";
  carruselFicha.cargar(l.fotos || [], `Fotos de ${l.nombre}`);
  const enlace = ficha.querySelector(".mapa3d__ficha-enlace");
  enlace.hidden = !l.enlace;
  if (l.enlace) enlace.href = raiz.dataset.raiz + l.enlace;
  document.querySelectorAll("[data-lugar]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.lugar) === l.id)));
}
