// Declaración Jurada de Horario y Jornada (declaracion-jurada.html).
// El formulario es una réplica del de la ORH: una fila por nombramiento, con un «De» y un «A» por día. El
// detalle de cada fila divide el día en tramos (almuerzo, contacto, consulta, preparación) y de ahí salen
// las Observaciones. Las reglas están en declaracion-reglas.js; el PDF, en declaracion-pdf.js; la lectura de
// un PDF subido, en declaracion-subir.js. El borrador se guarda solo en este navegador.
import { DIAS, NOMBRE_DIA, JORNADAS, revisar, minutos, hora, normalHora, horas, fecha, textoFecha, textoJornada, escribirObservacion, claseOtra } from "./declaracion-reglas.js";

const raiz = document.getElementById("dj").dataset.raiz || "";
const CLAVE = "dj-borrador-v1";
const FILAS_MIN = 4, FILAS_MAX = 8;
const ALM = [720, 780];
const TIPOS = [["", "Elija…"], ["curso", "Curso (docencia)"], ["coordinacion", "Coordinación o cargo de gestión"], ["investigacion", "Investigación"], ["accion", "Acción social"], ["administrativo", "Administrativo"], ["otro", "Otro"]];
const CLASES = [["", "Elija…"], ["estatal", "Institución estatal (suma al tope de 66 h)"], ["privada", "Entidad privada"], ["fundacion", "Fundación (por ejemplo, FUNDEVI)"]];
const ACTS = [["", "Sin clasificar"], ["contacto", "Contacto"], ["consulta", "Consulta"], ["preparacion", "Preparación"]];

const $ = (s, el = document) => el.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let sec = 0;
const nuevaFila = (seccion) => ({ id: `f${Date.now().toString(36)}${sec++}`, seccion, lugar: seccion === "ucr" ? "" : "", cargo: "", jornada: "", desde: "", hasta: "", dias: {}, etiqueta: "", tipo: "", clase: "", respaldo: "", venceRespaldo: "", nota: "", tramos: {} });
const vacio = () => ({
  persona: { nombre: "", identificacion: "", telefono: "", unidad: "Sede del Caribe", correo: "" },
  filas: [...Array(FILAS_MIN)].map(() => nuevaFila("ucr")).concat([...Array(FILAS_MIN)].map(() => nuevaFila("otras"))),
  obsManual: false, obsTexto: "", jornadaNombrada: "", cuartoAdicional: false, origen: "formulario", firmas: null,
});

let modo = "formulario";
let estado = cargar() || vacio();
let borrador = null;          // el formulario propio mientras se revisa un PDF subido
let detalleAbierto = null;    // id de la fila del detalle
let ultimo = null;            // última revisión
let iaComentarios = null;
let servidor = null;          // ¿hay /api/declaracion? (no en GitHub Pages)
let notasLectura = [];        // lo que la IA notó al leer un archivo (legibilidad, dudas)

function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) || "null");
    if (d && Array.isArray(d.filas)) { d.origen = "formulario"; return d; }
  } catch { /* sin almacenamiento */ }
  return null;
}
function guardar() {
  if (estado.origen !== "formulario") return;
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch { /* lleno o bloqueado */ }
}

// ---------- tramos y Observaciones de cada fila ----------

function filaVacia(f) {
  return !f.lugar && !f.cargo && !f.jornada && !f.desde && !f.hasta && !DIAS.some((d) => f.dias[d]?.de || f.dias[d]?.a);
}

// Tramos del día: los del detalle si los hay; si no, la tabla dividida en el almuerzo.
function tramosDia(f, d) {
  if (f.tramos?.[d]?.length) return f.tramos[d];
  const de = minutos(f.dias[d]?.de), a = minutos(f.dias[d]?.a);
  if (de == null || a == null || a <= de) return [];
  if (de < ALM[0] && a > ALM[1]) return [{ de, a: ALM[0], act: "" }, { de: ALM[1], a, act: "" }];
  return [{ de, a, act: "" }];
}

function sincronizarTabla(f, d) {
  const t = (f.tramos[d] || []).filter((x) => x.de != null && x.a != null && x.a > x.de);
  if (!t.length) { delete f.tramos[d]; return; }
  f.dias[d] = { de: hora(Math.min(...t.map((x) => x.de))), a: hora(Math.max(...t.map((x) => x.a))) };
}

