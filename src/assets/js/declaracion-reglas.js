// Reglas de la Declaración Jurada de Horario y Jornada de Trabajo (ORH, UCR).
// Mismo motor para el formulario del sitio y para los PDF que se suben: recibe la declaración tal como
// está escrita (tabla con un «De» y un «A» por día, y las Observaciones línea por línea) y devuelve
// el veredicto, la tabla de horas, los errores, los puntos a verificar y lo que está bien.
// Los códigos de regla (A1, B4, C2…) son los del documento de reglas del revisor (página «Declaración Jurada»).
// No usa el DOM: se prueba con node (herramientas/probar_declaracion.mjs).

export const DIAS = ["L", "K", "M", "J", "V", "S"];
export const NOMBRE_DIA = { L: "Lunes", K: "Martes", M: "Miércoles", J: "Jueves", V: "Viernes", S: "Sábado" };
export const JORNADAS = ["1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8", "1 TC"];
const ALMUERZO = [12 * 60, 13 * 60];
// C1: horas de contacto permitidas según la jornada del curso (criterio de la coordinación de carrera).
const CONTACTO = { 0.5: [7, 8], 0.375: [5, 6], 0.25: [3, 4], 0.125: [1, 2] };
const ACTIVIDADES = { contacto: "Contacto", consulta: "Consulta", preparacion: "Preparación" };

// ---------- utilidades de horas, fechas y jornadas ----------

