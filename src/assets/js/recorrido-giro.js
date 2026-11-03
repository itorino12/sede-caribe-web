// Maqueta giratoria: para navegadores sin 3D. Son vistas de la maqueta tomadas alrededor del campus
// (herramientas/giro.py); al arrastrar se pasa de una a otra y la maqueta parece girar. Los números
// de los edificios son botones que abren la misma ficha con fotos que la maqueta 3D.
import { ficha, sinMovimiento, rellenarFicha } from "./recorrido-ficha.js";
import { MARCAS, prioridadDe, compararRango } from "./recorrido-config.js";

const raiz = document.querySelector("[data-recorrido]");
const caja = raiz.querySelector(".mapa3d__giro");
const base = raiz.dataset.raiz + "assets/img/giro/";
const datos = JSON.parse(document.getElementById("datos-campus").textContent);
const lugares = new Map(datos.lugares.map((l) => [l.id, l]));

const info = await fetch(base + "giro.json").then((r) => r.json());
const n = info.cuadros;
const imagen = caja.querySelector("img");
const capa = caja.querySelector(".mapa3d__giro-marcas");
const aviso = caja.querySelector(".mapa3d__giro-ayuda");
const cuadros = Array.from({ length: n }, (_, i) => base + `giro-${String(i).padStart(2, "0")}.webp`);
raiz.classList.add("mapa3d--giro");
raiz.style.setProperty("--fundido-marcas", `${sinMovimiento ? 0 : MARCAS.fundidoMs}ms`);

// precarga: primero los vecinos, luego el resto
const cargados = new Set();
function precargar(i) {
  if (cargados.has(i)) return;
  cargados.add(i);
  const im = new Image(); im.decoding = "async"; im.src = cuadros[i];
}

const botones = new Map();
for (const l of datos.lugares) {
  const b = document.createElement("button");
  b.type = "button"; b.className = `mapa3d__marca mapa3d__chip--z${l.zona || 0}`; b.textContent = l.id;
  b.setAttribute("aria-label", `${l.id}. ${l.nombre}`);
  b.addEventListener("click", () => elegir(l.id));
  capa.appendChild(b); botones.set(l.id, b);
}

let actual = 0, elegidoGiro = null;
function mostrar(i) {
  actual = ((i % n) + n) % n;
  imagen.src = cuadros[actual];
  // cada número va siempre sobre su edificio; si dos se tapan, se oculta el de menor prioridad
  const w = caja.clientWidth, h = caja.clientHeight, puestos = [], visibles = new Set(), sep = MARCAS.separacion;
  const lista = info.marcas[actual].filter((m) => botones.has(m.id) && prioridadDe(m.id) <= MARCAS.giroNivel)
    .sort((a, b) => (b.id === elegidoGiro) - (a.id === elegidoGiro) || compararRango(a.id, b.id));
  for (const m of lista) {
    const x = (m.x / 100) * w, y = (m.y / 100) * h;
    if (m.id !== elegidoGiro && puestos.some((p) => Math.abs(p[0] - x) < sep && Math.abs(p[1] - y) < sep)) continue;
    puestos.push([x, y]); visibles.add(m.id);
    const b = botones.get(m.id);
    b.style.left = `${x}px`; b.style.top = `${y}px`;
    b.classList.toggle("mapa3d__marca--menor", !!m.menor);
  }
  botones.forEach((b, id) => b.classList.toggle("mapa3d__marca--oculta", !visibles.has(id)));
  for (const d of [1, -1, 2, -2]) precargar((actual + d + n) % n);
}
function elegir(id) {
  const l = lugares.get(id);
  if (!l) return;
  elegidoGiro = id; mostrar(actual);
  rellenarFicha(l);
  botones.forEach((b, k) => b.setAttribute("aria-pressed", String(k === id)));
}
ficha.querySelector(".mapa3d__ficha-cerrar").addEventListener("click", () => {
  ficha.hidden = true;
  elegidoGiro = null; mostrar(actual);
  botones.forEach((b) => b.setAttribute("aria-pressed", "false"));
  document.querySelectorAll("[data-lugar]").forEach((b) => b.setAttribute("aria-pressed", "false"));
});
document.querySelectorAll("[data-lugar]").forEach((b) => b.addEventListener("click", () => {
  elegir(Number(b.dataset.lugar));
  caja.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "center" });
}));

// arrastrar con el dedo o el ratón: unos 18 px por vista
let desde = null, cuadroInicial = 0;
caja.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) return;
  desde = e.clientX; cuadroInicial = actual; caja.setPointerCapture(e.pointerId); caja.classList.add("arrastrando");
  if (aviso) aviso.hidden = true;
});
caja.addEventListener("pointermove", (e) => {
  if (desde === null) return;
  const paso = Math.max(12, caja.clientWidth / (n * 0.9));
  const nuevo = cuadroInicial - Math.round((e.clientX - desde) / paso);
  if (nuevo !== actual) mostrar(nuevo);
});
const soltar = () => { desde = null; caja.classList.remove("arrastrando"); };
caja.addEventListener("pointerup", soltar);
caja.addEventListener("pointercancel", soltar);
raiz.querySelector("[data-girar-izq]").addEventListener("click", () => mostrar(actual - 1));
raiz.querySelector("[data-girar-der]").addEventListener("click", () => mostrar(actual + 1));
caja.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") { e.preventDefault(); mostrar(actual - 1); }
  if (e.key === "ArrowRight") { e.preventDefault(); mostrar(actual + 1); }
});

new ResizeObserver(() => mostrar(actual)).observe(caja);
mostrar(0);
cuadros.forEach((_, i) => setTimeout(() => precargar(i), 300 + i * 60));