function etiquetaDe(f) {
  if (f.etiqueta) return f.etiqueta.trim();
  if (f.seccion === "otras") return [f.lugar, f.cargo].map((x) => x.trim()).filter(Boolean).join(" – ");
  return f.cargo.trim();
}

function observacionesAuto() {
  return estado.filas.filter((f) => !filaVacia(f)).map((f) => {
    const tramos = [];
    for (const d of DIAS) for (const t of tramosDia(f, d)) tramos.push({ dia: d, de: t.de, a: t.a, actividad: t.act || "" });
    if (!tramos.length) return "";
    return escribirObservacion(etiquetaDe(f), tramos, f.nota, f.tipo === "curso");
  }).filter(Boolean);
}

function observaciones() {
  return estado.obsManual ? estado.obsTexto.split(/\n+/).map((l) => l.trim()).filter(Boolean) : observacionesAuto();
}

function paraRevisar() {
  return {
    origen: estado.origen,
    persona: estado.persona,
    filas: estado.filas.map((f) => ({
      seccion: f.seccion, lugar: f.lugar.trim(), cargo: f.cargo.trim(), jornada: f.jornada, desde: f.desde.trim(), hasta: f.hasta.trim(),
      dias: Object.fromEntries(DIAS.filter((d) => f.dias[d]?.de || f.dias[d]?.a).map((d) => [d, { de: f.dias[d].de || "", a: f.dias[d].a || "" }])),
      tipo: f.tipo || undefined, clase: f.seccion === "otras" ? f.clase || undefined : undefined,
      respaldo: f.respaldo, venceRespaldo: f.venceRespaldo,
    })),
    observaciones: observaciones(),
    firmas: estado.firmas,
    jornadaNombrada: estado.jornadaNombrada, cuartoAdicional: estado.cuartoAdicional,
  };
}

// ---------- la hoja (réplica del formulario de la ORH) ----------

const COLS = [111, 66, 41, 34.5, 35, ...[42, 35.5, 35, 35, 35, 35, 35.5, 35, 35.5, 35, 35, 35.5]]; // anchos del formulario, en puntos

function tabla(seccion, titulo) {
  const filas = estado.filas.filter((f) => f.seccion === seccion);
  const cols = COLS.map((w) => `<col style="width:${w}pt">`).join("") + '<col class="dj-col-detalle">';
  const cab1 = `<tr><th scope="col" rowspan="2">Lugar de Trabajo</th><th scope="col" rowspan="2">Cargo o Categoría</th><th scope="col" rowspan="2">Jornada de Trabajo</th><th scope="colgroup" colspan="2" class="dj-chico">Vigencia del nombramiento</th>${DIAS.map((d) => `<th scope="colgroup" colspan="2" class="dj-dia">${NOMBRE_DIA[d]}</th>`).join("")}<td class="dj-fuera" rowspan="2"></td></tr>`;
  const cab2 = `<tr><th scope="col">Desde</th><th scope="col">Hasta</th>${DIAS.map(() => '<th scope="col">De</th><th scope="col">A</th>').join("")}</tr>`;
  const cuerpo = filas.map((f, i) => {
    const n = i + 1, et = `${seccion === "ucr" ? "UCR" : "Otras"} fila ${n}`;
    const celda = (campo, ph, extra = "") => `<td><input data-f="${f.id}" data-c="${campo}" value="${esc(f[campo])}" aria-label="${et}: ${ph}"${extra}></td>`;
    const jornada = `<td><input data-f="${f.id}" data-c="jornada" value="${esc(f.jornada)}" list="dj-jornadas" aria-label="${et}: jornada (fracción de tiempo completo)" placeholder=""></td>`;
    const dias = DIAS.map((d) => {
      const con = f.tramos?.[d]?.length ? " data-detalle" : "";
      const v = f.dias[d] || {};
      return `<td><input data-f="${f.id}" data-d="${d}" data-x="de" value="${esc(v.de)}" inputmode="numeric" aria-label="${et}: ${NOMBRE_DIA[d]}, de"${con}></td><td><input data-f="${f.id}" data-d="${d}" data-x="a" value="${esc(v.a)}" inputmode="numeric" aria-label="${et}: ${NOMBRE_DIA[d]}, a"${con}></td>`;
    }).join("");
    const abierto = detalleAbierto === f.id;
    return `<tr data-fila="${f.id}"${abierto ? ' class="dj-activa"' : ""}>${celda("lugar", "lugar de trabajo")}${celda("cargo", "cargo o categoría")}${jornada}${celda("desde", "vigencia desde (d/m/aaaa)", ' placeholder="d/m/aaaa"')}${celda("hasta", "vigencia hasta (d/m/aaaa)", ' placeholder="d/m/aaaa"')}${dias}<td class="dj-fuera"><button type="button" class="dj-btn-detalle" data-detalle-de="${f.id}" aria-expanded="${abierto}" aria-controls="dj-detalle" title="Detalle de la fila: tramos, curso, respaldo">Detalle<span class="oculto"> de ${et}</span></button></td></tr>`;
  }).join("");
  const puedeAgregar = filas.length < FILAS_MAX;
  return `<table class="dj-tabla"><caption>${titulo}</caption><colgroup>${cols}</colgroup><thead>${cab1}${cab2}</thead><tbody>${cuerpo}</tbody></table>
  <div class="dj-mas">${puedeAgregar ? `<button type="button" class="dj-agregar" data-agregar="${seccion}">+ Agregar fila</button>` : ""}${filas.length > FILAS_MIN ? `<button type="button" class="dj-agregar" data-quitar="${seccion}">− Quitar la última fila vacía</button>` : ""}</div>`;
}

