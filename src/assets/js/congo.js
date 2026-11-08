// Congo (mono aullador de manto, Alouatta palliata) que cuelga del borde de la cabecera, sobre la maqueta de la portada.
// Es decorativo: avanza mano a mano por el borde, se agarra también con la cola, descansa en los extremos
// (a veces aúlla) y da la vuelta. Dibujo en SVG con un esqueleto simple: los brazos se resuelven con cinemática
// inversa para que las manos queden fijas en el borde mientras el cuerpo avanza.
// Coordenadas internas en «unidades»: x=0 es el centro del cuerpo, y=0 el borde; el congo mira hacia +x.
// Con «reducir movimiento» queda quieto, colgando. Se detiene cuando la portada no está a la vista.

const portada = document.querySelector(".portada");
const caja = portada?.querySelector(".congo");

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
  torso: [[-8, 60], [6, 56], [18, 60], [26, 70], [28, 86], [27, 104], [22, 122], [14, 138], [4, 148], [-10, 152], [-22, 146], [-27, 128], [-26, 104], [-22, 82], [-16, 66]],
  manto: [[-20, 84], [-8, 92], [4, 112], [8, 136], [0, 152], [-14, 161], [-28, 153], [-33, 130], [-30, 104]],
  coronilla: [[-6, -6], [-4, -20], [6, -29], [18, -30], [28, -24], [32, -14], [30, -4], [20, 4], [4, 4]],
  cara: [[14, -24], [24, -25], [31, -19], [35, -10], [37.5, -3], [36, 3], [31, 7], [24, 8.5], [17, 6], [13, -2], [11, -14]],
  barba: [[10, 0], [24, 7], [33, 8], [31, 17], [25, 27], [14, 30], [6, 22], [4, 10]],
  menton: [[23, 6], [34, 5], [32, 10], [25, 11.5]],
};
const LARGO = { brazo: 34, antebrazo: 32, muslo: 32, pierna: 30 };
const COLOR = { cerca: "#1d1714", lejos: "#0d0a08", pelo: "#3d322b", peloLejos: "#211a16", piel: "#100c0b" };

