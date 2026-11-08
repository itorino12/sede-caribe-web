// Congo (mono aullador de manto, Alouatta palliata) que anda colgado de una varita que cruza la portada.
// Es decorativo: avanza agarrado de manos, pies y cola, descansa en los extremos (a veces aúlla) y da la vuelta
// colgado de una mano. Dibujo en SVG con un esqueleto simple: brazos y patas se resuelven con cinemática inversa
// para que manos y pies queden fijos en la varita mientras el cuerpo avanza.
// Coordenadas internas en «unidades»: x=0 es el origen del cuerpo, y=0 el centro de la varita; el congo mira hacia +x.
// Con «reducir movimiento» queda quieto, colgando. Se detiene cuando la portada no está a la vista.
// Al tocarlo se baja de la rama y atiende el asistente (asistente.js), donde vive otra copia (montar con panel: true).

const portada = document.querySelector(".portada");

// ---------- utilidades de dibujo ----------
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;

// curva cerrada suave (Catmull-Rom) por los puntos de control
function suavizar(pts, paso = 2.2) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const k = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / paso));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2
        + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  return out;
}

function dentro([x, y], poly) {
  let si = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si;
  }
  return si;
}

// contorno con mechones: alterna puntos del borde con puntas de pelo hacia afuera
// g: hacia dónde cae el pelo (la gravedad, en el marco de la forma); los mechones son curvos y desparejos
function borde(p, largo, r, g = [0, 1]) {
  const n = p.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1];
  const s = Math.sign(area) || 1;
  const pt = (q) => f(q[0]) + "," + f(q[1]);
  let d = "M" + pt(p[0]);
  for (let i = 1; i < n; i += 2) {
    const a = p[i - 1], b = p[(i + 1) % n], m = p[i];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = s * ty, ny = -s * tx;
    // de vez en cuando un mechón largo; los demás, cortos
    const h = largo * (r() < 0.22 ? 1.1 + 0.6 * r() : 0.35 + 0.55 * r());
    const caida = Math.max(0, nx * g[0] + ny * g[1]) * 0.3 + 0.55; // del lado de abajo el pelo cuelga más
    const punta = [m[0] + nx * h * 0.75 + g[0] * h * caida + tx * h * 0.25 * (r() - 0.5),
      m[1] + ny * h * 0.75 + g[1] * h * caida + ty * h * 0.25 * (r() - 0.5)];
    const c1 = [a[0] + nx * h * 0.5, a[1] + ny * h * 0.5];
    const c2 = [(punta[0] + b[0]) / 2 + nx * h * 0.1, (punta[1] + b[1]) / 2 + ny * h * 0.1];
    d += `Q${pt(c1)} ${pt(punta)}Q${pt(c2)} ${pt(b)}`;
  }
  return d + "Z";
}
const peludo = (ctrl, largo, semilla, g) => borde(suavizar(ctrl, 1.8), largo, azar(semilla), g);

// hebras de pelo dentro de una forma, para darle textura
function hebras(ctrl, cuantas, largo, angulo, semilla, abanico = 0.5) {
  const poly = suavizar(ctrl, 4), r = azar(semilla);
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let d = "";
  for (let k = 0, intentos = 0; k < cuantas && intentos < cuantas * 20; intentos++) {
    const pt = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    if (!dentro(pt, poly)) continue;
    k++;
    const a = (angulo + (r() - 0.5) * abanico) * Math.PI / 180, l = largo * (0.6 + 0.6 * r());
    const ex = Math.cos(a) * l, ey = Math.sin(a) * l, c = (r() - 0.5) * l * 0.4;
    d += `M${f(pt[0])},${f(pt[1])}q${f(ex / 2 - ey * c / l)},${f(ey / 2 + ex * c / l)} ${f(ex)},${f(ey)}`;
  }
  return d;
}

// ---------- formas (cada segmento se dibuja a lo largo de +x desde su articulación) ----------
const FORMAS = {
  brazo: [[-7, -8], [10, -9], [24, -8], [36, -6], [40, 0], [36, 6], [24, 8], [10, 9], [-7, 8], [-10, 0]],
  antebrazo: [[-5, -7], [14, -6.5], [28, -5], [34, 0], [28, 5], [14, 6.5], [-5, 7], [-7, 0]],
  mano: [[-1, -5.5], [7, -6.5], [12, -6], [15, -3], [15.5, 2], [13, 6], [5, 6.5], [-1, 5.5]],
  muslo: [[-6, -10], [10, -11], [26, -8], [35, 0], [26, 8], [10, 11], [-6, 10], [-10, 0]],
  pierna: [[-4, -8], [14, -7], [28, -5], [33, 0], [28, 5], [14, 7], [-4, 8], [-7, 0]],
  pie: [[-2, -5], [8, -6], [16, -5], [21, -1], [20, 4], [14, 6], [4, 6], [-2, 5]],
  // cuerpo horizontal, colgado boca arriba bajo la varita: pecho hacia +x, rabadilla hacia -x, espalda abajo
  torso: [[30, 38], [14, 40], [-4, 44], [-22, 44], [-38, 42], [-48, 50], [-46, 62], [-36, 70], [-16, 76], [6, 74], [24, 68], [36, 60], [40, 48]],
  // el manto: pelo largo y dorado que cuelga de los costados
  manto: [[-40, 56], [-20, 64], [4, 64], [22, 60], [30, 66], [22, 80], [2, 87], [-22, 85], [-40, 76], [-49, 63]],
  coronilla: [[-6, -6], [-4, -20], [6, -29], [18, -30], [28, -24], [32, -14], [30, -4], [20, 4], [4, 4]],
  cara: [[14, -24], [24, -25], [31, -19], [35, -10], [37.5, -3], [36, 3], [31, 7], [24, 8.5], [17, 6], [13, -2], [11, -14]],
  barba: [[10, 0], [24, 7], [33, 8], [31, 17], [25, 27], [14, 30], [6, 22], [4, 10]],
  menton: [[23, 6], [34, 5], [32, 10], [25, 11.5]],
};
const LARGO = { brazo: 34, antebrazo: 32, muslo: 32, pierna: 30 };
const COLOR = { cerca: "#1d1714", lejos: "#0d0a08", pelo: "#3d322b", peloLejos: "#211a16", piel: "#100c0b" };