function dibujarHoja() {
  const p = estado.persona;
  const campo = (c, etq, extra = "") => `<label class="dj-dato dj-dato--${c}"><span>${etq}</span><input data-p="${c}" value="${esc(p[c])}"${extra}></label>`;
  const obs = observaciones();
  $("#dj-marco").innerHTML = `
  <div class="dj-hoja">
    <div class="dj-banda">
      <img src="${raiz}assets/img/orh-escudo-ucr.jpg" alt="Universidad de Costa Rica" class="dj-escudo" width="266" height="100">
      <img src="${raiz}assets/img/orh-logo.jpg" alt="ORH, Oficina de Recursos Humanos" class="dj-orh" width="401" height="101">
      <p class="dj-titulo">DECLARACION JURADA DE HORARIO Y JORNADA DE TRABAJO</p>
    </div>
    <div class="dj-persona">
      ${campo("nombre", "Nombre de la persona funcionaria:", ' autocomplete="name"')}
      ${campo("identificacion", "Identificación:")}
      ${campo("telefono", "Teléfono", ' inputmode="tel" autocomplete="tel"')}
      ${campo("unidad", "Unidad Académica o Administrativa:")}
      ${campo("correo", "Correo electrónico:", ' type="email" autocomplete="email"')}
    </div>
    <p class="dj-declaro">A continuación declaro los horarios y jornadas convenidos con:</p>
    ${tabla("ucr", "UNIVERSIDAD DE COSTA RICA (sea como docente y/o administrativo)")}
    ${tabla("otras", "OTRAS INSTITUCIONES PÚBLICAS, PRIVADAS Y FUNDACIONES")}
    <div class="dj-obs">
      <label for="dj-obs" class="dj-obs__t">Observaciones:</label>
      <textarea id="dj-obs" rows="${Math.max(4, obs.length + 1)}" ${estado.obsManual ? "" : "readonly"} aria-describedby="dj-obs-ayuda">${esc(obs.join("\n"))}</textarea>
    </div>
    <div class="dj-obs-ayuda" id="dj-obs-ayuda">
      <label><input type="checkbox" id="dj-obs-manual" ${estado.obsManual ? "checked" : ""}> Escribir las Observaciones a mano</label>
      <span>${estado.obsManual ? "Una línea por fila: «Etiqueta: K, J 08 a 12 y 13 a 15». Se comparan con la tabla." : "Salen solas de la tabla y del detalle de cada fila; el almuerzo (12:00–13:00) se descuenta solo."}</span>
    </div>
    <div class="dj-firmas">
      <div><span class="dj-linea"></span>Firma de la persona funcionaria Declarante*</div>
      <div><span class="dj-linea"></span>Firma superior jerárquico Unidad</div>
      <div><span class="dj-linea"></span>Visto bueno jefatura inmediata</div>
    </div>
  </div>
  <p class="dj-pie">*Se informa que el tratamiento de los datos proporcionados se rige de conformidad con la ley 8968 Ley de Protección de la Persona frente al tratamiento de sus datos personales.</p>
  <datalist id="dj-jornadas">${JORNADAS.map((j) => `<option value="${j}">`).join("")}</datalist>`;
  $("#dj-nombrada").value = estado.jornadaNombrada || "";
  $("#dj-cuarto").checked = !!estado.cuartoAdicional;
}

