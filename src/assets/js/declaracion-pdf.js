// PDF de la Declaración Jurada con la misma geometría del formulario de la ORH (carta horizontal, medidas en
// puntos tomadas del original). Lleva tres campos de firma vacíos (persona declarante, superior jerárquico y
// jefatura inmediata) y, adjunto, «declaracion.json» con los datos: al subir el PDF a la página se lee sin IA.
import { PDFDocument, StandardFonts, rgb, PDFString, PDFName } from "./vendor/pdf-lib.esm.min.js";
import { DIAS, fecha, textoFecha, normalHora } from "./declaracion-reglas.js";

const ANCHO = 792, ALTO = 612;
const X0 = 43, X1 = 759.5;
// bordes de columna de las tablas (Lugar, Cargo, Jornada, Desde, Hasta y De/A de lunes a sábado)
const COL = [43, 154, 220, 261, 295.5, 330.5, 372.5, 408, 443, 478, 513, 548, 583.5, 618.5, 654, 689, 724, 759.5];
const AZUL = rgb(0, 0.69, 0.941), GRIS = rgb(0.757, 0.757, 0.757), NEGRO = rgb(0, 0, 0);
// WinAnsi: lo que Helvetica estándar puede escribir
const EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const limpio = (t) => [...String(t ?? "")].map((c) => (c.charCodeAt(0) < 256 && c.charCodeAt(0) >= 32) || EXTRA.includes(c) ? c : c === "\n" ? " " : "?").join("");