function extremidad(tipo, lado, semilla) {
  const g = [-1, 0]; // manos y pies van hacia la varita: el pelo cae hacia el cuerpo
  const cerca = lado === "n", fondo = cerca ? COLOR.cerca : COLOR.lejos, hebra = cerca ? COLOR.pelo : COLOR.peloLejos;
  const pieza = (forma, largo) =>
    `<path d="${peludo(FORMAS[forma], largo, semilla + forma.length * 7, g)}" fill="${fondo}" stroke="${fondo}" stroke-width=".5"/>`
    + `<path d="${hebras(FORMAS[forma], 16, 6, 180, semilla + 3, 0.6)}" stroke="${hebra}" stroke-width=".8" fill="none" opacity=".7"/>`;
  if (tipo === "brazo") {
    const dedos = `<path d="M11,-4.5q3.5,1 3.4,3.4M11.5,-.5q3.3,.9 3.2,3.2M11,3q2.8,.8 2.6,2.6M4,-6q4,-1.5 8,.5" stroke="#2d2523" stroke-width=".8" fill="none" stroke-linecap="round"/>`;
    return `<g data-hombro="${lado}">${pieza("brazo", 3)}<g data-codo="${lado}">${pieza("antebrazo", 2.8)}`
      + `<g data-muneca="${lado}"><path d="${peludo(FORMAS.mano, 0.6, semilla + 11)}" fill="${COLOR.piel}"/>${cerca ? dedos : ""}</g></g></g>`;
  }
  const dedos = `<path d="M15,-3.5q4,1 4.5,3.5M14,1q3.5,.8 4,3M6,-5q4,-1 8,.5" stroke="#2d2523" stroke-width=".8" fill="none" stroke-linecap="round"/>`;
  return `<g data-cadera="${lado}">${pieza("muslo", 3.4)}<g data-rodilla="${lado}">${pieza("pierna", 3)}`
    + `<g data-tobillo="${lado}"><path d="${peludo(FORMAS.pie, 0.6, semilla + 13)}" fill="${COLOR.piel}"/>${cerca ? dedos : ""}</g></g></g>`;
}

function ojo(x, y, r, id) {
  return `<g transform="translate(${x},${y})"><circle r="${r}" fill="url(#cg-iris)"/><circle r="${f(r * 0.45)}" fill="#0a0604"/>`
    + `<circle cx="${f(-r * 0.3)}" cy="${f(-r * 0.32)}" r="${f(r * 0.26)}" fill="#fff" opacity=".9"/>`
    + `<ellipse data-parpado="${id}" rx="${f(r + 0.6)}" ry="${f(r + 0.6)}" fill="#171210" transform="scale(1,0)"/></g>`;
}

// la rama cruza la portada entre la capa de atrás y la de adelante del congo
const VARA = [["0", "#a8835a"], [".35", "#7d5835"], [".75", "#583a20"], ["1", "#3a2614"]];

// hoja tropical alargada que cuelga desde (x, y): punta fina y nervadura central
function hoja(x, y, giro, largo, tono) {
  const a = largo * 0.34;
  return `<g transform="translate(${f(x)},${f(y)}) rotate(${f(giro)})">`
    + `<path d="M0,0C${f(a)},${f(largo * 0.2)} ${f(a * 1.05)},${f(largo * 0.66)} 0,${f(largo)}C${f(-a * 1.05)},${f(largo * 0.66)} ${f(-a)},${f(largo * 0.2)} 0,0Z" fill="${tono}"/>`
    + `<path d="M0,0C${f(-a)},${f(largo * 0.2)} ${f(-a * 1.05)},${f(largo * 0.66)} 0,${f(largo)}Z" fill="#000" opacity=".12"/>`
    + `<path d="M0,${f(largo * 0.05)}Q${f(a * 0.12)},${f(largo * 0.5)} 0,${f(largo * 0.93)}" stroke="#24461f" stroke-width="${f(largo * 0.035)}" fill="none" opacity=".75"/></g>`;
}