function extremidad(tipo, lado, semilla) {
  const g = tipo === "brazo" ? [-1, 0] : [1, 0];
  const cerca = lado === "n", fondo = cerca ? COLOR.cerca : COLOR.lejos, hebra = cerca ? COLOR.pelo : COLOR.peloLejos;
  const pieza = (forma, largo, extra = "") =>
    `<path d="${peludo(FORMAS[forma], largo, semilla + forma.length * 7, g)}" fill="${fondo}" stroke="${fondo}" stroke-width=".5"/>`
    + `<path d="${hebras(FORMAS[forma], 16, 6, 0, semilla + 3, 0.6)}" stroke="${hebra}" stroke-width=".8" fill="none" opacity=".7"/>` + extra;
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

const SVG = `<svg viewBox="-95 -2 190 226" aria-hidden="true" focusable="false">
<defs>
  <radialGradient id="cg-iris" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#8a5326"/><stop offset=".7" stop-color="#4a2a12"/><stop offset="1" stop-color="#1b0f07"/></radialGradient>
  <radialGradient id="cg-cara" cx=".6" cy=".35" r=".75"><stop offset="0" stop-color="#3b322e"/><stop offset=".55" stop-color="#1a1513"/><stop offset="1" stop-color="#0b0908"/></radialGradient>
  <radialGradient id="cg-brillo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#8c7a6c" stop-opacity=".38"/><stop offset="1" stop-color="#8c7a6c" stop-opacity="0"/></radialGradient>
  <linearGradient id="cg-manto" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#4a2a14"/><stop offset=".45" stop-color="#8a5527"/><stop offset="1" stop-color="#b47a3c"/></linearGradient>
</defs>
<g data-raiz>
  ${extremidad("brazo", "f", 21)}
  <path data-cola fill="${COLOR.cerca}"/>
  <g data-torso>
    ${extremidad("pierna", "f", 41)}
    <path d="${peludo(FORMAS.manto, 5.5, 5)}" fill="url(#cg-manto)"/>
    <path d="${peludo(FORMAS.torso, 4.2, 9)}" fill="${COLOR.cerca}"/>
    <path d="${hebras(FORMAS.torso, 70, 8, 95, 3, 0.7)}" stroke="${COLOR.pelo}" stroke-width=".9" fill="none" opacity=".75"/>
    <path d="${hebras(FORMAS.manto, 55, 10, 100, 4, 0.5)}" stroke="#9a6430" stroke-width="1" fill="none" opacity=".65"/>
    <ellipse cx="12" cy="88" rx="13" ry="24" fill="url(#cg-brillo)"/>
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

// ---------- esqueleto ----------
const HOMBRO = { n: [8, 68], f: [0, 64] };
const CADERA = { n: [2, 140], f: [-8, 136] };
const CUELLO = [18, 66], PIVOTE = [2, 64], RABO = [-18, 142];
const MUNECA_Y = 15; // la muñeca queda 15 unidades bajo el borde: el puño llega justo al borde
const PASO = 34, DURA_PASO = 1.5, COLA_ATRAS = 40;

const girar = ([x, y], ang, [cx, cy]) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};
const suave = (u) => u * u * (3 - 2 * u);
const tope = (u) => Math.min(1, Math.max(0, u));
const avance = (p) => p - Math.sin(2 * Math.PI * p) / (2 * Math.PI); // avanza a tirones, como colgado
const grados = (r) => (r * 180) / Math.PI;

// dos huesos: devuelve los ángulos (absolutos, en grados) del brazo y del antebrazo; el codo queda hacia atrás
function ik([sx, sy], [px, py], a, b) {
  let dx = px - sx, dy = py - sy, d = Math.hypot(dx, dy);
  const dm = Math.min(a + b - 0.5, Math.max(Math.abs(a - b) + 0.5, d));
  dx *= dm / d; dy *= dm / d;
  const base = Math.atan2(dy, dx), k = Math.acos((a * a + dm * dm - b * b) / (2 * a * dm));
  const u = base - k, ex = sx + a * Math.cos(u), ey = sy + a * Math.sin(u);
  return [grados(u), grados(Math.atan2(sy + dy - ey, sx + dx - ex))];
}

if (caja) iniciar();

function iniciar() {
  caja.innerHTML = SVG;
  const svg = caja.firstElementChild, q = (s) => svg.querySelector(s);
  const el = {
    raiz: q("[data-raiz]"), torso: q("[data-torso]"), cabeza: q("[data-cabeza]"), mandibula: q("[data-mandibula]"),
    boca: q("[data-boca]"), labios: q("[data-labios]"), cola: q("[data-cola]"),
    parpados: [...svg.querySelectorAll("[data-parpado]")],
  };
  for (const l of ["n", "f"]) {
    el["hombro" + l] = q(`[data-hombro="${l}"]`); el["codo" + l] = q(`[data-codo="${l}"]`); el["muneca" + l] = q(`[data-muneca="${l}"]`);
    el["cadera" + l] = q(`[data-cadera="${l}"]`); el["rodilla" + l] = q(`[data-rodilla="${l}"]`); el["tobillo" + l] = q(`[data-tobillo="${l}"]`);
  }

  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let escala = 1, pista = [0, 0];

  // por dónde puede andar (en unidades): sobre la maqueta, sin tapar el texto ni el botón del recorrido
  function medir() {
    const r = portada.getBoundingClientRect();
    const alto = svg.getBoundingClientRect().height || 140;
    escala = alto / 226;
    svg.style.width = f(alto * 190 / 226) + "px";
    const gutter = parseFloat(getComputedStyle(portada.querySelector(".portada__texto")).paddingRight) || 16;
    const boton = portada.querySelector(".portada__recorrido-boton")?.getBoundingClientRect();
    const form = portada.querySelector(".portada__buscar")?.getBoundingClientRect();
    let izq, der;
    if (boton && boton.top - r.top < 100) { // celular: el botón está arriba a la derecha
      izq = gutter + 66 * escala; der = boton.left - r.left - 10 - 62 * escala;
    } else { // pantalla ancha: a la derecha del texto, sobre la parte clara de la maqueta
      izq = Math.max(r.width * 0.56, (form ? form.right - r.left : 0) + 40) + 62 * escala; der = r.width - gutter - 62 * escala;
    }
    pista = [izq / escala, Math.max(izq, der) / escala];
  }

  // ---------- estado ----------
  const e = { modo: "descanso", dir: 1, B: 0, x: 0, p: 0, t: 0, espera: 2, giro: 0, giroHecho: false,
    agarre: { n: 0, f: 0, cola: 0 }, mano: null, desde: 0, colaDesde: 0, aullido: -1, parpadeo: 3, reloj: 0 };
  const agarrar = () => {
    e.agarre.n = e.x + (PASO / 2) * e.dir; e.agarre.f = e.x - (PASO / 2) * e.dir; e.agarre.cola = e.x - COLA_ATRAS * e.dir;
  };

  function colocar(inicio) {
    medir();
    e.x = e.B = inicio ?? Math.min(pista[1], Math.max(pista[0], e.x));
    agarrar();
  }

  function paso(dt) {
    e.reloj += dt;
    const pose = { lean: 0, piernas: 0, onda: 0, sx: e.dir, manos: {}, colaX: 0, colaY: 6, cabeza: 6, mandibula: 0 };
    if (e.modo === "paso") {
      e.p = Math.min(1, e.p + dt / DURA_PASO);
      e.x = e.B + PASO * avance(e.p) * e.dir;
      const u = suave(tope((e.p - 0.08) / 0.6));
      pose.manos[e.mano] = [e.desde + (e.B + 1.5 * PASO * e.dir - e.desde) * u, 16 * Math.sin(Math.PI * u)];
      const v = suave(tope((e.p - 0.5) / 0.42)), destinoCola = e.B + (PASO - COLA_ATRAS) * e.dir;
      pose.cola = [e.colaDesde + (destinoCola - e.colaDesde) * v, 9 * Math.sin(Math.PI * v)];
      pose.lean = 5 * Math.sin(2 * Math.PI * e.p);
      pose.onda = 2 * Math.PI * e.p; pose.piernas = 1;
      pose.cabeza = 6 + 2 * Math.sin(2 * Math.PI * e.p + 1);
      if (e.p >= 1) {
        e.agarre[e.mano] = e.B + 1.5 * PASO * e.dir; e.agarre.cola = destinoCola; e.B = e.x;
        siguiente();
      }
    } else if (e.modo === "descanso") {
      e.t += dt;
      pose.lean = 1.5 * Math.sin(e.reloj * 1.3);
      pose.onda = e.reloj * 1.1; pose.piernas = 0.45;
      if (e.aullido >= 0 && e.t > e.aullido) { // aúlla: echa la cabeza atrás y abre la boca
        const a = e.t - e.aullido, env = tope(a / 0.3) * tope((2 - a) / 0.35);
        pose.mandibula = env * (20 + 2 * Math.sin(e.reloj * 38));
        pose.cabeza = 6 - 12 * env;
      }
      if (e.t >= e.espera && !quieto) { e.modo = "giro"; e.giro = 0; e.giroHecho = false; }
    } else { // giro: se voltea como si rotara sobre sí mismo
      e.giro = Math.min(1, e.giro + dt / 0.8);
      if (e.giro >= 0.5 && !e.giroHecho) {
        e.giroHecho = true; e.dir *= -1; e.agarre.cola = e.x - COLA_ATRAS * e.dir;
      }
      pose.sx = e.dir * Math.max(0.06, Math.abs(Math.cos(Math.PI * e.giro)));
      pose.lean = 2 * Math.sin(Math.PI * e.giro); pose.onda = e.reloj * 1.1; pose.piernas = 0.6;
      if (e.giro >= 1) { e.B = e.x; siguiente(); }
    }
    // parpadeo
    e.parpadeo -= dt;
    let parpado = 0;
    if (e.parpadeo < 0) { parpado = Math.sin(Math.PI * tope(-e.parpadeo / 0.16)); if (e.parpadeo < -0.16) e.parpadeo = 2.5 + Math.random() * 4; }
    pose.parpado = parpado;
    return pose;
  }

  // decide el siguiente paso, o descansar si llegó al extremo de la pista
  function siguiente() {
    const sig = e.x + PASO * e.dir;
    if (sig > pista[1] || sig < pista[0]) {
      e.modo = "descanso"; e.t = 0; e.espera = 3 + Math.random() * 3;
      e.aullido = Math.random() < 0.6 ? 0.6 + Math.random() * 0.8 : -1;
      return;
    }
    e.modo = "paso"; e.p = 0;
    const rel = (l) => (e.agarre[l] - e.x) * e.dir;
    e.mano = rel("n") < rel("f") ? "n" : "f"; // se suelta la mano de atrás
    e.desde = e.agarre[e.mano]; e.colaDesde = e.agarre.cola;
  }

  const pon = (nodo, t) => nodo.setAttribute("transform", t);

  function dibujar(pose) {
    caja.style.transform = `translate3d(${f((e.x - 95) * escala)}px,0,0)`;
    pon(el.raiz, `scale(${pose.sx.toFixed(3)},1)`);
    const lean = pose.lean * Math.PI / 180;
    pon(el.torso, `rotate(${f(pose.lean)},${PIVOTE})`);
    const rel = (mundo) => (mundo - e.x) * e.dir;
    // brazos: la muñeca va al punto de agarre (o en el aire, si está columpiándose)
    for (const l of ["n", "f"]) {
      const enAire = pose.manos[l];
      const objetivo = enAire ? [rel(enAire[0]), MUNECA_Y + enAire[1]] : [rel(e.agarre[l]), MUNECA_Y];
      const hombro = girar(HOMBRO[l], lean, PIVOTE);
      const [a1, a2] = ik(hombro, objetivo, LARGO.brazo, LARGO.antebrazo);
      const mano = enAire ? a2 + (-90 - a2) * (1 - enAire[1] / 16) : -90; // al agarrar, el puño apunta al borde
      pon(el["hombro" + l], `translate(${f(hombro[0])},${f(hombro[1])}) rotate(${f(a1)})`);
      pon(el["codo" + l], `translate(${LARGO.brazo},0) rotate(${f(a2 - a1)})`);
      pon(el["muneca" + l], `translate(${LARGO.antebrazo},0) rotate(${f(mano - a2)})`);
    }
    // piernas colgando: se mecen al revés del avance
    const w = pose.onda, amp = pose.piernas;
    const piernas = { n: [78 + 12 * amp * Math.sin(w + Math.PI), 42 + 10 * amp * Math.sin(w + 2), -78], f: [94 + 12 * amp * Math.sin(w), 38 + 10 * amp * Math.sin(w + 0.8), -70] };
    for (const l of ["n", "f"]) {
      const [m, r, p] = piernas[l];
      pon(el["cadera" + l], `translate(${CADERA[l]}) rotate(${f(m - pose.lean)})`);
      pon(el["rodilla" + l], `translate(${LARGO.muslo},0) rotate(${f(r)})`);
      pon(el["tobillo" + l], `translate(${LARGO.pierna},0) rotate(${f(p + 6 * amp * Math.sin(w + 1.5))})`);
    }
    // cabeza, boca y párpados
    pon(el.cabeza, `translate(${CUELLO}) rotate(${f(pose.cabeza)}) scale(1.12)`);
    pon(el.mandibula, `rotate(${f(pose.mandibula)},22,4)`);
    el.boca.setAttribute("opacity", tope(pose.mandibula / 6).toFixed(2));
    el.labios.setAttribute("opacity", (1 - tope(pose.mandibula / 4)).toFixed(2));
    for (const p of el.parpados) p.setAttribute("transform", `scale(1,${pose.parpado.toFixed(2)})`);
    // cola: sale del rabo, baja, sube por detrás y se enrosca en el borde
    const [tx, ty] = pose.cola ? [rel(pose.cola[0]), 6 + pose.cola[1]] : [rel(e.agarre.cola), 6];
    el.cola.setAttribute("d", cola(girar(RABO, lean, PIVOTE), [tx, ty]));
  }

  function cola(b, t) {
    const c1 = [b[0] - 30, b[1] + 36], c2 = [t[0] - 22, t[1] + 62], centro = [];
    for (let i = 0; i <= 26; i++) {
      const u = i / 26, v = 1 - u;
      centro.push([0, 1].map((k) => v * v * v * b[k] + 3 * v * v * u * c1[k] + 3 * v * u * u * c2[k] + u * u * u * t[k]));
    }
    // la punta se enrosca sobre el borde
    centro.push([t[0] + 2, t[1] - 4], [t[0] + 6, t[1] - 5], [t[0] + 9, t[1] - 2], [t[0] + 8.5, t[1] + 2]);
    const n = centro.length, izq = [], der = [];
    for (let i = 0; i < n; i++) {
      const a = centro[Math.max(0, i - 1)], z = centro[Math.min(n - 1, i + 1)];
      let tx = z[0] - a[0], ty = z[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const ancho = 7.5 - 5 * Math.pow(i / (n - 1), 0.8);
      izq.push([centro[i][0] - ty * ancho, centro[i][1] + tx * ancho]);
      der.push([centro[i][0] + ty * ancho, centro[i][1] - tx * ancho]);
    }
    const r0 = azar(77); // misma semilla cada vez: los mechones no titilan
    return borde([...izq, ...der.reverse()], 1.5, r0);
  }

  // ---------- arranque ----------
  colocar(null);
  e.x = e.B = pista[0] + (pista[1] - pista[0]) * 0.35;
  agarrar();
  if (quieto) { dibujar(paso(0)); caja.classList.add("congo--listo"); return; }
  e.espera = 1.5;

  let ultimo = 0, acumulado = 0, activo = false, cuadro = 0;
  function ciclo(ahora) {
    if (!activo) return;
    const dt = Math.min(0.1, (ahora - (ultimo || ahora)) / 1000);
    ultimo = ahora; acumulado += dt;
    const pose = paso(dt);
    if (acumulado >= 1 / 30) { acumulado = 0; dibujar(pose); } // basta con 30 cuadros por segundo
    cuadro = requestAnimationFrame(ciclo);
  }
  const arrancar = () => { if (!activo) { activo = true; ultimo = 0; cuadro = requestAnimationFrame(ciclo); } };
  const parar = () => { activo = false; cancelAnimationFrame(cuadro); };
  new IntersectionObserver(([v]) => (v.isIntersecting ? arrancar() : parar())).observe(portada);
  let espera;
  addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(() => { colocar(); e.modo = "descanso"; e.t = 0; e.espera = 1; }, 200); });
  dibujar(paso(0));
  caja.classList.add("congo--listo");
}
