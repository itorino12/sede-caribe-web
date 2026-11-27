// Lectura de una declaración subida (declaracion-jurada.html, «Revisar un PDF»).
//  1. Si el PDF lo generó la página, trae adjunto «declaracion.json»: se carga tal cual, sin IA.
//  2. Si no, la página 1 se convierte en imagen, se tapan en blanco la franja de datos personales y la de
//     firmas, se muestra a la persona y, solo si acepta, se envía a /api/declaracion (Gemini) para leer la
//     tabla y las Observaciones. Los formularios de la ORH traen la tabla dibujada como trazos, no como
//     texto: sin leer la imagen no hay manera de sacarla.
//  Las firmas se revisan aquí mismo, buscando trazos en la zona de cada firma antes de taparla.

import { leerPersona } from "./declaracion-reglas.js";

const PT = { ancho: 792, alto: 612 };
// Zonas del formulario de la ORH en fracciones de la página (medidas del original), por si el archivo no trae texto.
const ZONA = { persona: [0.235, 0.307], firmas: [0.785, 1], cajasFirma: [[0.07, 0.33], [0.37, 0.63], [0.66, 0.92]], firmaY: [0.792, 0.872] };
const ESCALA = 2.5;

let ctx = null, pendiente = null;
const $ = (s) => document.querySelector(s);
const estado = (t) => { $("#dj-estado").textContent = t; };

export function iniciar(c) {
  ctx = c;
  $("#dj-archivo").addEventListener("change", (e) => { const f = e.target.files?.[0]; if (f) leer(f).catch(fallo); });
  $("#dj-acepto").addEventListener("change", (e) => { $("#dj-leer").disabled = !e.target.checked || !pendiente; });
  $("#dj-leer").addEventListener("click", () => enviar().catch(fallo));
}

function fallo(e) {
  console.error(e);
  estado(`No se pudo leer el archivo: ${e.message || e}.`);
  $("#dj-leer").disabled = !$("#dj-acepto").checked || !pendiente;
}

function limpiarEnvio() {
  pendiente = null;
  $("#dj-leer").hidden = false; $(".dj-acepto").hidden = false;
  $("#dj-envio").hidden = true;
  $("#dj-acepto").checked = false;
  $("#dj-leer").disabled = true;
}

async function pdfjs() {
  const m = await import("./vendor/pdfjs/pdf.min.js");
  m.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.js", import.meta.url).href;
  return m;
}

async function leer(archivo) {
  limpiarEnvio();
  if (archivo.size > 25 * 1024 * 1024) throw new Error("el archivo pasa de 25 MB");
  estado("Leyendo el archivo…");
  const esPdf = archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name);
  let lienzo, textos = [], campos = [], notaPaginas = "";
  if (esPdf) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()), isEvalSupported: false }).promise;
    const pagina = await doc.getPage(1);
    const vp = pagina.getViewport({ scale: ESCALA });
    lienzo = document.createElement("canvas");
    lienzo.width = Math.round(vp.width); lienzo.height = Math.round(vp.height);
    const c2 = lienzo.getContext("2d");
    c2.fillStyle = "#fff"; c2.fillRect(0, 0, lienzo.width, lienzo.height);
    await pagina.render({ canvasContext: c2, viewport: vp }).promise;
    const firmas = medirFirmas(lienzo, null);
    // ¿lo generó esta página?
    const adjuntos = await doc.getAttachments().catch(() => null);
    const propio = adjuntos && Object.values(adjuntos).find((a) => a.filename === "declaracion.json");
    if (propio) {
      const j = JSON.parse(new TextDecoder().decode(propio.content));
      if (j?.estado?.filas) {
        const e = j.estado;
        estado("Este PDF lo generó esta página: se leyó sin IA.");
        ctx.cargarLeido({ ...e, observaciones: e.obsManual ? (e.obsTexto || "").split(/\n+/) : [], obsManual: e.obsManual }, {
          firmas, archivo: archivo.name, propio: true,
          nota: `«${archivo.name}» lo generó esta página: estos son sus datos. Si lo editó después en otro programa, lo que se ve aquí puede no coincidir con el PDF.`,
        });
        return;
      }
    }
    if (doc.numPages > 1) notaPaginas = ` El archivo tiene ${doc.numPages} páginas: solo se revisa la primera.`;
    const tc = await pagina.getTextContent();
    textos = tc.items.filter((it) => it.str && it.str.trim()).map((it) => {
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const alto = Math.hypot(it.transform[2], it.transform[3]) * ESCALA;
      return { t: it.str, x, y: y - alto, y2: y, x2: x + it.width * ESCALA };
    });
    // datos escritos en casillas del formulario (no vienen en el texto de la página)
    campos = (await pagina.getAnnotations()).filter((a) => a.subtype === "Widget" && typeof a.fieldValue === "string" && a.fieldValue.trim()).map((a) => {
      const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect);
      return { t: a.fieldValue, x: Math.min(x1, x2), y: Math.min(y1, y2), y2: Math.max(y1, y2), x2: Math.max(x1, x2) };
    });
    return preparar(lienzo, textos, firmas, archivo.name, notaPaginas, campos);
  }
  if (!/^image\/(jpeg|png)$/.test(archivo.type)) throw new Error("use un PDF, JPG o PNG");
  const img = await createImageBitmap(archivo);
  const k = Math.min(1, 2200 / Math.max(img.width, img.height));
  lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.width * k); lienzo.height = Math.round(img.height * k);
  const c2 = lienzo.getContext("2d");
  c2.fillStyle = "#fff"; c2.fillRect(0, 0, lienzo.width, lienzo.height);
  c2.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return preparar(lienzo, [], medirFirmas(lienzo, null), archivo.name, " Es una foto: revise bien que la franja tapada cubra sus datos.");
}