// la rama, en px y a todo lo ancho: grosor algo irregular, corteza, nudos, un par de ramitas y muy pocas hojas
function rama(ancho, escala, y0, id) {
  const r = azar(Math.round(ancho) + 7), R = 4 * escala, arriba = [], abajo = [], fase = r() * 6;
  for (let x = -20; x <= ancho + 20; x += 16) {
    const g = R * (1 + 0.1 * Math.sin(x / 95 + fase) + 0.05 * Math.sin(x / 21 + fase * 2));
    arriba.push([x, y0 - g + 0.4 * escala * Math.sin(x / 140)]); abajo.push([x, y0 + g + 0.4 * escala * Math.sin(x / 140)]);
  }
  const linea = (pts) => pts.map(([x, y]) => f(x) + "," + f(y)).join("L");
  let corteza = "", nudos = "", ramitas = "", hojas = "";
  for (let i = 0; i < ancho / 12; i++) {
    const x = r() * ancho, l = (5 + r() * 12) * escala, y = y0 + (r() - 0.4) * R * 1.4;
    corteza += `M${f(x)},${f(y)}q${f(l / 2)},${f((r() - 0.5) * escala)} ${f(l)},${f((r() - 0.5) * escala)}`;
  }
  for (let i = 0; i < Math.max(2, Math.round(ancho / 320)); i++) {
    nudos += `<ellipse cx="${f(r() * ancho)}" cy="${f(y0 + R * 0.15)}" rx="${f(R * 0.8)}" ry="${f(R * 0.42)}" fill="#5b3d22" stroke="#2f1f10" stroke-width="${f(escala * 0.7)}"/>`;
  }
  const tonos = ["#3f7d3a", "#4f8f42", "#5a9c4b", "#36703a"], n = Math.max(3, Math.min(7, Math.round(ancho / 220)));
  for (let i = 0; i < n; i++) {
    const x = (ancho * (i + 0.2 + r() * 0.6)) / n, lado = r() < 0.5 ? -1 : 1;
    const ang = (90 - lado * (30 + r() * 35)) * Math.PI / 180, l = (9 + r() * 12) * escala;
    const x1 = x + Math.cos(ang) * l, y1 = y0 + R * 0.5 + Math.sin(ang) * l;
    ramitas += `<path d="M${f(x)},${f(y0 + R * 0.4)}Q${f((x + x1) / 2 + lado * escala)},${f((y0 + y1) / 2)} ${f(x1)},${f(y1)}" stroke="#4a321c" stroke-width="${f(1.5 * escala)}" fill="none" stroke-linecap="round"/>`;
    hojas += hoja(x1, y1, lado * (15 + r() * 30), (26 + r() * 10) * escala, tonos[i % 4]);
    if (r() < 0.55) hojas += hoja(x1, y1, -lado * (25 + r() * 25), (19 + r() * 8) * escala, tonos[(i + 2) % 4]);
  }
  const alto = y0 + 70 * escala;
  return `<svg width="${f(ancho)}" height="${f(alto)}" viewBox="0 0 ${f(ancho)} ${f(alto)}" aria-hidden="true" focusable="false">`
    + `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(y0 - R)}" x2="0" y2="${f(y0 + R)}">`
    + VARA.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("") + `</linearGradient></defs>`
    + ramitas + `<path d="M${linea(arriba)}L${linea(abajo.reverse())}Z" fill="url(#${id})"/>`
    + `<path d="${corteza}" stroke="#3a2614" stroke-width="${f(0.6 * escala)}" fill="none" opacity=".55" stroke-linecap="round"/>`
    + nudos + hojas + `</svg>`;
}
const VB = { x: -130, y: -14, w: 260, h: 264 };

