// Asistente de la Sede: al tocar el congo de la portada, se baja de la rama y atiende un chat con IA.
// Las respuestas vienen del servidor de la Sede (servidor/asistente.py, en api/asistente), que va
// escribiendo la respuesta por partes. Donde no hay servidor (la vista previa en GitHub Pages) o si falla,
// el congo lo dice y responde buscando en el propio sitio (el mismo índice del buscador).
import { montar } from "./congo.js";

const API = "api/asistente";
const GUARDADO = "congo-chat";
const SALUDO = "¡Wapin! Soy el congo de la Sede del Caribe. Pregúnteme lo que necesite: carreras, admisión, becas, "
  + "trámites, horarios o cómo llegar. Y si es otra cosa, igual pruebe: hago lo posible.";
const SUGERENCIAS = ["¿Qué carreras ofrece la Sede?", "¿Cómo solicito una beca?", "¿Cómo llego al campus?", "¿Cuál es la extensión de Registro?"];
const NOTA = "Respuestas generadas con inteligencia artificial: pueden tener errores. Confirme lo importante con la oficina "
  + "correspondiente y no escriba datos personales.";

let dlg, lista, campo, enviarBtn, sugerencias, aviso, congoPanel, congoPortada, pedido = null;
let historial = [];

function cargar() {
  try { historial = JSON.parse(sessionStorage.getItem(GUARDADO)) || []; } catch { historial = []; }
}
function guardar() {
  try { sessionStorage.setItem(GUARDADO, JSON.stringify(historial.slice(-30))); } catch { /* sin almacenamiento */ }
}

// ---------- texto con formato simple (seguro: primero se escapa todo) ----------
const escapar = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function enLinea(s) {
  return escapar(s)
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
      const bien = /^https?:\/\//i.test(url) || /^[\w./#?=&%;-]+$/.test(url);
      if (!bien) return txt;
      const fuera = /^https?:\/\//i.test(url) && !url.includes(location.host);
      return `<a href="${url.replace(/^\//, "")}"${fuera ? ' target="_blank" rel="noopener"' : ""}>${txt}</a>`;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}
function formato(texto) {
  const bloques = texto.trim().split(/\n{2,}/);
  return bloques.map((b) => {
    const lineas = b.split("\n");
    if (lineas.every((l) => /^\s*[-*•]\s+/.test(l))) return "<ul>" + lineas.map((l) => `<li>${enLinea(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("") + "</ul>";
    if (lineas.every((l) => /^\s*\d+[.)]\s+/.test(l))) return "<ol>" + lineas.map((l) => `<li>${enLinea(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("") + "</ol>";
    return `<p>${lineas.map(enLinea).join("<br>")}</p>`;
  }).join("");
}

// ---------- respuesta sin IA: busca en el índice del sitio ----------
const normal = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const VACIAS = new Set("el la los las un una unos unas de del al a en y o u que como cual cuales cuando donde quien por para con sin sobre es son hay mi me se su sus le lo tengo puedo quiero saber necesito favor hola buenas buenos dias tardes noches ucr sede caribe".split(" "));
function buscarEnSitio(pregunta) {
  const terminos = normal(pregunta).split(/[^a-z0-9ñ]+/).filter((t) => t.length > 2 && !VACIAS.has(t));
  if (!terminos.length) return [];
  return (window.INDICE || []).filter((e) => e.u !== "index.html").map((e) => {
    const t = normal(e.t), x = normal(e.x);
    let p = 0;
    for (const k of terminos) { if (t.includes(k)) p += 6; else if (x.includes(k)) p += 1; }
    return { e, p };
  }).filter((r) => r.p > 0).sort((a, b) => b.p - a.p).slice(0, 4).map((r) => r.e);
}
function respuestaLocal(pregunta, motivo) {
  const tel = document.querySelector('a[href^="tel:"]')?.textContent.trim() || "la central telefónica";
  const intro = motivo === "sin-servidor"
    ? "En esta versión del sitio todavía no estoy conectado a la inteligencia artificial, así que por ahora solo puedo buscar en las páginas de la Sede."
    : "No logré conectarme con la inteligencia artificial en este momento. Mientras tanto, busqué en las páginas de la Sede.";
  const hallados = buscarEnSitio(pregunta);
  if (!hallados.length) return `${intro}\n\nNo encontré nada sobre eso. Puede revisar el [directorio](directorio.html) o llamar a la central telefónica, ${tel}.`;
  return `${intro} Esto encontré:\n\n` + hallados.map((e) => `- [${e.t.replace(/[[\]]/g, "")}](${e.u})`).join("\n");
}

// ---------- interfaz ----------
const ICONO_CERRAR = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const ICONO_ENVIAR = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

function construir() {
  dlg = document.createElement("dialog");
  dlg.className = "asistente";
  dlg.setAttribute("aria-labelledby", "asistente-titulo");
  dlg.innerHTML = `
    <div class="asistente__cabeza">
      <div class="asistente__selva" aria-hidden="true"></div>
      <div class="asistente__titulos">
        <h2 id="asistente-titulo">El congo</h2>
        <p>Asistente de la Sede del Caribe</p>
      </div>
      <button type="button" class="asistente__cerrar" aria-label="Cerrar el asistente">${ICONO_CERRAR}</button>
    </div>
    <div class="asistente__mensajes"></div>
    <div class="asistente__sugerencias" role="group" aria-label="Preguntas frecuentes"></div>
    <form class="asistente__form">
      <label class="oculto" for="asistente-campo">Escriba su pregunta</label>
      <textarea id="asistente-campo" rows="1" maxlength="1000" placeholder="Escriba su pregunta…" enterkeyhint="send" autocomplete="off"></textarea>
      <button type="submit" class="asistente__enviar" aria-label="Enviar la pregunta">${ICONO_ENVIAR}</button>
    </form>
    <p class="asistente__nota">${NOTA}</p>
    <p class="oculto" aria-live="polite"></p>`;
  document.body.append(dlg);
  lista = dlg.querySelector(".asistente__mensajes");
  campo = dlg.querySelector("textarea");
  enviarBtn = dlg.querySelector(".asistente__enviar");
  sugerencias = dlg.querySelector(".asistente__sugerencias");
  aviso = dlg.querySelector("[aria-live]");

  for (const s of SUGERENCIAS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = s;
    b.addEventListener("click", () => preguntar(s));
    sugerencias.append(b);
  }
  dlg.querySelector(".asistente__cerrar").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); }); // clic en el fondo
  dlg.addEventListener("close", cerrado);
  dlg.querySelector("form").addEventListener("submit", (ev) => { ev.preventDefault(); preguntar(campo.value); });
  campo.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); preguntar(campo.value); }
  });
  campo.addEventListener("input", ajustarCampo);

  cargar();
  burbuja("congo", SALUDO);
  for (const m of historial) burbuja(m.rol, m.texto);
  sugerencias.hidden = historial.some((m) => m.rol === "usuario");
}