export async function generarPDF(decl, raiz = "") {
  const doc = await PDFDocument.create();
  const p = doc.addPage([ANCHO, ALTO]);
  const H = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);
  const [escudo, orh] = await Promise.all(["orh-escudo-ucr.jpg", "orh-logo.jpg"].map((n) => fetch(`${raiz}assets/img/${n}`).then((r) => r.arrayBuffer())));
  const imgEscudo = await doc.embedJpg(escudo), imgOrh = await doc.embedJpg(orh);

  const Y = (y) => ALTO - y; // el formulario se midió de arriba hacia abajo
  const linea = (x1, y1, x2, y2, grosor = 0.6) => p.drawLine({ start: { x: x1, y: Y(y1) }, end: { x: x2, y: Y(y2) }, thickness: grosor, color: NEGRO });
  const caja = (x, y, w, h, color) => p.drawRectangle({ x, y: Y(y + h), width: w, height: h, color });
  const ancho = (t, f, s) => f.widthOfTextAtSize(limpio(t), s);
  function texto(t, x, y, { f = H, s = 8, alin = "izq", max = 0, min = 4.5 } = {}) {
    t = limpio(t);
    if (!t) return;
    let tam = s;
    while (max && tam > min && f.widthOfTextAtSize(t, tam) > max) tam -= 0.25;
    while (max && f.widthOfTextAtSize(t, tam) > max && t.length > 1) t = t.slice(0, -2) + "…";
    const w = f.widthOfTextAtSize(t, tam);
    const xx = alin === "centro" ? x - w / 2 : alin === "der" ? x - w : x;
    p.drawText(t, { x: xx, y: Y(y), size: tam, font: f, color: NEGRO });
  }
  const centro = (t, a, b, y, op = {}) => texto(t, (a + b) / 2, y, { alin: "centro", max: b - a - 3, ...op });

  // ---- encabezado azul, logos y título
  caja(X0, 57.5, X1 - X0, 93, AZUL);
  p.drawImage(imgEscudo, { x: 43.4, y: Y(105.5), width: 137.5, height: 48.4 });
  p.drawImage(imgOrh, { x: 617.5, y: Y(93.4), width: 138.1, height: 32.6 });
  texto("DECLARACION JURADA DE HORARIO Y JORNADA DE TRABAJO", 401, 108.5, { f: B, s: 13.5, alin: "centro" });

  // ---- datos de la persona
  const per = decl.persona || {};
  linea(X0, 150.5, X1, 150.5, 1.2); linea(X0, 170.5, X1, 170.5); linea(X0, 187, X1, 187, 1.2);
  linea(372, 150.5, 372, 187); linea(548, 150.5, 548, 170.5);
  const etq = (t, x, y) => { texto(t, x, y, { f: B, s: 5.6 }); return x + ancho(t, B, 5.6) + 5; };
  let x = etq("Nombre de la persona funcionaria:", 44.3, 164);
  texto(per.nombre, Math.max(x, 150), 165, { s: 10, max: 372 - Math.max(x, 150) - 4 });
  x = etq("Identificación:", 376, 164);
  texto(per.identificacion, Math.max(x, 435), 165, { s: 10, max: 548 - Math.max(x, 435) - 4 });
  x = etq("Teléfono", 549.3, 164);
  texto(per.telefono, Math.max(x, 590), 165, { s: 10, max: X1 - Math.max(x, 590) - 4 });
  x = etq("Unidad Académica o Administrativa:", 44.3, 180.5);
  texto(per.unidad, Math.max(x, 151), 181, { s: 8.5, max: 372 - Math.max(x, 151) - 4 });
  x = etq("Correo electrónico:", 399.1, 180.5);
  texto(per.correo, Math.max(x, 463), 181, { s: 8.5, max: X1 - Math.max(x, 463) - 4 });
  texto("A continuación declaro los horarios y jornadas convenidos con:", 44.6, 199.5, { f: B, s: 8.5 });
  linea(X0, 206, X1, 206);

  // ---- alturas: se reparten para que todo quepa en la página
  const ucr = (decl.filas || []).filter((f) => f.seccion === "ucr");
  const otras = (decl.filas || []).filter((f) => f.seccion === "otras");
  const nU = Math.max(4, ucr.length), nO = Math.max(4, otras.length);
  const obs = (decl.observaciones || []).map(limpio).filter(Boolean);
  let alto = 12.6, banda = 18.5;
  const fijo = 206 + 19 + 35.5 + 19.5 + 35;   // títulos y encabezados de las dos tablas
  const pie = 551.5, minObs = 117;
  while (fijo + (nU + nO) * alto + banda + minObs > pie && alto > 9.5) { alto -= 0.2; banda = Math.max(4, banda - 1); }

  function seccion(y, titulo, filas, n) {
    linea(X0, y + 19, X1, y + 19);
    texto(titulo, 401, y + 13.5, { f: B, s: 10.5, alin: "centro" });
    const yc = y + 19, yh = yc + 35.5;
    caja(X0 + 0.3, yc + 0.3, X1 - X0 - 0.6, 35, GRIS);
    linea(X0, yh, X1, yh);
    linea(COL[3], yc + 17.5, X1, yc + 17.5);
    for (let i = 1; i < COL.length - 1; i++) {  // las líneas Desde|Hasta y De|A empiezan en la mitad del encabezado
      linea(COL[i], i === 4 || (i >= 6 && i % 2 === 0) ? yc + 17.5 : yc, COL[i], yh + n * alto);
    }
    const lab = { f: B, s: 7 };
    centro("Lugar de Trabajo", COL[0], COL[1], yc + 20, lab);
    centro("Cargo o", COL[1], COL[2], yc + 15.5, lab); centro("Categoría", COL[1], COL[2], yc + 24, lab);
    centro("Jornada de", COL[2], COL[3], yc + 15.5, lab); centro("Trabajo", COL[2], COL[3], yc + 24, lab);
    centro("Vigencia del", COL[3], COL[5], yc + 7, lab); centro("nombramiento", COL[3], COL[5], yc + 15, lab);
    centro("Desde", COL[3], COL[4], yc + 29, lab); centro("Hasta", COL[4], COL[5], yc + 29, lab);
    ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].forEach((d, i) => {
      centro(d, COL[5 + i * 2], COL[7 + i * 2], yc + 12, { f: B, s: 8.5 });
      centro("De", COL[5 + i * 2], COL[6 + i * 2], yc + 29, lab); centro("A", COL[6 + i * 2], COL[7 + i * 2], yc + 29, lab);
    });
    for (let r = 0; r < n; r++) {
      const y0 = yh + r * alto, yb = y0 + alto / 2 + 2.5;
      linea(X0, y0 + alto, X1, y0 + alto);
      const f = filas[r];
      if (!f) continue;
      // texto largo: en dos renglones antes que en letra ilegible (B11)
      const celda = (t, a, b) => {
        t = limpio(t).trim();
        const max = b - a - 3;
        if (!t || H.widthOfTextAtSize(t, 7) <= max || H.widthOfTextAtSize(t, 6) <= max) return centro(t, a, b, yb, { s: 7, min: 6 });
        const pal = t.split(/\s+/);
        let mejor = 1, dif = Infinity;
        for (let k = 1; k < pal.length; k++) {
          const d = Math.abs(H.widthOfTextAtSize(pal.slice(0, k).join(" "), 5.5) - H.widthOfTextAtSize(pal.slice(k).join(" "), 5.5));
          if (d < dif) { dif = d; mejor = k; }
        }
        centro(pal.slice(0, mejor).join(" "), a, b, y0 + alto / 2 - 0.3, { s: 5.5, min: 4.5 });
        centro(pal.slice(mejor).join(" "), a, b, y0 + alto / 2 + 5.2, { s: 5.5, min: 4.5 });
      };
      celda(f.lugar, COL[0], COL[1]);
      celda(f.cargo, COL[1], COL[2]);
      centro(f.jornada, COL[2], COL[3], yb, { s: 8 });
      const fe = (t) => { const d = fecha(t); return d ? textoFecha(d) : t; };
      centro(fe(f.desde), COL[3], COL[4], yb, { s: 7 });
      centro(fe(f.hasta), COL[4], COL[5], yb, { s: 7 });
      DIAS.forEach((d, i) => {
        const v = f.dias?.[d];
        if (!v) return;
        centro(normalHora(v.de), COL[5 + i * 2], COL[6 + i * 2], yb, { s: 8 });
        centro(normalHora(v.a), COL[6 + i * 2], COL[7 + i * 2], yb, { s: 8 });
      });
    }
    return yh + n * alto;
  }
  let y = seccion(206, "UNIVERSIDAD DE COSTA RICA (sea como docente y/o administrativo)", ucr, nU);
  y = seccion(y, "OTRAS INSTITUCIONES PÚBLICAS, PRIVADAS Y FUNDACIONES", otras, nO);
  y += banda;
  linea(X0, y, X1, y);

  // ---- Observaciones (con salto de línea; la letra se achica si no caben antes de las firmas)
  const zonaFirma = 484;
  const xo = 122, wo = X1 - xo - 6;
  let s = 8, renglones = [];
  for (; s >= 5.5; s -= 0.5) {
    renglones = [];
    for (const l of obs) {
      let actual = "";
      for (const palabra of l.split(/\s+/)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (H.widthOfTextAtSize(prueba, s) > wo && actual) { renglones.push(actual); actual = "  " + palabra; } else actual = prueba;
      }
      if (actual) renglones.push(actual);
    }
    if (y + 12 + renglones.length * s * 1.05 <= zonaFirma) break;
  }
  texto("Observaciones:", 45, y + 23, { f: B, s: 9.5 });
  renglones.forEach((r, i) => texto(r, xo, y + 12 + i * s * 1.05, { s }));

  // ---- firmas
  texto("Firma de la persona", 148, 540, { f: B, s: 5.6, alin: "centro" });
  texto("funcionaria Declarante*", 148, 546.5, { f: B, s: 5.6, alin: "centro" });
  texto("Firma superior jerárquico Unidad", 396, 543, { f: B, s: 5.6, alin: "centro" });
  texto("Visto bueno jefatura inmediata", 612, 542, { f: B, s: 5.6, alin: "centro" });
  // marco exterior y pie
  p.drawRectangle({ x: X0, y: Y(pie), width: X1 - X0, height: pie - 56.5, borderColor: NEGRO, borderWidth: 1.5 });
  texto("*Se informa que el tratamiento de los datos proporcionados se rige de conformidad con la ley 8968 Ley de Protección de la Persona frente al tratamiento de sus datos personales.", 54, 567, { s: 5.5 });

  // ---- campos de firma vacíos (Adobe, Firmador: clic para firmar en su lugar)
  const ctx = doc.context, acro = doc.catalog.getOrCreateAcroForm();
  [["FirmaDeclarante", 60, 250], ["FirmaSuperior", 300, 492], ["VistoBuenoJefatura", 520, 705]].forEach(([nombre, a, b]) => {
    const w = ctx.obj({ Type: "Annot", Subtype: "Widget", FT: "Sig", F: 4, Rect: [a, Y(533), b, Y(486)], P: p.ref });
    w.set(PDFName.of("T"), PDFString.of(nombre));
    const ref = ctx.register(w);
    p.node.addAnnot(ref);
    acro.addField(ref);
  });

  // ---- datos adjuntos y metadatos
  const datos = new TextEncoder().encode(JSON.stringify({ version: 1, sitio: "UCR Sede del Caribe", estado: decl.formulario }));
  await doc.attach(datos, "declaracion.json", { mimeType: "application/json", description: "Datos de la declaración para revisarla de nuevo en el sitio de la Sede del Caribe", creationDate: new Date(), modificationDate: new Date() });
  doc.setTitle("Declaración Jurada de Horario y Jornada de Trabajo");
  if (per.nombre) doc.setAuthor(limpio(per.nombre));
  doc.setSubject("Declaración Jurada de Horario y Jornada de Trabajo (Oficina de Recursos Humanos, UCR)");
  doc.setCreator("Sitio web de la UCR Sede del Caribe");
  doc.setLanguage("es-CR");
  return doc.save();
}