export function minutos(txt) {
  if (txt == null) return null;
  const t = String(txt).trim().toLowerCase().replace(/\s+/g, "").replace(/h(rs?)?$/, "");
  if (!t) return null;
  let m = t.match(/^(\d{1,2})(?:[:.](\d{1,2}))?(a\.?m\.?|p\.?m\.?|md|m\.d\.)?$/) || t.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  let h = +m[1], mi = m[2] ? +m[2] : 0;
  const suf = m[3] || "";
  if (suf.startsWith("p") && h < 12) h += 12;
  if (suf.startsWith("a") && h === 12) h = 0;
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

export function hora(min) {
  if (min == null) return "";
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
}

// «08:00» → «08», «08:30» → «08:30» (como se escribe en Observaciones)
export function horaCorta(min) {
  return min % 60 ? hora(min) : String(Math.floor(min / 60)).padStart(2, "0");
}

export function normalHora(txt) {
  const m = minutos(txt);
  return m == null ? String(txt ?? "").trim() : hora(m);
}

export function horas(min) {
  const h = Math.round(min / 6) / 10;
  return String(h).replace(".", ",");
}

export function fraccion(txt) {
  if (txt == null) return null;
  const t = String(txt).trim().toLowerCase().replace(",", ".").replace(/\s+/g, " ");
  if (!t) return null;
  if (/^(1\s*)?(tc|t\.c\.|tiempo completo)$/.test(t) || t === "1") return 1;
  if (t === "½" || t === "medio tiempo") return 0.5;
  if (t === "¼") return 0.25;
  const m = t.match(/^(\d+)\s*\/\s*(\d+)(?:\s*(tc|t\.c\.))?$/);
  if (m && +m[2]) return +m[1] / +m[2];
  const d = t.match(/^\d*\.\d+$/);
  return d ? +t : null;
}

export function textoJornada(f) {
  const n = { 0.125: "1/8", 0.25: "1/4", 0.375: "3/8", 0.5: "1/2", 0.625: "5/8", 0.75: "3/4", 0.875: "7/8", 1: "1 TC", 1.25: "1¼ TC" };
  return n[Math.round(f * 1000) / 1000] || String(Math.round(f * 1000) / 1000).replace(".", ",") + " TC";
}

export function fecha(txt) {
  const m = String(txt ?? "").trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (!m) return null;
  const a = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  const d = new Date(Date.UTC(a, +m[2] - 1, +m[1]));
  return d.getUTCDate() === +m[1] && d.getUTCMonth() === +m[2] - 1 ? d : null;
}

export function textoFecha(d) {
  return d ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}` : "";
}

function solapan(a, b) { return a[0] < b[1] && b[0] < a[1]; }

function unir(tramos) {
  const t = tramos.filter((x) => x[1] > x[0]).map((x) => [x[0], x[1]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of t) {
    if (out.length && x[0] <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], x[1]);
    else out.push(x);
  }
  return out;
}

const suma = (t) => t.reduce((s, x) => s + (x[1] - x[0]), 0);
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---------- Observaciones ----------

const RE_RANGO = /(\d{1,2}(?:[:.]\d{2})?)\s*(?:a\.?\s*m\.?|p\.?\s*m\.?|md|m\.d\.)?\s*(?:a|al|-|–|—|hasta)\s*(\d{1,2}(?:[:.]\d{2})?)\s*(a\.?\s*m\.?|p\.?\s*m\.?|md|m\.d\.)?/y;

function rangoHoras(a, b, suf) {
  let x = minutos(a), y = minutos(b);
  if (x == null || y == null) return null;
  if (suf && /^p/i.test(suf) && y < 12 * 60) y += 12 * 60;
  // «1 a 5» se lee de la tarde: nadie trabaja de 1 a 5 de la madrugada en una declaración
  if (x < 7 * 60 && x >= 60) x += 12 * 60;
  if (y <= x && y + 12 * 60 > x && y < 12 * 60) y += 12 * 60;
  return y > x ? [x, y] : null;
}

// Lee una línea de Observaciones: «Etiqueta: [Actividad:] DÍAS h a h y h a h, DÍAS h a h – Actividad: …»
export function leerObservacion(linea) {
  const original = String(linea ?? "").trim();
  const notas = [];
  let txt = original.replace(/\(([^)]*)\)/g, (_, n) => { notas.push(n.trim()); return " "; });
  let etiqueta = "";
  const i = txt.search(/:\s*(?:(?:contacto|consulta|atenci[oó]n|preparaci[oó]n|clases|lecciones)\b|[LKMJVS](?:\s*[,y-]\s*[LKMJVS])*\s+\d)/i);
  if (i > 0) { etiqueta = txt.slice(0, i).trim(); txt = txt.slice(i + 1); }
  else {
    const j = txt.search(/\b[LKMJVS](?:\s*[,y]\s*[LKMJVS])*\s+\d/);
    if (j > 0) { etiqueta = txt.slice(0, j).replace(/[:\-–\s]+$/, "").trim(); txt = txt.slice(j); }
  }
  const tramos = [], dudas = [];
  let dias = [], actividad = "", pos = 0;
  const s = txt;
  while (pos < s.length) {
    const resto = s.slice(pos);
    let m;
    if ((m = resto.match(/^\s*(contacto|consulta|atenci[oó]n|preparaci[oó]n|clases|lecciones)\s*:?/i))) {
      const p = sinTildes(m[1]);
      actividad = p.startsWith("prep") ? "preparacion" : p === "consulta" || p.startsWith("atenc") ? "consulta" : "contacto";
      pos += m[0].length; dias = []; continue;
    }
    if ((m = resto.match(/^\s*([LKMJVS])\s*(?:a|-|–)\s*([LKMJVS])\b(?!\s*\d)/))) {
      const a = DIAS.indexOf(m[1]), b = DIAS.indexOf(m[2]);
      if (a >= 0 && b >= a) { dias = DIAS.slice(a, b + 1); pos += m[0].length; continue; }
    }
    if ((m = resto.match(/^\s*([LKMJVS](?:\s*(?:,|y|e)\s*[LKMJVS])*)\b(?![a-záéíóúñ])/))) {
      dias = m[1].split(/\s*(?:,|y|e)\s*/).map((x) => x.trim()).filter(Boolean);
      pos += m[0].length; continue;
    }
    RE_RANGO.lastIndex = 0;
    const r = RE_RANGO.exec(resto.replace(/^\s+/, ""));
    if (r) {
      const salto = resto.length - resto.replace(/^\s+/, "").length;
      const rango = rangoHoras(r[1], r[2], r[3]);
      if (!dias.length) dudas.push(`horas sin día: «${r[0].trim()}»`);
      else if (!rango) dudas.push(`horas que no se entienden: «${r[0].trim()}»`);
      else for (const d of dias) tramos.push({ dia: d, de: rango[0], a: rango[1], actividad });
      pos += salto + r[0].length; continue;
    }
    pos += 1;
  }
  return { texto: original, etiqueta, notas, tramos, dudas };
}

// Escribe las Observaciones de una fila a partir de sus tramos (lo usa el formulario del sitio).
export function escribirObservacion(etiqueta, tramos, nota = "", esCurso = false) {
  const grupos = new Map();
  const acts = esCurso ? ["contacto", "consulta", "preparacion", ""] : [null];
  const partes = [];
  for (const act of acts) {
    const porDia = {};
    for (const t of tramos) {
      if (act !== null && (t.actividad || "") !== act) continue;
      (porDia[t.dia] ||= []).push([t.de, t.a]);
    }
    grupos.clear();
    for (const d of DIAS) {
      if (!porDia[d]) continue;
      const clave = unir(porDia[d]).map((x) => `${horaCorta(x[0])} a ${horaCorta(x[1])}`).join(" y ");
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(d);
    }
    if (!grupos.size) continue;
    const txt = [...grupos].map(([h, ds]) => `${ds.join(", ")} ${h}`).join(", ");
    partes.push(act ? `${ACTIVIDADES[act]}: ${txt}` : act === "" && esCurso ? `Sin clasificar: ${txt}` : txt);
  }
  const cuerpo = partes.join(" – ");
  return `${etiqueta ? etiqueta + ": " : ""}${cuerpo}${nota ? ` (${nota})` : ""}`.trim();
}

// ---------- revisión ----------

function nombreFila(f) {
  const n = [f.cargo, f.lugar].filter(Boolean).join(", ");
  return `${f.seccion === "ucr" ? "UCR" : "Otra institución"} fila ${f.n}${n ? ` (${n})` : ""}`;
}

export function claseOtra(f) {
  if (f.clase) return f.clase;
  const t = sinTildes(`${f.lugar} ${f.cargo}`);
  if (/fundevi|fundacion|fundaci/.test(t)) return "fundacion";
  if (/\b(una|tec|uned|utn|ucr|cunlimon|colegio universitario|mep|ccss|ice|inder|ina|ministerio|municipalidad|escuela|liceo|colegio|cuc|cun|poder judicial|asamblea|conare|universidad nacional|universidad tecnica)\b/.test(t)) return "estatal";
  if (/\b(s\.?a\.?|srl|ltda|privad|universidad latina|ulacit|uisil|ulatina|empresa)\b/.test(t)) return "privada";
  return "";
}

const esGestion = (f) => /coordin|direcc|director|jef|decan|vicerrector|gestion|administra/.test(sinTildes(f.cargo));

/**
 * declaracion = {
 *   persona: {nombre, identificacion, telefono, unidad, correo},
 *   filas: [{seccion: "ucr"|"otras", lugar, cargo, jornada, desde, hasta, dias: {L: {de, a}, …},
 *            tipo?: "curso"|"coordinacion"|"investigacion"|"accion"|"administrativo"|"otro",
 *            clase?: "estatal"|"privada"|"fundacion", respaldo?, venceRespaldo?}],
 *   observaciones: ["línea", …],
 *   firmas?: {declarante, superior, jefatura} (true/false/null),
 *   jornadaNombrada?: "1 TC", cuartoAdicional?: bool, origen: "formulario"|"pdf"
 * }
 */
export function revisar(decl) {
  const errores = [], verificar = [], bien = [];
  const err = (regla, gravedad, donde, texto, correccion) => errores.push({ regla, gravedad, donde, texto, correccion });
  const ver = (regla, texto) => verificar.push({ regla, texto });

  // filas con algo escrito
  const filas = [];
  for (const sec of ["ucr", "otras"]) {
    let n = 0;
    for (const f of decl.filas || []) {
      if (f.seccion !== sec) continue;
      n++;
      const dias = {};
      for (const d of DIAS) {
        const x = f.dias?.[d] || {};
        const de = minutos(x.de), a = minutos(x.a);
        if (x.de || x.a) dias[d] = { de, a, deTxt: x.de || "", aTxt: x.a || "" };
      }
      const vacia = !f.lugar && !f.cargo && !f.jornada && !f.desde && !f.hasta && !Object.keys(dias).length;
      if (vacia) continue;
      filas.push({ ...f, n, dias, frac: fraccion(f.jornada), clase: sec === "otras" ? claseOtra(f) : "ucr" });
    }
  }
  if (!filas.length) {
    return { veredicto: "No se debe firmar así", nivel: "mal", filas: [], horas: [], totales: {}, errores: [{ regla: "—", gravedad: "grave", donde: "Tabla", texto: "La declaración no tiene ninguna fila llena.", correccion: "Agregue al menos su nombramiento en la UCR." }], verificar: [], bien: [], observaciones: [] };
  }

  // 1. datos de cada fila
  for (const f of filas) {
    const donde = nombreFila(f);
    const faltan = [];
    if (!f.lugar) faltan.push("lugar de trabajo");
    if (!f.cargo) faltan.push("cargo o categoría");
    if (!f.jornada) faltan.push("jornada");
    if (!f.desde) faltan.push("vigencia desde");
    if (!f.hasta) faltan.push("vigencia hasta");
    if (!Object.keys(f.dias).length) faltan.push("horario");
    if (faltan.length) err("B11", "grave", donde, `Faltan datos: ${faltan.join(", ")}.`, "Complete cada celda de la fila; una fila a medias no se puede revisar ni firmar.");
    if (f.jornada && f.frac == null) err("B1", "grave", donde, `La jornada «${f.jornada}» no es una fracción de tiempo completo.`, `Use una de estas: ${JORNADAS.join(", ")}.`);
    for (const d of Object.keys(f.dias)) {
      const x = f.dias[d];
      if (x.de == null || x.a == null) err("B11", "grave", `${donde}, ${NOMBRE_DIA[d]}`, `Horario incompleto o ilegible: «${x.deTxt || "—"}» a «${x.aTxt || "—"}».`, "Escriba la hora de inicio y la de fin en formato de 24 horas (por ejemplo 13:00).");
      else if (x.a <= x.de) err("B11", "grave", `${donde}, ${NOMBRE_DIA[d]}`, `La hora final (${hora(x.a)}) no es posterior a la inicial (${hora(x.de)}).`, "Corrija el horario; use formato de 24 horas.");
    }
  }

  // 2. fechas (B6, B7)
  const formatos = new Set();
  for (const f of filas) {
    const donde = nombreFila(f);
    for (const [campo, v] of [["desde", f.desde], ["hasta", f.hasta]]) {
      if (!v) continue;
      const d = fecha(v);
      if (!d) { err("B7", "grave", `${donde}, vigencia ${campo}`, `La fecha «${v}» no es válida.`, "Escríbala como d/m/aaaa (por ejemplo 20/7/2026)."); continue; }
      formatos.add(/\//.test(v) && /\d{4}$/.test(v) ? "d/m/aaaa" : v.replace(/\d+/g, (x) => "#".repeat(Math.min(x.length, 4))));
    }
    const a = fecha(f.desde), b = fecha(f.hasta);
    if (a && b && b < a) err("B6", "grave", donde, `La vigencia termina (${f.hasta}) antes de empezar (${f.desde}).`, "Corrija las fechas según el nombramiento.");
    const vence = fecha(f.venceRespaldo);
    if (b && vence && b > vence) err("B6", "grave", donde, `La vigencia declarada llega al ${f.hasta}, pero el respaldo vence el ${f.venceRespaldo}.`, `Declare hasta ${f.venceRespaldo} o consiga el respaldo que cubra el resto del periodo.`);
  }
  const malas = [...formatos].filter((x) => x !== "d/m/aaaa");
  if (malas.length) err("B7", "menor", "Vigencias", formatos.size > 1 && formatos.has("d/m/aaaa") ? "Las fechas mezclan formatos." : "Las fechas no usan el formato d/m/aaaa (usan guiones u otro separador).", "Escriba todas las fechas como d/m/aaaa, por ejemplo 20/7/2026.");

  // 3. Observaciones: se leen y se asignan a la fila cuyo horario las contiene (B4)
  const obs = (decl.observaciones || []).map((l) => String(l).trim()).filter(Boolean).map(leerObservacion);
  for (const o of obs) {
    o.fila = null;
    if (!o.tramos.length) { o.sinHorario = true; continue; }
    let mejor = null;
    for (const f of filas) {
      let dentro = 0, cruce = 0;
      for (const t of o.tramos) {
        const x = f.dias[t.dia];
        if (!x || x.de == null || x.a == null) continue;
        if (t.de >= x.de && t.a <= x.a) dentro++;
        if (solapan([t.de, t.a], [x.de, x.a])) cruce++;
      }
      const etq = sinTildes(o.etiqueta), cargo = sinTildes(f.cargo), lugar = sinTildes(f.lugar);
      const pista = (cargo && etq.includes(cargo)) || (lugar && etq.includes(lugar)) ? 0.5 : 0;
      const puntos = dentro * 2 + cruce + pista + (dentro === o.tramos.length ? 100 : 0);
      if (cruce && (!mejor || puntos > mejor.puntos)) mejor = { f, puntos, completa: dentro === o.tramos.length };
    }
    if (mejor) { o.fila = mejor.f; o.completa = mejor.completa; }
  }
  for (const o of obs) {
    if (o.dudas.length) err("B4", "menor", `Observaciones: «${o.texto.slice(0, 60)}${o.texto.length > 60 ? "…" : ""}»`, `Parte del horario no se puede leer (${o.dudas.join("; ")}).`, "Escriba cada tramo como «K 08 a 12 y 13 a 15»: día, hora inicial «a» hora final.");
    if (o.sinHorario) continue;
    if (!o.fila) err("B4", "grave", `Observaciones: «${o.texto.slice(0, 70)}»`, "Esta línea no coincide con el horario de ninguna fila de la tabla.", "Corrija la línea o la tabla para que digan los mismos días y horas.");
  }

  // 4. horas de cada fila (B1, B3, B4)
  for (const f of filas) {
    const donde = nombreFila(f);
    const mias = obs.filter((o) => o.fila === f);
    f.obs = mias;
    f.tramos = {};
    const porDiaObs = {};
    for (const o of mias) for (const t of o.tramos) (porDiaObs[t.dia] ||= []).push(t);
    f.efectivas = 0;
    f.crudas = 0;
    for (const d of DIAS) {
      const x = f.dias[d];
      const tObs = porDiaObs[d];
      if (x && x.de != null && x.a != null && x.a > x.de) {
        f.crudas += x.a - x.de;
        if (tObs) {
          const u = unir(tObs.map((t) => [t.de, t.a]));
          f.tramos[d] = u;
          const ini = u[0][0], fin = u[u.length - 1][1];
          if (ini !== x.de || fin !== x.a) err("B4", "grave", `${donde}, ${NOMBRE_DIA[d]}`, `La tabla dice ${hora(x.de)}–${hora(x.a)}, pero las Observaciones dicen ${u.map((y) => `${hora(y[0])}–${hora(y[1])}`).join(" y ")}.`, "Deje los mismos horarios en la tabla y en las Observaciones.");
          if (u.length === 1 && solapan(u[0], ALMUERZO)) err("B3", "grave", `${donde}, ${NOMBRE_DIA[d]}`, `Las Observaciones declaran ${hora(u[0][0])}–${hora(u[0][1])} de corrido, sin descontar el almuerzo (12:00–13:00).`, `Divida el tramo (${horaCorta(u[0][0])} a 12 y 13 a ${horaCorta(u[0][1])}) o explique el almuerzo en Observaciones.`);
        } else {
          let t = [[x.de, x.a]];
          if (x.de < ALMUERZO[0] && x.a > ALMUERZO[1]) {
            t = [[x.de, ALMUERZO[0]], [ALMUERZO[1], x.a]];
            err("B3", "grave", `${donde}, ${NOMBRE_DIA[d]}`, `El tramo ${hora(x.de)}–${hora(x.a)} atraviesa el almuerzo y ninguna Observación lo divide: se lee como ${horas(x.a - x.de)} h en vez de ${horas(suma(t))} h.`, `Agregue en Observaciones «${d} ${horaCorta(x.de)} a 12 y 13 a ${horaCorta(x.a)}» o divida el horario.`);
          } else if (x.de < ALMUERZO[1] && x.a > ALMUERZO[0] && (x.de > ALMUERZO[0] || x.a < ALMUERZO[1])) {
            ver("B3", `${donde}, ${NOMBRE_DIA[d]}: el tramo ${hora(x.de)}–${hora(x.a)} toca la hora de almuerzo; confirme que no es tiempo de almuerzo.`);
          }
          f.tramos[d] = t;
        }
        f.efectivas += suma(f.tramos[d]);
      } else if (tObs) {
        const u = unir(tObs.map((t) => [t.de, t.a]));
        err("B4", "grave", `${donde}, ${NOMBRE_DIA[d]}`, `Las Observaciones declaran ${NOMBRE_DIA[d]} ${u.map((y) => `${hora(y[0])}–${hora(y[1])}`).join(" y ")}, pero la tabla no tiene horario ese día.`, "Agregue el horario en la tabla o quítelo de las Observaciones.");
      }
    }
    // tramos de la Observación que caen fuera del horario de la tabla
    for (const o of mias) if (!o.completa) {
      const fuera = o.tramos.filter((t) => { const x = f.dias[t.dia]; return !x || x.de == null || t.de < x.de || t.a > x.a; });
      for (const t of fuera.slice(0, 3)) if (f.dias[t.dia]) err("B4", "grave", `${donde}, ${NOMBRE_DIA[t.dia]}`, `Observaciones: ${hora(t.de)}–${hora(t.a)} se sale del horario de la tabla (${hora(f.dias[t.dia].de)}–${hora(f.dias[t.dia].a)}).`, "Ajuste la tabla o la Observación para que coincidan.");
    }
    f.esperadas = f.frac != null ? Math.round(f.frac * 40 * 60) : null;
    if (f.esperadas != null && f.efectivas && f.efectivas !== f.esperadas) {
      const dif = f.efectivas - f.esperadas;
      err("B1", "grave", donde, `Declara ${f.jornada} (${horas(f.esperadas)} h), pero el horario suma ${horas(f.efectivas)} h: ${dif > 0 ? "sobran" : "faltan"} ${horas(Math.abs(dif))} h.`, `Ajuste el horario para que sume ${horas(f.esperadas)} h, o corrija la jornada si el nombramiento es otro.`);
    }
  }

  // 5. carga docente (C1–C4)
  for (const f of filas) {
    const conAct = f.obs.some((o) => o.tramos.some((t) => t.actividad));
    if (!(f.tipo === "curso" || conAct)) continue;
    const donde = nombreFila(f);
    const sumaAct = (act) => {
      const porDia = {};
      for (const o of f.obs) for (const t of o.tramos) if ((t.actividad || "") === act) (porDia[t.dia] ||= []).push([t.de, t.a]);
      return Object.values(porDia).reduce((s, t) => s + suma(unir(t)), 0);
    };
    const c = sumaAct("contacto"), q = sumaAct("consulta"), p = sumaAct("preparacion"), sc = sumaAct("");
    f.docente = { contacto: c, consulta: q, preparacion: p, sinClasificar: sc };
    const rango = CONTACTO[f.frac];
    if (!conAct) { err("C1", "grave", donde, "Es un curso, pero el horario no separa contacto, consulta y preparación.", "En el detalle de la fila, marque cada tramo como contacto, consulta o preparación."); continue; }
    if (sc) err("C3", "menor", donde, `${horas(sc)} h del curso no dicen si son contacto, consulta o preparación.`, "Clasifique esos tramos.");
    if (!rango) ver("C1", `${donde}: no hay referencia de horas de contacto para una jornada de ${f.jornada}; la tabla de la coordinación cubre 1/8, 1/4, 3/8 y 1/2.`);
    else if (c / 60 < rango[0] || c / 60 > rango[1]) err("C1", "grave", donde, `Contacto: ${horas(c)} h. Para ${f.jornada} se permiten ${rango[0]} o ${rango[1]} h.`, `Declare ${rango[0]} o ${rango[1]} h de contacto, según el curso.`);
    if (c && q !== c / 2) err("C2", "grave", donde, `Consulta: ${horas(q)} h. Con ${horas(c)} h de contacto deben ser ${horas(c / 2)} h (media hora por cada hora de contacto).`, `Declare ${horas(c / 2)} h de consulta.`);
    if (f.esperadas != null && c && q === c / 2) {
      const debe = f.esperadas - c - q;
      if (p === debe && rango && c / 60 >= rango[0] && c / 60 <= rango[1] && !sc) bien.push(`${donde}: contacto ${horas(c)} h, consulta ${horas(q)} h y preparación ${horas(p)} h cumplen C1–C3.`);
      if (p !== debe) err("C3", "grave", donde, `Preparación: ${horas(p)} h. El resto de la jornada (${horas(f.esperadas)} − ${horas(c)} − ${horas(q)}) es ${horas(debe)} h.`, `Declare ${horas(debe)} h de preparación.`);
    }
  }

  // 6. totales (A1, A2, A3, A5, B2, A11, A10)
  const ucr = filas.filter((f) => f.seccion === "ucr");
  const otras = filas.filter((f) => f.seccion === "otras");
  const fracUcr = ucr.reduce((s, f) => s + (f.frac || 0), 0);
  const minUcr = ucr.reduce((s, f) => s + (f.efectivas || 0), 0);
  const estatales = otras.filter((f) => f.clase === "estatal");
  const minEstatal = minUcr + estatales.reduce((s, f) => s + (f.efectivas || 0), 0);
  const minTotal = filas.reduce((s, f) => s + (f.efectivas || 0), 0);
  const tope = Math.round(fracUcr * 1000) / 1000;
  if (tope > 1.25) err("A1", "grave", "Jornada UCR", `Las filas de la UCR suman ${textoJornada(fracUcr)} (${horas(fracUcr * 2400)} h). El máximo es 1 TC (40 h) y, solo para cursos con aprobación de la Vicerrectoría de Docencia, 1¼ TC.`, "Reduzca la jornada en la UCR o corrija las fracciones.");
  else if (tope > 1) {
    if (decl.cuartoAdicional) ver("A2", `La jornada UCR es ${textoJornada(fracUcr)}: adjunte la aprobación de la Vicerrectoría de Docencia del 1/4 adicional (solo cursos, por inopia, un ciclo, prorrogable una vez, sin complemento salarial).`);
    else err("A1", "grave", "Jornada UCR", `Las filas de la UCR suman ${textoJornada(fracUcr)}: pasan de 1 TC (40 h).`, "Solo se permite con el 1/4 adicional aprobado por la Vicerrectoría de Docencia para impartir cursos (A2). Si lo tiene, márquelo y adjunte la aprobación; si no, reduzca la jornada.");
  } else if (ucr.length) bien.push(`Jornada UCR: ${textoJornada(fracUcr)} (${horas(minUcr)} h), dentro del tope de 1 TC (A1).`);
  if (decl.jornadaNombrada) {
    const jn = fraccion(decl.jornadaNombrada);
    if (jn != null && Math.abs(jn - fracUcr) > 0.001) err("B2", "grave", "Jornada UCR", `Las filas de la UCR suman ${textoJornada(fracUcr)}, pero la jornada nombrada es ${decl.jornadaNombrada}.`, "Agregue o corrija filas para que sumen la jornada nombrada.");
  } else if (ucr.length) ver("B2", `Confirme que ${textoJornada(fracUcr)} es exactamente su jornada nombrada en la UCR (propiedad, interinazgo, docencia y administración).`);
  if (minEstatal > 66 * 60) err("A3", "grave", "Jornada estatal", `UCR más instituciones estatales: ${horas(minEstatal)} h por semana. El tope es 66 h reloj (tiempo y medio); excederlo es falta grave (A7).`, "Reduzca jornada en alguna institución estatal.");
  else if (estatales.length) bien.push(`Jornada en instituciones estatales: ${horas(minEstatal)} h, bajo el tope de 66 h (A3).`);
  for (const f of otras) {
    if (!f.clase) ver("A5", `${nombreFila(f)}: indique si es institución estatal, entidad privada o fundación; solo las estatales suman al tope de 66 h.`);
    if (f.clase === "fundacion") ver("A8", `${nombreFila(f)}: la vinculación con la fundación debe estar en el plan de trabajo aprobado por la dirección de la unidad y tener contrato o nombramiento vigente para todo el periodo declarado (${f.desde || "?"} a ${f.hasta || "?"}).`);
  }
  if (minTotal > 60 * 60) err("A11", "menor", "Carga total", `Con fundaciones y privadas suma ${horas(minTotal)} h por semana; pasa la alerta de 60 h (criterio interno, no norma general).`, "Revise si la carga es sostenible; no es un incumplimiento por sí solo.");

  // por día: traslapes (A4, B5), carga diaria (A11), referencia de 8 h por patrono (A10), traslados
  const porDia = {};
  for (const f of filas) for (const d of Object.keys(f.tramos || {})) for (const t of f.tramos[d]) (porDia[d] ||= []).push({ f, t });
  let traslapes = 0;
  for (const d of DIAS) {
    const lista = porDia[d] || [];
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      const x = lista[i], y = lista[j];
      if (!solapan(x.t, y.t)) continue;
      traslapes++;
      err(x.f.seccion === y.f.seccion && x.f.seccion === "ucr" ? "B5" : "A4", "grave", NOMBRE_DIA[d],
        `${nombreFila(x.f)} (${hora(x.t[0])}–${hora(x.t[1])}) se traslapa con ${nombreFila(y.f)} (${hora(y.t[0])}–${hora(y.t[1])}).`,
        "Mueva uno de los dos horarios. La superposición horaria está prohibida y puede ser causa de despido si no se corrige (art. 41 del Convenio).");
    }
    const total = suma(unir(lista.map((x) => x.t)));
    if (total > 12 * 60) err("A11", "menor", NOMBRE_DIA[d], `Ese día suma ${horas(total)} h de trabajo; pasa la alerta de 12 h diarias (criterio interno).`, "Reparta mejor la carga si puede.");
    const totalUcr = suma(unir(lista.filter((x) => x.f.seccion === "ucr").map((x) => x.t)));
    if (totalUcr > 8 * 60) ver("A10", `${NOMBRE_DIA[d]}: ${horas(totalUcr)} h en la UCR; la referencia del Código de Trabajo es 8 h diarias por patrono en jornada diurna (confirmar en el texto oficial).`);
    // fin de un trabajo y comienzo de otro en distinto lugar, sin tiempo de traslado
    for (const x of lista) for (const y of lista) {
      if (x.f === y.f || x.t[1] !== y.t[0]) continue;
      if (sinTildes(x.f.lugar) && sinTildes(y.f.lugar) && sinTildes(x.f.lugar) !== sinTildes(y.f.lugar) && (x.f.seccion !== y.f.seccion))
        ver("A4", `${NOMBRE_DIA[d]} ${hora(x.t[1])}: termina «${x.f.lugar}» y empieza «${y.f.lugar}» sin pausa. Si es en otro lugar, no queda tiempo de traslado.`);
    }
  }
  if (!traslapes && filas.some((f) => Object.keys(f.tramos || {}).length)) bien.push("No hay traslapes entre filas (A4, B5).");

  // 7. respaldos y coherencia con documentos (B6, B8, B9, B10, B12, A9)
  const textoObs = sinTildes((decl.observaciones || []).join(" "));
  for (const f of filas) {
    const donde = nombreFila(f);
    const cargo = sinTildes(f.cargo);
    if (f.seccion === "ucr" && /interino\s+(licenciado|bachiller|magister|maestria|doctor)|licenciado|bachiller/.test(cargo) && /regimen salarial academico/.test(textoObs))
      ver("B8", `${donde}: la categoría «${f.cargo}» es del régimen anterior, pero las Observaciones mencionan el Régimen Salarial Académico. Los datos se contradicen: use la categoría exacta de la acción de personal vigente (por ejemplo «Interino 2»).`);
    if (f.seccion === "ucr" && (/coordin/.test(cargo) || f.tipo === "coordinacion")) ver("B6/B9", `${donde}: confirme que el nombramiento de la coordinación cubre hasta el ${f.hasta || "?"} y que tendrá ese cargo todo el periodo (si pasa a ser miembro, no puede declarar «Coordinación»).`);
    if (/investig/.test(cargo) || f.tipo === "investigacion" || f.obs?.some((o) => /investig/.test(sinTildes(o.etiqueta)))) ver("B10", `${donde}: la carga de investigación debe estar registrada en el sistema; si el reporte del proyecto dice «N/A» en horas, no está respaldada.`);
  }
  const sinRespaldo = filas.filter((f) => !f.respaldo).map((f) => `${f.seccion === "ucr" ? "UCR" : "otras"} fila ${f.n}`);
  if (sinRespaldo.length && decl.origen === "formulario") ver("B10", `Sin documento de respaldo indicado (en el detalle de la fila): ${sinRespaldo.join(", ")}. Cada fila necesita su acción de personal, oficio, acuerdo o contrato; sin él queda sin respaldo.`);
  if (decl.origen !== "formulario") ver("B10", "Cada fila necesita su respaldo: acción de personal u oficio de nombramiento, acuerdo de comisión, carga de investigación registrada o contrato con la fundación vigente para el periodo.");
  const ucrGestion = ucr.some(esGestion);
  for (const f of otras.filter((x) => x.clase === "estatal" && esGestion(x)))
    if (ucrGestion) ver("A9", `${nombreFila(f)}: dos puestos de gestión en instituciones públicas a la vez es zona gris frente a la Ley 8422, art. 17 (la excepción es para docentes). Pida un criterio por escrito a la Oficina Jurídica.`);
  ver("B12", "El plan de trabajo del periodo debe tener las mismas jornadas, horarios, cargos y actividades; las tareas de coordinación no van en «apoyo a la unidad académica».");

  // 8. firmas (B11)
  const firmas = decl.firmas;
  const faltaFirma = [];
  if (firmas) {
    if (firmas.declarante === false) faltaFirma.push("persona declarante");
    if (firmas.superior === false) faltaFirma.push("superior jerárquico de la unidad");
    if (firmas.jefatura === false) faltaFirma.push("visto bueno de la jefatura inmediata");
  }

  // 9. Observaciones que la tabla necesita y no tiene
  if (!(decl.observaciones || []).some((l) => String(l).trim())) ver("B4", "No hay Observaciones. Si algún tramo atraviesa el almuerzo o es un curso, deben explicarse ahí.");
  for (const f of filas) if (!f.obs?.length && f.tipo === "curso") err("C1", "grave", nombreFila(f), "El curso no tiene línea en Observaciones con el desglose de contacto, consulta y preparación.", "Agregue el desglose en el detalle de la fila.");

  // veredicto
  const graves = errores.filter((e) => e.gravedad === "grave").length;
  const veredicto = graves ? "No se debe firmar así" : errores.length ? "Se puede firmar con correcciones menores" : "Se puede firmar";
  const nivel = graves ? "mal" : errores.length ? "regular" : "bien";
  const orden = { grave: 0, menor: 1 };
  errores.sort((a, b) => orden[a.gravedad] - orden[b.gravedad]);
  if (!errores.some((e) => e.regla === "B1") && filas.every((f) => f.esperadas != null)) bien.push("Cada fila suma las horas de su fracción (B1).");
  if (!errores.some((e) => e.regla === "B4" || e.regla === "B3") && obs.length) bien.push("Las Observaciones coinciden con la tabla (B3, B4).");
  const horasTabla = filas.map((f) => ({
    fila: nombreFila(f), seccion: f.seccion, clase: f.clase, jornada: f.jornada,
    calculadas: f.efectivas, esperadas: f.esperadas, ok: f.esperadas != null && f.efectivas === f.esperadas, docente: f.docente || null,
  }));
  // sin duplicados en «verificar»
  const vistos = new Set();
  const verificarUnicos = verificar.filter((v) => (vistos.has(v.texto) ? false : vistos.add(v.texto)));
  return {
    veredicto, nivel, errores, verificar: verificarUnicos, bien, firmas: firmas || null, faltaFirma,
    horas: horasTabla,
    totales: { ucr: minUcr, fraccionUcr: fracUcr, estatal: minEstatal, total: minTotal },
    observaciones: obs.map((o) => ({ texto: o.texto, fila: o.fila ? nombreFila(o.fila) : null, tramos: o.tramos.length })),
  };
}