function ajustarCampo() {
  campo.style.height = "auto";
  campo.style.height = Math.min(campo.scrollHeight, 120) + "px";
}

function burbuja(rol, texto) {
  const div = document.createElement("div");
  div.className = "mensaje mensaje--" + rol;
  if (rol === "usuario") div.textContent = texto; else div.innerHTML = formato(texto);
  lista.append(div);
  bajar();
  return div;
}
const bajar = () => { lista.scrollTop = lista.scrollHeight; };

function ocupado(si) {
  enviarBtn.disabled = si;
  campo.toggleAttribute("aria-busy", si);
}

async function preguntar(texto) {
  texto = (texto || "").trim().slice(0, 1000);
  if (!texto || pedido) return;
  campo.value = ""; ajustarCampo();
  sugerencias.hidden = true;
  burbuja("usuario", texto);
  historial.push({ rol: "usuario", texto });
  guardar();

  const div = burbuja("congo", "");
  div.classList.add("mensaje--escribiendo");
  div.innerHTML = '<span class="puntos" aria-label="El congo está escribiendo"><i></i><i></i><i></i></span>';
  ocupado(true);
  congoPanel?.pensar(true);
  pedido = new AbortController();
  let respuesta = "";
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensajes: historial.slice(-12) }),
      signal: pedido.signal,
    });
    if (res.status === 429) throw Object.assign(new Error("límite"), { tipo: "limite" });
    const tipo = res.headers.get("content-type") || "";
    if (res.status === 404 || res.status === 405 || tipo.startsWith("text/html")) throw Object.assign(new Error("sin servidor"), { tipo: "sin-servidor" });
    if (!res.ok || !res.body || !tipo.startsWith("text/plain")) throw Object.assign(new Error("falla"), { tipo: "falla" });
    congoPanel?.pensar(false);
    congoPanel?.hablar(true);
    div.classList.remove("mensaje--escribiendo");
    const lector = res.body.getReader(), dec = new TextDecoder();
    let pendiente = false;
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      respuesta += dec.decode(value, { stream: true });
      if (!pendiente) { // un repintado por cuadro, aunque lleguen muchos trozos
        pendiente = true;
        requestAnimationFrame(() => { pendiente = false; div.innerHTML = formato(respuesta); bajar(); });
      }
    }
    respuesta += dec.decode();
    if (!respuesta.trim()) throw Object.assign(new Error("vacía"), { tipo: "falla" });
  } catch (err) {
    if (err.name === "AbortError") { div.remove(); pedido = null; ocupado(false); return; }
    respuesta = err.tipo === "limite"
      ? "Ha hecho muchas preguntas en poco tiempo. Espere unos minutos y vuelva a intentarlo, por favor."
      : respuestaLocal(texto, err.tipo === "sin-servidor" ? "sin-servidor" : "falla");
  } finally {
    congoPanel?.pensar(false);
    congoPanel?.hablar(false);
  }
  div.classList.remove("mensaje--escribiendo");
  div.innerHTML = formato(respuesta);
  bajar();
  aviso.textContent = "El congo responde: " + div.textContent;
  historial.push({ rol: "congo", texto: respuesta });
  guardar();
  pedido = null;
  ocupado(false);
  if (matchMedia("(pointer: fine)").matches) campo.focus();
}

function cerrado() {
  pedido?.abort();
  congoPanel?.pausar();
  congoPortada?.mostrar();
  congoPortada?.boton?.focus({ preventScroll: true });
}

export function abrir(congo) {
  congoPortada = congo;
  if (!dlg) construir();
  congo.esconder();
  dlg.showModal();
  if (!congoPanel) congoPanel = montar(dlg.querySelector(".asistente__selva"), { panel: true, escala: 0.74, x: 98 });
  congoPanel.seguir();
  congoPanel.aullar(0.9); // se acomoda en la rama y saluda
  bajar();
  if (matchMedia("(pointer: fine)").matches) campo.focus();
}