const SVG_ATRAS = `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" aria-hidden="true" focusable="false">
<defs>
  <radialGradient id="cg-iris" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#8a5326"/><stop offset=".7" stop-color="#4a2a12"/><stop offset="1" stop-color="#1b0f07"/></radialGradient>
  <radialGradient id="cg-cara" cx=".6" cy=".35" r=".75"><stop offset="0" stop-color="#3b322e"/><stop offset=".55" stop-color="#1a1513"/><stop offset="1" stop-color="#0b0908"/></radialGradient>
  <radialGradient id="cg-brillo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#8c7a6c" stop-opacity=".38"/><stop offset="1" stop-color="#8c7a6c" stop-opacity="0"/></radialGradient>
  <linearGradient id="cg-manto" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2a14"/><stop offset=".45" stop-color="#8a5527"/><stop offset="1" stop-color="#b47a3c"/></linearGradient>
</defs>
<g data-atras>
  ${extremidad("brazo", "f", 21)}
  <g data-torso>${extremidad("pierna", "f", 41)}</g>
</g>
</svg>`;
// capa de adelante: va encima de la varita (la de atrás, con la mano y el pie lejanos, queda debajo)
const SVG_FRENTE = `<svg viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" aria-hidden="true" focusable="false">
<g data-frente>
  <path data-cola fill="${COLOR.cerca}"/>
  <g data-torso>
    <path d="${peludo(FORMAS.manto, 6, 5)}" fill="url(#cg-manto)"/>
    <path d="${peludo(FORMAS.torso, 4.2, 9)}" fill="${COLOR.cerca}"/>
    <path d="${hebras(FORMAS.torso, 70, 8, 175, 3, 0.7)}" stroke="${COLOR.pelo}" stroke-width=".9" fill="none" opacity=".75"/>
    <path d="${hebras(FORMAS.manto, 55, 10, 95, 4, 0.5)}" stroke="#9a6430" stroke-width="1" fill="none" opacity=".65"/>
    <ellipse cx="-4" cy="50" rx="30" ry="9" fill="url(#cg-brillo)"/>
    ${extremidad("pierna", "n", 31)}
    <g data-cabeza>
      <path d="${peludo(FORMAS.coronilla, 3.4, 15)}" fill="${COLOR.cerca}"/>
      <path d="${hebras(FORMAS.coronilla, 30, 6, 160, 6, 0.8)}" stroke="${COLOR.pelo}" stroke-width=".8" fill="none" opacity=".8"/>
      <ellipse cx="12" cy="-20" rx="11" ry="8" fill="url(#cg-brillo)"/>
      <g data-boca opacity="0"><ellipse cx="30" cy="7" rx="6" ry="4.5" fill="#3a0d0e"/><path d="M33.5,4.2l.8,3.2l.9,-3.1M26,4.5l.7,2.6l.8,-2.5" fill="#e3d8c6"/></g>
      <g data-mandibula>
        <path d="${peludo(FORMAS.barba, 3.6, 17)}" fill="#130f0d"/>
        <path d="${hebras(FORMAS.barba, 22, 7, 100, 8, 0.6)}" stroke="#352b25" stroke-width=".8" fill="none" opacity=".8"/>
        <path d="${peludo(FORMAS.menton, 0.3, 19)}" fill="#1c1715"/>
      </g>
      <path d="${peludo(FORMAS.cara, 0.35, 23)}" fill="url(#cg-cara)"/>
      <path d="M13.5,-18.5Q22,-23 31.5,-17.5" stroke="#3c3330" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M15,-8q6,3 13,1.5M30,-6q3,2 5.5,1" stroke="#2a2321" stroke-width=".7" fill="none" stroke-linecap="round"/>
      ${ojo(20.5, -13.5, 3, "n")}${ojo(29.2, -13, 2.3, "f")}
      <ellipse cx="35.6" cy="-2.6" rx="1.1" ry=".7" fill="#050303"/><ellipse cx="33.4" cy="-2.2" rx=".9" ry=".6" fill="#050303"/>
      <path data-labios d="M35.5,4.6Q30.5,7.6 24.5,6.6" stroke="#060404" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    </g>
  </g>
  ${extremidad("brazo", "n", 11)}
</g>
</svg>`;

// ---------- esqueleto (marco del cuerpo: con el cuerpo horizontal coincide con el del congo) ----------
const S0 = [26, 50]; // hombro cercano: pivote del cuerpo (en el marco del cuerpo)
const ANDANDO = [26, 63]; // dónde va ese hombro al andar: bastante bajo, con brazos y patas casi estirados
const HOMBRO = { n: [26, 50], f: [20, 46] };
const CADERA = { n: [-30, 52], f: [-36, 48] };
const CUELLO = [34, 48], RABO = [-46, 56];
const AGARRE_Y = { mano: 11, pata: 15, cola: 5 }; // muñeca, tobillo y punta de la cola bajo el centro de la varita
const ZANCADA = 34, CICLO = 2.2, VUELO = 0.22, MEDIO = (1 - VUELO) / 2, V = ZANCADA / CICLO;
// orden del paso, como en los primates: pata cercana, mano cercana, pata lejana, mano lejana; la cola va detrás
const MIEMBROS = {
  pn: { fase: 0, casa: -26, tipo: "pata", lado: "n" },
  an: { fase: 0.25, casa: 30, tipo: "mano", lado: "n" },
  pf: { fase: 0.5, casa: -32, tipo: "pata", lado: "f" },
  af: { fase: 0.75, casa: 24, tipo: "mano", lado: "f" },
  cola: { fase: 0.6, casa: -80, tipo: "cola" },
};

