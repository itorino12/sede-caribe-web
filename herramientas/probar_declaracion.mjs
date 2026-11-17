// Pruebas del motor de reglas de la Declaración Jurada (src/assets/js/declaracion-reglas.js).
// Uso: node herramientas/probar_declaracion.mjs
import fs from "fs";
import { fileURLToPath } from "url";
import { revisar, leerObservacion, escribirObservacion, minutos, fraccion, horaEstandar } from "../src/assets/js/declaracion-reglas.js";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const ejemplo = JSON.parse(fs.readFileSync(raiz + "herramientas/fuentes/declaracion/ejemplo-orh.json", "utf8"));
const copia = () => JSON.parse(JSON.stringify(ejemplo));
let fallas = 0, total = 0;
function ok(cond, nombre, extra = "") {
  total++;
  if (!cond) { fallas++; console.log(`FALLA  ${nombre} ${extra}`); }
}
const reglas = (r) => r.errores.map((e) => e.regla);

// lectura de Observaciones
const o = leerObservacion("IF0004 Desarrollo de Software II: Contacto: K,J 8 a 12 - Atención: K,J 13 a 15 – Preparación: M 08 a 12 y 13 a 17");
ok(o.etiqueta === "IF0004 Desarrollo de Software II", "etiqueta del curso", o.etiqueta);
ok(o.tramos.length === 6, "seis tramos del curso", o.tramos.length);
ok(o.tramos.filter((t) => t.actividad === "consulta").length === 2, "Atención se lee como consulta");
const o2 = leerObservacion("Coordinación de Carrera: L 08 a 12 y 13 a 17, M 17 a 21 y V 14 a 17 (Con base a acuerdo CTRSA-126-2025)");
ok(o2.tramos.length === 4 && o2.notas.length === 1, "paréntesis no se leen como horas", JSON.stringify(o2.tramos));
ok(leerObservacion("Clases: L-V 1 a 3").tramos.every((t) => t.de === 13 * 60), "«1 a 3» es de la tarde y L-V son cinco días");
ok(minutos("8") === 480 && minutos("13:30") === 810 && minutos("1330") === 810, "lectura de horas");
for (const [t, m] of [["17:00:00", 1020], ["5:00 p.m.", 1020], ["5 pm", 1020], ["5:00 p. m.", 1020], ["17h", 1020], ["17:00 hrs", 1020],
  ["17.00", 1020], ["12 m.d.", 720], ["12 md", 720], ["8 a.m.", 480], ["12:00 a.m.", 0], ["0800", 480], ["8", 480]])
  ok(minutos(t) === m, `hora «${t}»`, String(minutos(t)));
ok(minutos("25:00") === null && minutos("8:75") === null && minutos("5 md") === null && minutos("ocho") === null, "horas imposibles no se leen");
ok(horaEstandar("08:00") && horaEstandar("17:30") && !horaEstandar("8:00") && !horaEstandar("17:00:00") && !horaEstandar("5:00 p.m."), "formato estándar HH:MM");
ok(fraccion("1/2") === 0.5 && fraccion("1 TC") === 1 && fraccion("½") === 0.5, "lectura de jornadas");
const esc = escribirObservacion("IF0004 Desarrollo de Software II", [
  { dia: "K", de: 480, a: 720, actividad: "contacto" }, { dia: "J", de: 480, a: 720, actividad: "contacto" },
  { dia: "K", de: 780, a: 900, actividad: "consulta" }, { dia: "J", de: 780, a: 900, actividad: "consulta" },
  { dia: "M", de: 480, a: 720, actividad: "preparacion" }, { dia: "M", de: 780, a: 1020, actividad: "preparacion" }], "", true);
ok(esc === "IF0004 Desarrollo de Software II: Contacto: K, J 08 a 12 – Consulta: K, J 13 a 15 – Preparación: M 08 a 12 y 13 a 17", "observación escrita por el formulario", esc);
ok(leerObservacion(esc).tramos.length === 6, "lo escrito se vuelve a leer igual");

// el ejemplo real (datos personales ficticios): solo el formato de fecha
let r = revisar(copia());
ok(r.veredicto === "Se puede firmar con correcciones menores", "veredicto del ejemplo", r.veredicto);
ok(JSON.stringify(reglas(r)) === '["B7"]', "solo B7 en el ejemplo", reglas(r).join(","));
ok(r.totales.ucr === 2400 && r.totales.total === 3000, "totales del ejemplo");
ok(r.verificar.some((v) => v.regla === "B8"), "contradicción de categoría (B8)");
ok(r.faltaFirma.length === 2, "faltan dos firmas");