function refrescarObs() {
  const ta = $("#dj-obs");
  if (!ta || estado.obsManual) return;
  const obs = observaciones();
  ta.value = obs.join("\n");
  ta.rows = Math.max(4, obs.length + 1);
}

function refrescarCeldas(f) {
  for (const d of DIAS) for (const x of ["de", "a"]) {
    const el = document.querySelector(`input[data-f="${f.id}"][data-d="${d}"][data-x="${x}"]`);
    if (!el) continue;
    if (document.activeElement !== el) el.value = f.dias[d]?.[x] || "";
    el.toggleAttribute("data-detalle", !!f.tramos?.[d]?.length);
  }
}

// ---------- detalle de una fila ----------

function dibujarDetalle() {
  const caja = $("#dj-detalle");
  const f = estado.filas.find((x) => x.id === detalleAbierto);
  if (!f) { caja.hidden = true; caja.innerHTML = ""; return; }
  const filasSec = estado.filas.filter((x) => x.seccion === f.seccion);
  const n = filasSec.indexOf(f) + 1;
  const titulo = `${f.seccion === "ucr" ? "UCR" : "Otras instituciones"}, fila ${n}${f.cargo ? `: ${esc(f.cargo)}` : ""}`;
  const opciones = (lista, v) => lista.map(([k, t]) => `<option value="${k}"${k === (v || "") ? " selected" : ""}>${t}</option>`).join("");
  const curso = f.tipo === "curso";
  const dias = DIAS.map((d) => {
    const t = tramosDia(f, d);
    const filas = t.map((x, i) => `<li><input data-t="${d}|${i}|de" value="${hora(x.de)}" inputmode="numeric" aria-label="${NOMBRE_DIA[d]}, tramo ${i + 1}, de"> a <input data-t="${d}|${i}|a" value="${hora(x.a)}" inputmode="numeric" aria-label="${NOMBRE_DIA[d]}, tramo ${i + 1}, a">${curso ? `<select data-t="${d}|${i}|act" aria-label="${NOMBRE_DIA[d]}, tramo ${i + 1}, actividad">${opciones(ACTS, x.act)}</select>` : ""}<button type="button" class="dj-quitar" data-quitar-tramo="${d}|${i}" aria-label="Quitar el tramo ${i + 1} del ${NOMBRE_DIA[d]}">×</button></li>`).join("");
    const suma = t.reduce((s, x) => s + Math.max(0, x.a - x.de), 0);
    return `<div class="dj-dia-det"><h4>${NOMBRE_DIA[d]}${suma ? ` <span>${horas(suma)} h</span>` : ""}</h4><ul>${filas}</ul><button type="button" class="dj-agregar" data-agregar-tramo="${d}">+ Tramo</button></div>`;
  }).join("");
  const total = DIAS.reduce((s, d) => s + tramosDia(f, d).reduce((a, x) => a + Math.max(0, x.a - x.de), 0), 0);
  const fr = { "1/8": 0.125, "1/4": 0.25, "3/8": 0.375, "1/2": 0.5, "5/8": 0.625, "3/4": 0.75, "7/8": 0.875, "1 TC": 1 }[f.jornada];
  caja.hidden = false;
  caja.innerHTML = `
    <div class="dj-detalle__cab"><h3 id="dj-detalle-t">Detalle: ${titulo}</h3><button type="button" class="boton boton--secundario" data-cerrar-detalle>Cerrar</button></div>
    <div class="dj-detalle__campos">
      ${f.seccion === "ucr"
        ? `<label>Tipo de labor<select data-g="tipo">${opciones(TIPOS, f.tipo)}</select></label>`
        : `<label>Tipo de institución<select data-g="clase">${opciones(CLASES, f.clase || claseOtra({ lugar: f.lugar, cargo: f.cargo }))}</select></label>`}
      <label>Etiqueta en Observaciones<input data-g="etiqueta" value="${esc(f.etiqueta)}" placeholder="${f.tipo === "curso" ? "IF0004 Desarrollo de Software II" : esc(f.cargo || "Coordinación de Carrera …")}"></label>
      <label>Nota entre paréntesis (opcional)<input data-g="nota" value="${esc(f.nota)}" placeholder="Con base en el acuerdo …"></label>
      <label>Documento de respaldo<input data-g="respaldo" value="${esc(f.respaldo)}" placeholder="Acción de personal, oficio, acuerdo o contrato"></label>
      <label>El respaldo vence el<input data-g="venceRespaldo" value="${esc(f.venceRespaldo)}" placeholder="d/m/aaaa"></label>
    </div>
    <p class="dj-detalle__ayuda">${curso ? "Marque cada tramo como contacto, consulta o preparación (C1–C3). " : ""}Divida el día como lo trabaja; la tabla toma la primera y la última hora. Si no divide nada, el almuerzo (12:00–13:00) se descuenta solo. Escriba las horas en formato de 24 horas.</p>
    <div class="dj-dias-det">${dias}</div>
    <p class="dj-detalle__suma">Suma de la fila: <strong>${horas(total)} h</strong>${fr ? ` · ${f.jornada} son ${horas(fr * 2400)} h` : ""}</p>`;
}