// ¿Hay trazos en la zona de cada firma? (antes de tapar). Fracción de píxeles oscuros en cada caja.
function medirFirmas(lienzo, zonas) {
  const c2 = lienzo.getContext("2d", { willReadFrequently: true });
  const W = lienzo.width, Hh = lienzo.height;
  const [y0, y1] = (zonas || ZONA.firmaY).map((v) => Math.round(v * Hh));
  const r = ZONA.cajasFirma.map(([a, b]) => {
    const x0 = Math.round(a * W), x1 = Math.round(b * W);
    const d = c2.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let oscuros = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 < 140) oscuros++;
    return oscuros / (d.length / 4) > 0.002;
  });
  return { declarante: r[0], superior: r[1], jefatura: r[2] };
}

// Texto en orden de lectura, renglón por renglón.
function enRenglones(items, tolerancia) {
  const renglones = [];
  for (const t of [...items].sort((a, b) => a.y2 - b.y2 || a.x - b.x)) {
    const r = renglones.find((x) => Math.abs(x.y - t.y2) < tolerancia);
    if (r) r.p.push(t); else renglones.push({ y: t.y2, p: [t] });
  }
  return renglones.map((r) => r.p.sort((a, b) => a.x - b.x).map((t) => t.t).join(" ").replace(/\s+/g, " ").trim()).join("\n");
}