const suave = (u) => u * u * (3 - 2 * u);
const tope = (u) => Math.min(1, Math.max(0, u));
const mezcla = (a, b, t) => a + (b - a) * t;
const mezclaP = (a, b, t) => [mezcla(a[0], b[0], t), mezcla(a[1], b[1], t)];
const mezclaAng = (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;
const grados = (r) => (r * 180) / Math.PI;
const modulo = (a) => ((a % 1) + 1) % 1;

// posición (relativa al cuerpo) del agarre de un miembro en la fase p del ciclo
function enFase(m, p) {
  const q = modulo(p - m.fase - VUELO);
  return m.casa + MEDIO * ZANCADA - Math.min(q, 1 - VUELO) * ZANCADA;
}

// dos huesos: ángulos absolutos (grados) de los dos segmentos; signo -1 = articulación hacia atrás, +1 hacia adelante
function ik([sx, sy], [px, py], a, b, signo) {
  let dx = px - sx, dy = py - sy;
  const d = Math.hypot(dx, dy) || 1, dm = Math.min(a + b - 0.5, Math.max(Math.abs(a - b) + 0.5, d));
  dx *= dm / d; dy *= dm / d;
  const base = Math.atan2(dy, dx), k = Math.acos((a * a + dm * dm - b * b) / (2 * a * dm));
  const u = base + signo * k, ex = sx + a * Math.cos(u), ey = sy + a * Math.sin(u);
  return [grados(u), grados(Math.atan2(sy + dy - ey, sx + dx - ex))];
}

let instancias = 0;

if (portada && !portada.dataset.congo) { // una sola vez, aunque el módulo se cargue con otra versión en la dirección
  portada.dataset.congo = "1";
  const congo = montar(portada, { antes: portada.querySelector(".portada__recorrido-boton") });
  // el botón va sobre el cuerpo del congo: al tocarlo, se baja de la rama y atiende el asistente
  congo.boton.addEventListener("click", () => {
    import("./asistente.js").then((m) => m.abrir(congo)).catch(() => congo.mostrar());
  });
}

// Monta un congo con su rama dentro de «contenedor».
//   op.panel: en el asistente, quieto en su rama (no anda ni da vueltas); si no, anda por la portada.
//   op.antes: elemento antes del cual se insertan las capas.
export function montar(contenedor, op = {}) {
  const panel = !!op.panel, pref = `cg${++instancias}-`;
  const caja = document.createElement("div");
  caja.className = "congo";
  caja.setAttribute("aria-hidden", "true");
  caja.innerHTML = SVG_ATRAS.replaceAll("cg-", pref);
  const vara = document.createElement("div"), frente = caja.cloneNode();
  vara.className = "congo-vara";
  vara.setAttribute("aria-hidden", "true");
  frente.innerHTML = SVG_FRENTE.replaceAll("cg-", pref);
  contenedor.insertBefore(caja, op.antes || null);
  caja.after(vara, frente);
  let boton = null;
  if (!panel) {
    boton = document.createElement("button");
    boton.type = "button";
    boton.className = "congo-boton";
    boton.setAttribute("aria-label", "Hablar con el congo, el asistente de la Sede");
    boton.setAttribute("aria-haspopup", "dialog");
    boton.innerHTML = `<span class="congo-boton__globo" aria-hidden="true">¿Una duda? ¡Pregúnteme!</span>`;
    frente.after(boton);
  }
  const cajas = [caja, frente], svgs = cajas.map((c) => c.firstElementChild);
  const q = (s) => caja.querySelector(s) || frente.querySelector(s), todos = (s) => cajas.flatMap((c) => [...c.querySelectorAll(s)]);
  const el = {
    atras: q("[data-atras]"), frente: q("[data-frente]"), torsos: todos("[data-torso]"),
    cabeza: q("[data-cabeza]"), mandibula: q("[data-mandibula]"), boca: q("[data-boca]"), labios: q("[data-labios]"),
    cola: q("[data-cola]"), parpados: todos("[data-parpado]"),
  };
  for (const l of ["n", "f"]) for (const k of ["hombro", "codo", "muneca", "cadera", "rodilla", "tobillo"]) el[k + l] = q(`[data-${k}="${l}"]`);

  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let escala = 0.55, pista = [0, 0], y0 = 2, anchoRama = 0;

  // tamaño y pista (en unidades). La rama va pegada al borde de arriba; en la portada el congo anda
  // sobre la parte clara de la maqueta; en el panel se queda en su sitio.
  function medir() {
    const r = contenedor.getBoundingClientRect();
    if (panel) {
      escala = op.escala || 0.62;
      pista = [op.x / escala, op.x / escala];
    } else {
      escala = (0.9 * Math.min(210, Math.max(140, innerWidth * 0.17))) / 226;
      const gutter = parseFloat(getComputedStyle(contenedor.querySelector(".portada__texto")).paddingRight) || 16;
      const form = contenedor.querySelector(".portada__buscar")?.getBoundingClientRect();
      const izq = innerWidth <= 760 ? gutter + 85 * escala : Math.max(r.width * 0.56, (form ? form.right - r.left : 0) + 40) + 70 * escala;
      const der = r.width - gutter - 85 * escala;
      pista = [izq / escala, Math.max(izq, der) / escala];
    }
    y0 = 4 * escala; // el canto de arriba de la rama queda en el borde
    for (const s of svgs) { s.style.width = f(VB.w * escala) + "px"; s.style.height = f(VB.h * escala) + "px"; }
    for (const c of cajas) c.style.top = f(y0 + VB.y * escala) + "px";
    if (Math.abs(r.width - anchoRama) > 1) { anchoRama = r.width; vara.innerHTML = rama(r.width, escala, y0, pref + "rama"); }
    if (boton) { boton.style.width = f(120 * escala) + "px"; boton.style.height = f(92 * escala) + "px"; boton.style.top = f(y0 + 8 * escala) + "px"; }
  }

  // ---------- estado ----------
  const e = { modo: "paso", dir: 1, x: 0, p: 0, t: 0, espera: 0, parando: false, agarre: {}, vuelo: {}, giro: null,
    aullido: -1, parpadeo: 3, reloj: 0, habla: false, piensa: false };
  const rel = (w) => (w - e.x) * e.dir;
  function plantar(p) {
    for (const k in MIEMBROS) { e.agarre[k] = e.x + e.dir * enFase(MIEMBROS[k], p); e.vuelo[k] = null; }
  }

  // el cuerpo: P es la posición del hombro cercano y el giro (grados) inclina el cuerpo sobre él
  const aCuerpo = (P, giro, [x, y]) => {
    const a = giro * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - S0[0], dy = y - S0[1];
    return [P[0] + dx * c - dy * s, P[1] + dx * s + dy * c];
  };
  const desdeCuerpo = (P, giro, [x, y]) => {
    const a = -giro * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - P[0], dy = y - P[1];
    return [S0[0] + dx * c - dy * s, S0[1] + dx * s + dy * c];
  };

  function paso(dt) {
    e.reloj += dt;
    const pose = { P: [...ANDANDO], giro: 0, s: 1, eje: 0, obj: {}, suelto: { an: 0, af: 0, pn: 0, pf: 0, cola: 0 },
      libre: null, cabeza: 8, mandibula: 0, meneo: 0 };
    for (const k in MIEMBROS) pose.obj[k] = [rel(e.agarre[k]), 0];

    if (e.modo === "paso") {
      e.p += dt / CICLO;
      if (!e.parando) e.x += e.dir * V * dt;
      let volando = false;
      for (const k in MIEMBROS) {
        const m = MIEMBROS[k], q = modulo(e.p - m.fase), enVuelo = q < VUELO;
        if (enVuelo && !e.vuelo[k] && !e.parando) {
          e.vuelo[k] = { desde: e.agarre[k], hacia: e.x + e.dir * ((VUELO - q) * ZANCADA + m.casa + MEDIO * ZANCADA) };
        }
        const v = e.vuelo[k];
        if (v && !enVuelo) { e.agarre[k] = v.hacia; e.vuelo[k] = null; }
        if (e.vuelo[k]) {
          const u = q / VUELO;
          volando = true;
          pose.obj[k] = [rel(mezcla(v.desde, v.hacia, suave(u))), (k === "cola" ? 7 : 10) * Math.sin(Math.PI * u)];
        } else pose.obj[k] = [rel(e.agarre[k]), 0];
      }
      pose.P[1] += 1.5 * Math.sin(4 * Math.PI * e.p);
      pose.giro = 1.2 * Math.sin(4 * Math.PI * e.p + 1);
      pose.cabeza = 8 + 2.5 * Math.sin(2 * Math.PI * e.p);
      if (!e.parando && (e.dir > 0 ? e.x >= pista[1] : e.x <= pista[0])) e.parando = true;
      if (e.parando && !volando) {
        e.modo = "descanso"; e.t = 0; e.espera = quieto ? Infinity : 2 + Math.random() * 2.5;
        e.aullido = Math.random() < 0.55 ? 0.5 + Math.random() * 0.6 : -1;
      }
    } else if (e.modo === "descanso") {
      e.t += dt;
      pose.P[1] += 1.2 * Math.sin(e.reloj * 1.6); // respira y se mece un poco
      pose.giro = 1.5 * Math.sin(e.reloj * 1.1);
      pose.cabeza = 8 + 4 * Math.sin(e.reloj * 0.7);
      if (e.aullido >= 0 && e.t > e.aullido) { // aúlla: echa la cabeza atrás y abre la boca
        const a = e.t - e.aullido, env = tope(a / 0.3) * tope((2 - a) / 0.35);
        pose.mandibula = env * (20 + 2 * Math.sin(e.reloj * 38));
        pose.cabeza -= 16 * env;
      }
      if (e.habla) { pose.mandibula = 2 + 9 * Math.abs(Math.sin(e.reloj * 9)); pose.cabeza += 2 * Math.sin(e.reloj * 4.5); }
      if (e.piensa) { pose.cabeza -= 10 + 3 * Math.sin(e.reloj * 1.7); } // mira para arriba, pensando
      if (e.t >= e.espera) {
        const lider = rel(e.agarre.an) >= rel(e.agarre.af) ? "an" : "af";
        e.modo = "giro"; e.giro = { t: 0, lider, libre: lider === "an" ? "af" : "an", hecho: false };
      }
    } else girar(dt, pose);

    // parpadeo
    e.parpadeo -= dt;
    pose.parpado = 0;
    if (e.parpadeo < 0) {
      pose.parpado = Math.sin(Math.PI * tope(-e.parpadeo / 0.16));
      if (e.parpadeo < -0.16) e.parpadeo = 2.5 + Math.random() * 4;
    }
    return pose;
  }

  // La vuelta, como la da un congo: suelta las patas y la cola y queda colgando de las manos; suelta la mano
  // de atrás y gira sobre el brazo que lo sostiene; agarra la varita del otro lado y vuelve a subir patas y cola.
  function girar(dt, pose) {
    const g = e.giro;
    g.t += dt;
    const t = g.t;
    const k1 = suave(tope(t / 0.8)), k2 = suave(tope((t - 0.8) / 0.55)), u3 = tope((t - 1.35) / 0.7);
    const k4 = suave(tope((t - 2.05) / 0.55)), k5 = suave(tope((t - 2.6) / 0.9));
    if (u3 >= 0.5 && !g.hecho) { // a medio giro ya mira al otro lado: se cambian los agarres al nuevo sentido
      g.hecho = true;
      const pivote = e.agarre[g.lider];
      e.dir *= -1;
      e.x = pivote - e.dir * enFase(MIEMBROS[g.lider], 0);
      plantar(0);
      e.agarre[g.lider] = pivote;
    }
    const colgado = k1 * (1 - k5);
    pose.giro = -90 * colgado + 7 * Math.sin(t * 3.1) * colgado * (1 - k5); // cuelga y se balancea
    const lado = MIEMBROS[g.lider].lado, sl = MIEMBROS[g.libre].lado;
    const offH = aCuerpo([0, 0], pose.giro, HOMBRO[lado]); // hombro que sostiene, medido desde P
    const lider = rel(e.agarre[g.lider]);
    const unaMano = [lider - offH[0], AGARRE_Y.mano + 63 - offH[1]];
    const dosManos = (a, b) => [(a + b) / 2 - 3, 72];
    let P;
    if (!g.hecho) P = mezclaP(mezclaP(ANDANDO, dosManos(lider, rel(e.agarre[g.libre])), k1), unaMano, k2);
    else P = mezclaP(mezclaP(unaMano, dosManos(lider, rel(e.agarre[g.libre])), k4), ANDANDO, k5);
    pose.P = P;
    // la mano libre cuelga junto al cuerpo y luego busca la varita del otro lado
    const hombroLibre = aCuerpo(P, pose.giro, HOMBRO[sl]);
    const colgando = [hombroLibre[0] + 5, hombroLibre[1] + 58];
    const agarreLibre = [rel(e.agarre[g.libre]), AGARRE_Y.mano];
    if (!g.hecho) { pose.libre = mezclaP(agarreLibre, colgando, k2); pose.suelto[g.libre] = k2; }
    else {
      pose.libre = mezclaP(colgando, agarreLibre, k4);
      pose.libre[1] += 8 * Math.sin(Math.PI * k4);
      pose.suelto[g.libre] = 1 - k4;
    }
    for (const k of ["pn", "pf", "cola"]) pose.suelto[k] = colgado;
    // gira sobre el brazo que lo sostiene
    if (u3 > 0 && u3 < 1) { pose.s = Math.max(0.5, Math.abs(Math.cos(Math.PI * u3))); pose.eje = lider; } // un cuerpo colgado de frente no es una lámina: nunca se afina del todo
    pose.cabeza = 8 + 80 * colgado;
    pose.meneo = colgado;
    if (t >= 3.5) { e.modo = "paso"; e.p = 0; e.parando = false; e.giro = null; for (const k in MIEMBROS) e.vuelo[k] = null; }
  }

  const pon = (nodo, t) => nodo.setAttribute("transform", t);

  function dibujar(o) {
    for (const c of cajas) c.style.transform = `translate3d(${f((e.x + VB.x) * escala)}px,0,0)`;
    if (boton) {
      boton.style.transform = `translate3d(${f((e.x - 5 * e.dir - 60) * escala)}px,0,0)`;
      const globo = (e.modo === "descanso" && e.t > 0.5 && e.t < 3.4) || (e.reloj > 2 && e.reloj < 7);
      boton.classList.toggle("congo-boton--globo", globo);
    }
    const espejo = `translate(${f(e.dir * o.eje)},0) scale(${(e.dir * o.s).toFixed(3)},1) translate(${f(-o.eje)},0)`;
    pon(el.atras, espejo); pon(el.frente, espejo);
    const cuerpo = `translate(${f(o.P[0])},${f(o.P[1])}) rotate(${f(o.giro)}) translate(${-S0[0]},${-S0[1]})`;
    for (const t of el.torsos) pon(t, cuerpo);
    // brazos (marco del congo): el codo queda hacia atrás
    for (const k of ["an", "af"]) {
      const l = MIEMBROS[k].lado, w = o.suelto[k];
      const obj = o.libre && w > 0 ? o.libre : [o.obj[k][0], AGARRE_Y.mano + o.obj[k][1]];
      const hombro = aCuerpo(o.P, o.giro, HOMBRO[l]);
      const [a1, a2] = ik(hombro, obj, LARGO.brazo, LARGO.antebrazo, -1);
      const alzada = o.obj[k][1] / 10;
      const mano = mezclaAng(-90, a2, Math.max(w, alzada * 0.6)); // al agarrar, el puño apunta a la varita
      pon(el["hombro" + l], `translate(${f(hombro[0])},${f(hombro[1])}) rotate(${f(a1)})`);
      pon(el["codo" + l], `translate(${LARGO.brazo},0) rotate(${f(a2 - a1)})`);
      pon(el["muneca" + l], `translate(${LARGO.antebrazo},0) rotate(${f(mano - a2)})`);
    }
    // patas (marco del cuerpo): la rodilla hacia adelante; sueltas, cuelgan y se mecen
    for (const k of ["pn", "pf"]) {
      const l = MIEMBROS[k].lado, w = o.suelto[k];
      const obj = desdeCuerpo(o.P, o.giro, [o.obj[k][0], AGARRE_Y.pata + o.obj[k][1]]);
      const [i1, i2] = ik(CADERA[l], obj, LARGO.muslo, LARGO.pierna, 1);
      const pieAgarre = mezclaAng(-90 - o.giro, i2, (o.obj[k][1] / 10) * 0.6);
      const meneo = 10 * Math.sin(e.reloj * 2.2 + (l === "n" ? 0 : 1.7)) * o.meneo;
      const m1 = 92 - o.giro + meneo + (l === "n" ? -6 : 4), m2 = m1 + 22, m3 = m2 - 40;
      const a = mezclaAng(i1, m1, w), b = mezclaAng(i2, m2, w), c = mezclaAng(pieAgarre, m3, w);
      pon(el["cadera" + l], `translate(${CADERA[l]}) rotate(${f(a)})`);
      pon(el["rodilla" + l], `translate(${LARGO.muslo},0) rotate(${f(b - a)})`);
      pon(el["tobillo" + l], `translate(${LARGO.pierna},0) rotate(${f(c - b)})`);
    }
    // cabeza, boca y párpados
    pon(el.cabeza, `translate(${CUELLO}) rotate(${f(o.cabeza)}) scale(1.12)`);
    pon(el.mandibula, `rotate(${f(o.mandibula)},22,4)`);
    el.boca.setAttribute("opacity", tope(o.mandibula / 6).toFixed(2));
    el.labios.setAttribute("opacity", (1 - tope(o.mandibula / 4)).toFixed(2));
    for (const p of el.parpados) p.setAttribute("transform", `scale(1,${o.parpado.toFixed(2)})`);
    // cola: sale de la rabadilla y se enrosca en la varita (o cuelga, si la soltó)
    el.cola.setAttribute("d", cola(aCuerpo(o.P, o.giro, RABO), [o.obj.cola[0], AGARRE_Y.cola + o.obj.cola[1]], o.suelto.cola));
  }

  function cola(b, t, w) {
    const punta = [mezcla(t[0], b[0] - 6, w), mezcla(t[1], b[1] + 80, w)];
    const c1 = [b[0] - 22 + 16 * w, b[1] + 26];
    const c2 = [punta[0] - 18 + 14 * w, punta[1] + 40 - 70 * w];
    const centro = [];
    for (let i = 0; i <= 26; i++) {
      const u = i / 26, v = 1 - u;
      centro.push([0, 1].map((k) => v * v * v * b[k] + 3 * v * v * u * c1[k] + 3 * v * u * u * c2[k] + u * u * u * punta[k]));
    }
    // la punta da la vuelta por encima de la varita
    const gancho = [[-1, -3], [0, -7], [3, -10], [7, -9.5], [9, -6], [8.5, -2]];
    for (const [dx, dy] of gancho) centro.push([punta[0] + dx * (1 - w), punta[1] + dy * (1 - w) + 0.01]);
    const n = centro.length, izq = [], der = [];
    for (let i = 0; i < n; i++) {
      const a = centro[Math.max(0, i - 1)], z = centro[Math.min(n - 1, i + 1)];
      let tx = z[0] - a[0], ty = z[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const ancho = 7.5 - 5 * Math.pow(i / (n - 1), 0.8);
      izq.push([centro[i][0] - ty * ancho, centro[i][1] + tx * ancho]);
      der.push([centro[i][0] + ty * ancho, centro[i][1] - tx * ancho]);
    }
    return borde([...izq, ...der.reverse()], 1.5, azar(77)); // misma semilla: los mechones no titilan
  }

  // ---------- arranque ----------
  medir();
  e.x = pista[0] + (pista[1] - pista[0]) * 0.3;
  plantar(0);
  if (panel) { e.modo = "descanso"; e.espera = Infinity; }
  if (quieto) { e.modo = "descanso"; e.espera = Infinity; }

  let ultimo = 0, acumulado = 0, activo = false, cuadro = 0, visible = true;
  function ciclo(ahora) {
    if (!activo) return;
    const dt = Math.min(0.1, (ahora - (ultimo || ahora)) / 1000);
    ultimo = ahora; acumulado += dt;
    const pose = paso(dt);
    if (acumulado >= 1 / 30) { acumulado = 0; dibujar(pose); } // basta con 30 cuadros por segundo
    cuadro = requestAnimationFrame(ciclo);
  }
  const arrancar = () => {
    if (quieto) { dibujar(paso(0)); return; }
    if (!activo && visible) { activo = true; ultimo = 0; cuadro = requestAnimationFrame(ciclo); }
  };
  const parar = () => { activo = false; cancelAnimationFrame(cuadro); };
  if (!panel) new IntersectionObserver(([v]) => (v.isIntersecting ? arrancar() : parar())).observe(contenedor);
  let espera;
  addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      medir();
      if (e.modo === "giro") return;
      e.x = Math.min(pista[1], Math.max(pista[0], e.x));
      if (panel) return;
      e.modo = "paso"; e.parando = false; e.p = 0; plantar(0);
    }, 200);
  });
  dibujar(paso(0));
  cajas.forEach((c) => c.classList.add("congo--listo"));

  const capas = boton ? [...cajas, boton] : cajas;
  return {
    boton,
    // se baja de la rama (la portada lo esconde mientras el asistente está abierto) y vuelve
    esconder() { capas.forEach((c) => c.classList.add("congo--fuera")); setTimeout(() => { if (!visible) parar(); }, 600); visible = false; },
    mostrar() { visible = true; capas.forEach((c) => c.classList.remove("congo--fuera")); arrancar(); },
    seguir() { visible = true; medir(); arrancar(); },
    pausar() { visible = false; parar(); },
    hablar(si) { e.habla = si; },
    pensar(si) { e.piensa = si; },
    aullar(dentro = 0.2) { if (e.modo === "descanso") e.aullido = e.t + dentro; },
  };
}