// ---------- resultado ----------

function dibujarRevision() {
  const r = ultimo = revisar(paraRevisar());
  const caja = $("#dj-revision");
  if (!r.horas.length) { caja.innerHTML = '<p class="dj-vacio">Llene al menos una fila para ver la revisión.</p>'; return; }
  const filasHoras = r.horas.map((h) => `<tr class="${h.ok ? "" : "dj-mal"}"><th scope="row">${esc(h.fila)}</th><td>${esc(h.jornada || "—")}</td><td>${h.calculadas ? horas(h.calculadas) : "—"}</td><td>${h.esperadas != null ? horas(h.esperadas) : "—"}</td><td>${h.ok ? "Bien" : "No coincide"}</td></tr>`).join("");
  const t = r.totales;
  const firmas = r.firmas
    ? `<p><strong>Firmas:</strong> ${[["declarante", "persona declarante"], ["superior", "superior jerárquico"], ["jefatura", "visto bueno de la jefatura"]].map(([k, n]) => `${n}: ${r.firmas[k] === true ? "se ve firmada" : r.firmas[k] === false ? "<strong>no se ve la firma</strong>" : "no se pudo revisar"}`).join(" · ")}.</p>`
    : `<p><strong>Firmas pendientes (B11):</strong> el PDF sale sin firmar. Fírmelo digitalmente y recoja la firma del superior jerárquico de la unidad y el visto bueno de la jefatura inmediata.</p>`;
  const ia = iaComentarios ? `<h3>Comentarios de la IA</h3><p class="dj-nota">No sustituyen las reglas de arriba; verifíquelos.</p>${iaComentarios.length ? `<ul class="dj-lista">${iaComentarios.map((c) => `<li><span class="dj-regla">${esc(c.regla)}</span> ${c.tipo === "error" ? "<strong>Posible error:</strong> " : ""}${esc(c.texto)}</li>`).join("")}</ul>` : "<p>La IA no agregó nada.</p>"}` : "";
  caja.innerHTML = `
    <p class="dj-veredicto dj-veredicto--${r.nivel}"><strong>${r.veredicto}.</strong> ${r.errores.length ? `${r.errores.length} ${r.errores.length === 1 ? "error" : "errores"} por corregir.` : "No hay errores en las reglas que se pueden calcular."}</p>
    <div class="dj-tabla-horas" tabindex="0" role="region" aria-label="Tabla de horas"><table><caption>Horas por fila (descontando el almuerzo)</caption>
      <thead><tr><th scope="col">Fila</th><th scope="col">Jornada</th><th scope="col">Calculadas</th><th scope="col">Esperadas</th><th scope="col">Estado</th></tr></thead>
      <tbody>${filasHoras}</tbody>
      <tfoot><tr><th scope="row">UCR</th><td>${textoJornada(t.fraccionUcr || 0)}</td><td>${horas(t.ucr || 0)} h</td><td colspan="2">Tope 40 h (A1)</td></tr>
      <tr><th scope="row">Estatal (UCR + estatales)</th><td></td><td>${horas(t.estatal || 0)} h</td><td colspan="2">Tope 66 h (A3)</td></tr>
      <tr><th scope="row">Total con privadas y fundaciones</th><td></td><td>${horas(t.total || 0)} h</td><td colspan="2">Alerta 60 h (A11)</td></tr></tfoot></table></div>
    ${r.errores.length ? `<h3>Errores que hay que corregir</h3><ol class="dj-lista dj-errores">${r.errores.map((e) => `<li class="dj-${e.gravedad}"><span class="dj-regla">${esc(e.regla)}</span> <span class="dj-grav">${e.gravedad === "grave" ? "Grave" : "Menor"}</span> <strong>${esc(e.donde)}.</strong> ${esc(e.texto)} <em>Corrección:</em> ${esc(e.correccion)}</li>`).join("")}</ol>` : ""}
    ${firmas}
    ${r.verificar.length ? `<h3>Puntos a verificar o respaldar</h3><ul class="dj-lista">${r.verificar.map((v) => `<li><span class="dj-regla">${esc(v.regla)}</span> ${esc(v.texto)}</li>`).join("")}</ul>` : ""}
    ${notasLectura.length ? `<h3>Lo que se notó al leer el archivo</h3><ul class="dj-lista">${notasLectura.map((n) => `<li><span class="dj-regla">${esc(n.regla)}</span> ${esc(n.texto)}</li>`).join("")}</ul>` : ""}
    ${r.bien.length ? `<h3>Lo que está bien</h3><ul class="dj-lista dj-bien">${r.bien.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
    ${ia}`;
}

let espera = null;
function cambio({ hoja = false, detalle = false } = {}) {
  if (hoja) dibujarHoja(); else refrescarObs();
  if (detalle) dibujarDetalle();
  clearTimeout(espera);
  espera = setTimeout(() => { dibujarRevision(); guardar(); }, 200);
}

// ---------- eventos ----------

const marco = $("#dj-marco");
marco.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.p) { estado.persona[el.dataset.p] = el.value; return cambio(); }
  if (el.id === "dj-obs") { estado.obsTexto = el.value; return cambio(); }
  const f = estado.filas.find((x) => x.id === el.dataset.f);
  if (!f) return;
  if (el.dataset.c) {
    f[el.dataset.c] = el.value;
    return cambio({ detalle: detalleAbierto === f.id && el.dataset.c !== "lugar" });
  }
  if (el.dataset.d) {
    const d = el.dataset.d;
    f.dias[d] = { ...(f.dias[d] || {}), [el.dataset.x]: el.value };
    if (f.tramos?.[d]) { delete f.tramos[d]; el.removeAttribute("data-detalle"); }
    return cambio({ detalle: detalleAbierto === f.id });
  }
});
marco.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "dj-obs-manual") {
    if (el.checked) estado.obsTexto = observacionesAuto().join("\n");
    estado.obsManual = el.checked;
    return cambio({ hoja: true });
  }
  const f = estado.filas.find((x) => x.id === el.dataset.f);
  if (f && el.dataset.d) { // normaliza la hora al salir: «8» → «08:00»
    const v = normalHora(el.value);
    f.dias[el.dataset.d][el.dataset.x] = v;
    el.value = v;
    cambio({ detalle: detalleAbierto === f.id });
  }
  if (f && (el.dataset.c === "desde" || el.dataset.c === "hasta")) {
    const d = fecha(el.value);
    if (d && estado.origen === "formulario") { f[el.dataset.c] = el.value = textoFecha(d); cambio(); }
  }
});
marco.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.detalleDe) {
    detalleAbierto = detalleAbierto === b.dataset.detalleDe ? null : b.dataset.detalleDe;
    dibujarHoja(); dibujarDetalle();
    if (detalleAbierto) $("#dj-detalle").scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  if (b.dataset.agregar) {
    const sec = b.dataset.agregar;
    const ultimoDeSec = estado.filas.map((f) => f.seccion).lastIndexOf(sec);
    estado.filas.splice(ultimoDeSec + 1, 0, nuevaFila(sec));
    return cambio({ hoja: true });
  }
  if (b.dataset.quitar) {
    const lista = estado.filas.filter((f) => f.seccion === b.dataset.quitar);
    const vacia = [...lista].reverse().find(filaVacia);
    if (vacia && lista.length > FILAS_MIN) { estado.filas.splice(estado.filas.indexOf(vacia), 1); if (detalleAbierto === vacia.id) detalleAbierto = null; }
    return cambio({ hoja: true, detalle: true });
  }
});

const detalle = $("#dj-detalle");
function filaDetalle() { return estado.filas.find((x) => x.id === detalleAbierto); }
detalle.addEventListener("input", (e) => {
  const f = filaDetalle(), el = e.target;
  if (!f) return;
  if (el.dataset.g) {
    f[el.dataset.g] = el.value;
    if (el.dataset.g === "tipo") return cambio({ detalle: true });
    return cambio();
  }
});
detalle.addEventListener("change", (e) => {
  const f = filaDetalle(), el = e.target;
  if (!f || !el.dataset.t) return;
  const [d, i, campo] = el.dataset.t.split("|");
  f.tramos[d] = tramosDia(f, d).map((x) => ({ ...x }));
  if (campo === "act") f.tramos[d][+i].act = el.value;
  else {
    const m = minutos(el.value);
    if (m == null) { el.setAttribute("aria-invalid", "true"); return; }
    el.removeAttribute("aria-invalid");
    f.tramos[d][+i][campo] = m;
  }
  sincronizarTabla(f, d);
  refrescarCeldas(f);
  cambio({ detalle: true });
});
detalle.addEventListener("click", (e) => {
  const f = filaDetalle(), b = e.target.closest("button");
  if (!f || !b) return;
  if ("cerrarDetalle" in b.dataset) { const id = detalleAbierto; detalleAbierto = null; dibujarHoja(); dibujarDetalle(); document.querySelector(`[data-detalle-de="${id}"]`)?.focus(); return; }
  if (b.dataset.agregarTramo) {
    const d = b.dataset.agregarTramo;
    const t = tramosDia(f, d).map((x) => ({ ...x }));
    const fin = t.length ? t[t.length - 1].a : 480;
    const de = fin === ALM[0] ? ALM[1] : fin;
    t.push({ de, a: Math.min(de + 120, 22 * 60), act: "" });
    f.tramos[d] = t;
    sincronizarTabla(f, d); refrescarCeldas(f);
    return cambio({ detalle: true });
  }
  if (b.dataset.quitarTramo) {
    const [d, i] = b.dataset.quitarTramo.split("|");
    const t = tramosDia(f, d).map((x) => ({ ...x }));
    t.splice(+i, 1);
    f.tramos[d] = t;
    if (!t.length) { delete f.tramos[d]; delete f.dias[d]; } else sincronizarTabla(f, d);
    refrescarCeldas(f);
    return cambio({ detalle: true });
  }
});

$("#dj-nombrada").addEventListener("change", (e) => { estado.jornadaNombrada = e.target.value; cambio(); });
$("#dj-cuarto").addEventListener("change", (e) => { estado.cuartoAdicional = e.target.checked; cambio(); });

$("#dj-borrar").addEventListener("click", () => {
  if (!confirmar("¿Borrar todo lo escrito en el formulario?")) return;
  estado = vacio(); detalleAbierto = null; iaComentarios = null; notasLectura = [];
  if (modo === "pdf") { borrador = null; ponerModo("formulario"); }
  aviso("");
  cambio({ hoja: true, detalle: true });
});

// confirm() bloquea; se usa solo para borrar todo.
function confirmar(t) { try { return window.confirm(t); } catch { return true; } }

function aviso(t) { const a = $("#dj-aviso"); a.textContent = t; a.hidden = !t; }

$("#dj-pdf").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  const original = b.textContent;
  b.textContent = "Generando…";
  try {
    const r = ultimo || revisar(paraRevisar());
    const { generarPDF } = await import("./declaracion-pdf.js");
    const bytes = await generarPDF({ ...paraRevisar(), persona: estado.persona, formulario: estado }, raiz);
    const nombre = `declaracion-jurada-${(estado.persona.nombre || "borrador").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "borrador"}.pdf`;
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    aviso(r.nivel === "mal" ? "El PDF se generó, pero la revisión tiene errores graves: corríjalos antes de firmarlo." : "PDF generado. Fírmelo digitalmente y recoja las firmas del superior jerárquico y de la jefatura.");
  } catch (err) {
    console.error(err);
    aviso("No se pudo generar el PDF. Recargue la página e intente de nuevo.");
  } finally { b.disabled = false; b.textContent = original; }
});

// ---------- comentarios de la IA (solo con el servidor de la Sede) ----------

async function hayServidor() {
  if (servidor !== null) return servidor;
  try {
    const r = await fetch(raiz + "api/health"); // el servidor de la Sede; en GitHub Pages no existe
    servidor = r.ok && (r.headers.get("content-type") || "").startsWith("application/json");
  } catch { servidor = false; }
  return servidor;
}

$("#dj-ia").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  b.disabled = true;
  const original = b.textContent;
  b.textContent = "Consultando…";
  try {
    const d = paraRevisar();
    delete d.persona; delete d.firmas;
    const hallazgos = (ultimo?.errores || []).map((x) => `${x.regla}: ${x.texto}`).concat((ultimo?.verificar || []).map((x) => `${x.regla} (verificar): ${x.texto}`));
    const r = await fetch(raiz + "api/declaracion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modo: "revisar", declaracion: d, hallazgos }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.error || `error ${r.status}`);
    iaComentarios = j.comentarios || [];
    dibujarRevision();
  } catch (err) {
    aviso(`La IA no respondió (${err.message}). La revisión con las reglas sigue siendo válida.`);
  } finally { b.disabled = false; b.textContent = original; }
});

// ---------- modos: formulario propio o PDF subido ----------

function ponerModo(m) {
  modo = m;
  for (const b of document.querySelectorAll(".dj-modo")) b.setAttribute("aria-pressed", String(b.dataset.modo === m));
  $("#dj-subir").hidden = m !== "pdf";
  if (m === "formulario" && borrador) { estado = borrador; borrador = null; aviso(""); iaComentarios = null; notasLectura = []; cambio({ hoja: true, detalle: true }); }
}
for (const b of document.querySelectorAll(".dj-modo")) b.addEventListener("click", () => {
  ponerModo(b.dataset.modo);
  if (b.dataset.modo === "pdf") $("#dj-archivo").focus();
});

// Lo llama declaracion-subir.js cuando termina de leer un archivo.
export function cargarLeido(datos, { firmas = null, archivo = "", nota = "", propio = false, notas = [] } = {}) {
  notasLectura = notas;
  if (!borrador && estado.origen === "formulario") borrador = estado;
  const ucr = (datos.filas || []).filter((f) => f.seccion !== "otras"), otras = (datos.filas || []).filter((f) => f.seccion === "otras");
  const aFila = (f, s) => ({ ...nuevaFila(s), lugar: f.lugar || "", cargo: f.cargo || "", jornada: f.jornada || "", desde: f.desde || "", hasta: f.hasta || "", dias: f.dias || {}, etiqueta: f.etiqueta || "", tipo: f.tipo || "", clase: f.clase || "", respaldo: f.respaldo || "", venceRespaldo: f.venceRespaldo || "", nota: f.nota || "", tramos: f.tramos || {} });
  const relleno = (lista, s) => lista.map((f) => aFila(f, s)).concat([...Array(Math.max(0, FILAS_MIN - lista.length))].map(() => nuevaFila(s)));
  estado = {
    ...vacio(),
    persona: { ...vacio().persona, unidad: datos.unidad || "", ...(datos.persona || {}) },
    filas: relleno(ucr, "ucr").concat(relleno(otras, "otras")),
    obsManual: !propio, obsTexto: (datos.observaciones || []).join("\n"),
    jornadaNombrada: datos.jornadaNombrada || "", cuartoAdicional: !!datos.cuartoAdicional,
    origen: propio ? "formulario-pdf" : "pdf", firmas,
  };
  if (propio && datos.obsManual) { estado.obsManual = true; }
  detalleAbierto = null; iaComentarios = null;
  aviso(nota || `Datos leídos de «${archivo}». Compárelos con su PDF: si la lectura se equivocó en algún valor, corríjalo aquí y la revisión se actualiza.`);
  cambio({ hoja: true, detalle: true });
  $("#dj-resultado").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- arranque ----------

dibujarHoja();
dibujarDetalle();
dibujarRevision();
hayServidor().then((s) => { $("#dj-ia").hidden = !s; });
import("./declaracion-subir.js").then((m) => m.iniciar({ raiz, cargarLeido, hayServidor })).catch((e) => console.error(e));