function preparar(lienzo, textos, firmas, nombre, nota, campos = []) {
  const W = lienzo.width, H = lienzo.height;
  const buscar = (re) => textos.find((t) => re.test(t.t));
  // franja de datos personales: de «Nombre de la persona…» a «A continuación declaro…»
  const nom = buscar(/^\s*Nombre/), cont = buscar(/continuaci[oó]n/);
  let p0 = ZONA.persona[0] * H, p1 = ZONA.persona[1] * H;
  if (nom && cont && cont.y > nom.y) { p0 = nom.y - 0.012 * H; p1 = cont.y - 0.004 * H; }
  // los datos de la franja se quedan aquí, para no perderlos al generar el PDF nuevo
  const persona = leerPersona(enRenglones(textos.concat(campos).filter((t) => t.y2 > p0 && t.y < p1), 0.012 * H));
  // firmas: desde el final de las Observaciones hasta abajo
  const obsEt = buscar(/Observaciones/);
  let f0 = ZONA.firmas[0] * H;
  if (obsEt) {
    const lineas = textos.filter((t) => t.x >= obsEt.x2 - 4 && t.y > obsEt.y - 0.04 * H && t.y < obsEt.y + 0.12 * H);
    const fin = Math.max(obsEt.y2, ...lineas.map((t) => t.y2));
    f0 = Math.min(Math.max(fin + 0.006 * H, obsEt.y2 + 0.006 * H), 0.9 * H);
  }
  const c2 = lienzo.getContext("2d");
  c2.fillStyle = "#fff";
  c2.fillRect(0, p0, W, p1 - p0);
  c2.fillRect(0, f0, W, H - f0);
  // texto fuera de las zonas tapadas, renglón por renglón
  const visibles = textos.filter((t) => !(t.y2 > p0 && t.y < p1) && t.y < f0).sort((a, b) => a.y - b.y || a.x - b.x);
  const renglones = [];
  for (const t of visibles) {
    const r = renglones.find((x) => Math.abs(x.y - t.y) < 0.006 * H);
    if (r) r.p.push(t); else renglones.push({ y: t.y, p: [t] });
  }
  const texto = renglones.map((r) => r.p.sort((a, b) => a.x - b.x).map((t) => t.t).join(" ").replace(/\s+/g, " ").trim()).join("\n");
  pendiente = { imagen: lienzo.toDataURL("image/jpeg", 0.85), texto, firmas, nombre, persona };
  $("#dj-vista").src = pendiente.imagen;
  $("#dj-envio").hidden = false;
  $("#dj-leer").disabled = !$("#dj-acepto").checked;
  ctx.hayServidor().then((s) => {
    if (s) estado(`Listo para leer «${nombre}».${nota} Revise la imagen y acepte el envío.`);
    else {
      estado(`Este PDF no lo generó esta página, y leerlo necesita la IA del servidor de la Sede, que no está disponible en esta dirección (la vista previa no tiene servidor). Arriba se ve lo que se enviaría.${nota} Mientras tanto, puede llenar el formulario con los datos de su declaración: la revisión es la misma.`);
      $("#dj-leer").disabled = true;
      $("#dj-leer").hidden = true; $(".dj-acepto").hidden = true;
    }
  });
  $("#dj-envio").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function enviar() {
  if (!pendiente) return;
  const b = $("#dj-leer");
  b.disabled = true;
  estado("Leyendo la declaración con IA… puede tardar unos 20 segundos.");
  const r = await fetch(ctx.raiz + "api/declaracion", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modo: "extraer", mime: "image/jpeg", imagen: pendiente.imagen.split(",")[1], texto: pendiente.texto }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j.error || (r.status === 429 ? "demasiadas consultas; intente más tarde" : `el servidor respondió ${r.status}`));
  const d = j.datos;
  if (!d.es_declaracion || !d.filas.length) { estado("La IA no reconoce en el archivo el formulario de la Declaración Jurada de la ORH."); b.disabled = false; return; }
  const notas = d.legibilidad.map((t) => ({ regla: "B11", texto: t })).concat(d.dudas.map((t) => ({ regla: "Lectura", texto: `Valor dudoso: ${t}` })));
  // Una hora «De» sin su «A» (o al revés) casi siempre es la IA que no leyó la celda, no un error del formulario.
  const nombres = { L: "lunes", K: "martes", M: "miércoles", J: "jueves", V: "viernes", S: "sábado" };
  const cuenta = { ucr: 0, otras: 0 };
  const huecos = d.filas.flatMap((f) => {
    const n = ++cuenta[f.seccion];
    return Object.entries(f.dias || {}).filter(([, v]) => !v.de || !v.a).map(([k]) => `${f.seccion === "ucr" ? "UCR" : "otras"} fila ${n}, ${nombres[k]}`);
  });
  if (huecos.length) notas.unshift({ regla: "Lectura", texto: `La IA dejó incompletas estas celdas: ${huecos.join("; ")}. Lo más probable es que no las haya leído bien: compárelas con su PDF y corríjalas antes de creer los errores que dependen de ellas.` });
  const per = pendiente.persona;
  if (!per.nombre || !per.identificacion) notas.unshift({ regla: "Encabezado", texto: "No se pudieron leer del archivo todos sus datos personales: complételos en el encabezado antes de generar el PDF." });
  ctx.cargarLeido({ ...d, persona: per, unidad: per.unidad || d.unidad }, { firmas: pendiente.firmas, archivo: pendiente.nombre, notas });
  estado(`Se leyó «${pendiente.nombre}». Revise los valores en el formulario: la IA puede equivocarse al leer.`);
  limpiarEnvio();
}