// horas con segundos o en 12 horas: se aceptan (sin B11 grave), con una recomendación menor
let d = copia(); d.filas[2].dias.M = { de: "17:00:00", a: "21:00:00" }; d.filas[3].dias.K = { de: "3:00 p.m.", a: "8:00" };
r = revisar(d);
ok(!r.errores.some((e) => e.regla === "B11" && e.gravedad === "grave") && !reglas(r).includes("B1") && !reglas(r).includes("B4"), "horas raras se leen bien", reglas(r).join(","));
ok(r.errores.some((e) => e.regla === "B11" && e.gravedad === "menor" && /17:00:00/.test(e.texto) && /se leyó 15:00–20:00/.test(e.texto)), "y se pide estandarizarlas");
ok(r.nivel === "regular", "solo correcciones menores", r.nivel);

// B4: Observaciones distintas de la tabla («V 14 a 19» con tabla 14:00–17:00)
d = copia(); d.observaciones[1] = d.observaciones[1].replace("V 14 a 17", "V 14 a 19");
r = revisar(d);
ok(reglas(r).includes("B4") && r.nivel === "mal", "B4 por horario distinto", reglas(r).join(","));

// B3: tramo que cruza el almuerzo sin Observación
d = copia(); d.observaciones = d.observaciones.filter((l) => !l.startsWith("Coordinación de Carrera"));
r = revisar(d);
ok(reglas(r).includes("B3"), "B3 sin Observación del almuerzo", reglas(r).join(","));
ok(!reglas(r).includes("B1"), "con el almuerzo descontado la fila sigue sumando 15 h");

// B1: una hora de más
d = copia(); d.filas[3].dias.J.a = "21:00"; d.observaciones[3] = "ED204 Educación Continua Sede del Caribe: K 15 a 20, J 15 a 21";
r = revisar(d);
ok(reglas(r).includes("B1"), "B1 con una hora de más", reglas(r).join(","));

// A4: traslape con la fundación
d = copia(); d.filas[3].dias.K = { de: "14:00", a: "19:00" }; d.observaciones[3] = "ED204 Educación Continua Sede del Caribe: K 14 a 19, J 15 a 20";
r = revisar(d);
ok(reglas(r).includes("A4"), "A4 traslape", reglas(r).join(","));

// A1: más de tiempo completo
d = copia(); d.filas.push({ seccion: "ucr", lugar: "Sede del Caribe", cargo: "Interino 2", jornada: "1/4", desde: "20/7/2026", hasta: "31/12/2026", dias: { S: { de: "08:00", a: "12:00" }, L: { de: "17:00", a: "23:00" } } });
r = revisar(d);
ok(reglas(r).includes("A1"), "A1 más de 1 TC", reglas(r).join(","));

// A3: más de 66 h estatales
d = copia(); d.filas.push({ seccion: "otras", lugar: "Colegio Universitario de Limón", cargo: "Docente", jornada: "1 TC", desde: "20/7/2026", hasta: "31/12/2026",
  dias: { S: { de: "06:00", a: "22:00" }, L: { de: "17:00", a: "23:00" }, K: { de: "20:00", a: "23:00" } } });
r = revisar(d);
ok(r.errores.some((e) => e.regla === "A3") || r.errores.some((e) => e.regla === "B1"), "otra estatal se suma al tope", reglas(r).join(","));

// C1/C2: contacto fuera de rango y consulta mal
d = copia(); d.observaciones[0] = "IF0004 Desarrollo de Software II: Contacto: K 8 a 12, J 8 a 11 - Consulta: K,J 13 a 15, J 11 a 12 – Preparación: M 08 a 12 y 13 a 17";
r = revisar(d);
ok(reglas(r).includes("C2"), "C2 consulta que no es la mitad", reglas(r).join(","));

// B6: vigencia más allá del respaldo
d = copia(); d.filas[2].venceRespaldo = "30/11/2026";
r = revisar(d);
ok(reglas(r).includes("B6"), "B6 vigencia fuera del respaldo", reglas(r).join(","));

console.log(fallas ? `${fallas} de ${total} pruebas fallaron` : `Declaración jurada: ${total} pruebas bien`);
process.exit(fallas ? 1 : 0);
