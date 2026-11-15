// Narración y música del recorrido.
// · Al elegir un lugar (evento «lugar-elegido» de recorrido.js o recorrido-giro.js) se oye su narración, si el
//   sonido está activado. El botón del altavoz lo activa o lo silencia y se recuerda en este navegador.
// · La visita guiada (recorrido-visita.js) agrega la bienvenida, la despedida y música suave de fondo, que baja
//   mientras habla la voz.
// · Los audios salen de herramientas/cortar_narracion.py, que también escribe las duraciones en
//   recorrido-narracion.js (la visita espera a que termine cada narración).
import { NARRACION } from "./recorrido-narracion.js";

const raiz = document.querySelector("[data-recorrido]:not([data-portada])");
const base = (raiz?.dataset.raiz || "") + "assets/media/";
const LLAVE = "sede-recorrido-sonido";
const VOL_MUSICA = 0.16, VOL_MUSICA_BAJA = 0.06;

let sonido = true;
try { sonido = localStorage.getItem(LLAVE) !== "no"; } catch { /* sin almacenamiento: activado */ }

const boton = raiz?.querySelector("[data-sonido]");
let voz = null, musica = null, enVisita = false, cola = null, fundido = null;

const archivo = (id) => `${base}narracion/${typeof id === "number" ? `lugar-${String(id).padStart(2, "0")}` : id}.m4a`;
const hay = (id) => NARRACION[id] !== undefined;

function marcarBoton() {
  if (!boton) return;
  boton.setAttribute("aria-pressed", String(sonido));
  boton.setAttribute("aria-label", sonido ? "Silenciar la narración" : "Activar la narración");
}

function volumenMusica(destino, ms = 600) {
  if (!musica) return;
  clearInterval(fundido);
  const inicio = musica.volume, t0 = performance.now();
  fundido = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    musica.volume = inicio + (destino - inicio) * k;
    if (k >= 1) { clearInterval(fundido); if (destino === 0) musica.pause(); }
  }, 40);
}

function callar() {
  cola = null;
  if (voz) { voz.pause(); voz.onended = null; voz = null; }
  if (enVisita) volumenMusica(VOL_MUSICA);
}

// dice un audio; «despues» se encadena al terminar (la bienvenida y luego el primer lugar)
function decir(id, despues = null) {
  callar();
  if (!sonido || !hay(id)) return;
  voz = new Audio(archivo(id));
  voz.preload = "auto";
  if (enVisita) volumenMusica(VOL_MUSICA_BAJA, 300);
  voz.onended = () => {
    voz = null;
    if (cola !== null) { const siguiente = cola; cola = null; decir(siguiente); return; }
    if (enVisita) volumenMusica(VOL_MUSICA);
  };
  cola = despues;
  voz.play().catch(() => { voz = null; });   // sin permiso del navegador para sonar: se queda callado
}

function arrancarMusica() {
  if (!sonido) return;
  if (!musica) { musica = new Audio(base + "visita-musica.m4a"); musica.loop = true; }
  musica.volume = 0;
  musica.play().then(() => volumenMusica(voz ? VOL_MUSICA_BAJA : VOL_MUSICA, 1500)).catch(() => {});
}

// ---------- lo que usa la visita guiada
let saludoPendiente = false;
export const audioVisita = {
  // milisegundos que necesita la narración de un lugar (0 si no hay o está en silencio)
  duracion(id, primero = false) {
    if (!sonido || !hay(id)) return 0;
    return (NARRACION[id] + (primero && hay("inicio") ? NARRACION.inicio + 0.4 : 0)) * 1000;
  },
  empezar() { enVisita = true; saludoPendiente = true; arrancarMusica(); },
  pausar() { voz?.pause(); musica?.pause(); },
  seguir() { voz?.play().catch(() => {}); if (enVisita && sonido) musica?.play().catch(() => {}); },
  terminar(completa) {
    enVisita = false; saludoPendiente = false;
    if (completa && sonido && hay("fin")) {
      decir("fin");
      volumenMusica(VOL_MUSICA_BAJA, 300);
      voz?.addEventListener("ended", () => volumenMusica(0, 2500));
    } else { callar(); volumenMusica(0, 800); }
  },
};

if (raiz) {
  if (boton) boton.hidden = !Object.keys(NARRACION).length;
  marcarBoton();
  boton?.addEventListener("click", () => {
    sonido = !sonido;
    try { localStorage.setItem(LLAVE, sonido ? "si" : "no"); } catch { /* sin almacenamiento */ }
    marcarBoton();
    if (!sonido) { callar(); volumenMusica(0, 300); }
    else if (enVisita) arrancarMusica();
  });
  raiz.addEventListener("lugar-elegido", (e) => {
    const id = e.detail?.id;
    if (saludoPendiente) { saludoPendiente = false; if (hay("inicio")) { decir("inicio", id); return; } }
    decir(id);
  });
  raiz.querySelector(".mapa3d__ficha-cerrar")?.addEventListener("click", () => { if (!enVisita) callar(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && !enVisita) callar(); });
}
