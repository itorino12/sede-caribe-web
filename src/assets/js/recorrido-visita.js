// Visita guiada del recorrido: pasa por los lugares en orden, abre la ficha de cada uno y, en 3D, gira despacio
// alrededor. Elige cada lugar con el mismo botón [data-lugar] de la lista, así sirve igual con o sin 3D.
// Si la persona toca la maqueta o la ficha, la visita se pausa; con los botones de zona, vista general o cerrar, termina.
// recorrido.html#visita la inicia sola (para una pantalla en la entrada, por ejemplo).
// Con sonido, narra cada lugar con música de fondo (recorrido-audio.js) y espera a que termine la narración.
import { audioVisita } from "./recorrido-audio.js";

const raiz = document.querySelector("[data-recorrido]");
const barra = raiz?.querySelector("[data-visita-barra]");
const iniciar = document.querySelector("[data-visita-iniciar]");
if (raiz && barra && iniciar) {
  const { lugares } = JSON.parse(document.getElementById("datos-campus").textContent);
  const boton = (id) => document.querySelector(`.lugares [data-lugar="${id}"]`);
  const orden = lugares.filter((l) => boton(l.id)).sort((a, b) => a.id - b.id);
  const ficha = raiz.querySelector(".mapa3d__ficha");
  const cuenta = barra.querySelector("[data-visita-cuenta]");
  const tiempo = barra.querySelector("[data-visita-tiempo]");
  const pausa = barra.querySelector("[data-visita-pausa]");
  const estado = document.querySelector("[data-visita-estado]");
  const textoIniciar = iniciar.innerHTML;
  // tiempo en cada lugar: lo que toma leer la ficha (unas 3 palabras por segundo), entre 8 y 20 segundos
  // con narración, al menos lo que dura el audio más un respiro antes de pasar al siguiente
  const lectura = (l) => Math.min(20, Math.max(8, 4 + `${l.nombre} ${l.texto || ""}`.split(/\s+/).length / 3)) * 1000;
  const duracion = (l, primero) => { const a = audioVisita.duracion(l.id, primero); return a ? Math.max(lectura(l), a + 1500) : lectura(l); };

  let primeroConSaludo = false;
  let activa = false, pausada = false, indice = 0, reloj = null, t0 = 0, restante = 0, propio = false, porPestana = false;
  const en3d = () => raiz.classList.contains("mapa3d--listo") && !raiz.classList.contains("mapa3d--sin-3d");
  const girar = (si) => raiz.dispatchEvent(new CustomEvent("visita-giro", { detail: si }));
  const avisar = (t) => { estado.textContent = ""; requestAnimationFrame(() => { estado.textContent = t; }); };
  const pulsar = (el) => { propio = true; try { el?.click(); } finally { propio = false; } };

  function barraTiempo(ms) {
    tiempo.style.animation = "none";
    void tiempo.offsetWidth;   // reinicia la animación de la línea de tiempo
    tiempo.style.animation = "";
    tiempo.style.setProperty("--visita-ms", `${ms}ms`);
  }
  function programar(ms) {
    clearTimeout(reloj);
    t0 = performance.now(); restante = ms;
    reloj = setTimeout(() => ir(indice + 1), ms);
  }
  function mostrarEstado() {
    raiz.classList.toggle("mapa3d--visita-pausada", pausada);
    pausa.setAttribute("aria-label", pausada ? "Seguir la visita" : "Pausar la visita");
    pausa.setAttribute("aria-pressed", String(pausada));
  }
  function ir(i) {
    if (i >= orden.length) { terminar(true); return; }
    indice = Math.max(0, i);
    const l = orden[indice];
    pulsar(boton(l.id));
    if (!en3d()) ficha.scrollIntoView({ block: "nearest" });
    cuenta.textContent = `${indice + 1} / ${orden.length}`;
    barra.querySelector("[data-visita-antes]").disabled = indice === 0;
    const ms = duracion(l, primeroConSaludo);
    primeroConSaludo = false;
    barraTiempo(ms);
    if (pausada) { restante = ms; clearTimeout(reloj); } else { programar(ms); girar(true); }
  }
  function pausar(motivo) {
    if (!activa || pausada) return;
    pausada = true;
    clearTimeout(reloj);
    restante = Math.max(0, restante - (performance.now() - t0));
    girar(false); mostrarEstado(); audioVisita.pausar();
    if (motivo !== "pestaña") avisar("Visita en pausa.");
  }
  function seguir() {
    if (!activa || !pausada) return;
    pausada = false; mostrarEstado(); audioVisita.seguir();
    // si en la pausa la persona eligió otro lugar, la visita sigue con el que viene después de ese
    if (restante <= 0) { ir(indice + 1); return; }
    programar(restante); girar(true);
    avisar("Visita en marcha.");
  }
  function empezar(desde = 0) {
    activa = true; pausada = false;
    primeroConSaludo = true; audioVisita.empezar();
    raiz.classList.add("mapa3d--visita");
    barra.hidden = false;
    iniciar.innerHTML = "Terminar la visita guiada";
    mostrarEstado();
    avisar(`Visita guiada: ${orden.length} lugares. Toque la maqueta o use Pausa para detenerla.`);
    ir(desde);
  }
  function terminar(completa) {
    if (!activa) return;
    activa = false; pausada = false;
    clearTimeout(reloj); girar(false); audioVisita.terminar(completa);
    raiz.classList.remove("mapa3d--visita", "mapa3d--visita-pausada");
    barra.hidden = true;
    iniciar.innerHTML = textoIniciar;
    // al terminar sola, en 3D vuelve a la vista general; si la cortó la persona, queda donde estaba
    if (completa && en3d()) pulsar(raiz.querySelector("[data-vista-general]"));
    avisar(completa ? "Visita terminada." : "Visita detenida.");
  }

  iniciar.addEventListener("click", () => {
    if (activa) { terminar(false); return; }
    empezar(0);
    barra.querySelector("[data-visita-pausa]").focus({ preventScroll: true });
  });
  pausa.addEventListener("click", () => (pausada ? seguir() : pausar()));
  barra.querySelector("[data-visita-antes]").addEventListener("click", () => ir(indice - 1));
  barra.querySelector("[data-visita-despues]").addEventListener("click", () => ir(indice + 1));
  barra.querySelector("[data-visita-fin]").addEventListener("click", () => { terminar(false); iniciar.focus({ preventScroll: true }); });

  // lo que hace la persona por su cuenta: elegir otro lugar pausa (y la visita sigue desde ahí);
  // zonas, vista general o cerrar la ficha terminan la visita
  document.addEventListener("click", (e) => {
    if (!activa || propio || barra.contains(e.target) || e.target === iniciar) return;
    if (e.target.closest("[data-zona], [data-vista-general], .mapa3d__ficha-cerrar")) { terminar(false); return; }
    const elegido = e.target.closest("[data-lugar], .mapa3d__marca");
    if (elegido) {
      const id = Number(elegido.dataset.lugar || elegido.textContent);
      const k = orden.findIndex((l) => l.id === id);
      pausar();
      if (k >= 0) { indice = k; restante = 0; cuenta.textContent = `${k + 1} / ${orden.length}`; }
    }
  }, true);
  for (const sel of [".mapa3d__lienzo", ".mapa3d__giro", ".mapa3d__ficha"]) {
    const el = raiz.querySelector(sel);
    el?.addEventListener("pointerdown", (e) => { if (!e.target.closest(".mapa3d__ficha-cerrar")) pausar(); });
    el?.addEventListener("wheel", () => pausar(), { passive: true });
  }
  raiz.querySelector(".mapa3d__giro")?.addEventListener("keydown", () => pausar());
  // con la pestaña oculta la visita espera, y sigue al volver
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && activa && !pausada) { porPestana = true; pausar("pestaña"); }
    else if (!document.hidden && porPestana) { porPestana = false; seguir(); }
  });

  if (location.hash === "#visita") {
    // espera a que la maqueta (3D o giratoria) esté lista, sin pasar de 8 segundos
    const listo = () => raiz.matches(".mapa3d--listo, .mapa3d--giro");
    const t = performance.now();
    (function esperar() { if (listo() || performance.now() - t > 8000) empezar(0); else setTimeout(esperar, 200); })();
  }
}
