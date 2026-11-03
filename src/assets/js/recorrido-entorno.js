// Entorno de la maqueta: lo que rodea a la Sede, tomado de Google Maps y dibujado de forma esquemática (barrios,
// naves, potreros, bosque y calles), para que el campus no flote en un zacate vacío.
//
// Coordenadas de la maqueta, en metros: x crece hacia el este y z hacia el sur. El borde del croquis va de
// x = −300 a 264 y de z = −162 a 437; la ruta 32 corre por el norte del campus y la 241 lo rodea por el sur y el este.
// Según Google Maps (norte arriba):
//   norte  → cruzando la ruta 32: Barrio Juan Pablo II, Los Girasoles y la nave de Guaca Repuestos
//   este   → La Colina, donde la ruta 241 sale de la 32 (la nave de techo rojo y su parqueo, Colina Sector Nueve)
//   sur    → Los Almendros, la Escuela Villa Hermosa y, más lejos, Urbanización Atlántida
//   oeste  → por la ruta 32: condominios, Logística Diversificada (LDS) e Isaías Marchena
//
// Para que pese poco: casas, naves y contenedores son instancias (paredes y techos: dos llamadas de dibujo para miles),
// el suelo de los barrios y las calles van cada uno en una sola malla, y el bosque lejano usa copas sencillas.

// ---------- zonas (polígonos [x, z]); «giro» orienta las cuadras de un barrio (radianes, desde el eje x)
const RUTA32_OESTE = -0.316;   // dirección de la ruta 32 al oeste del campus
const RUTA241_ESTE = -0.346;   // dirección de la 241 al este del campus

export const ZONAS = [
  // --- norte
  { nombre: "Barrio Juan Pablo II", tipo: "barrio", densidad: 0.9, giro: -0.08, cuadra: [64, 42],
    borde: [[-40, -1080], [1180, -1080], [1180, -96], [700, -118], [264, -140], [264, -170], [-40, -170]] },
  { nombre: "Guaca Repuestos", tipo: "patio", borde: [[50, -440], [350, -440], [350, -176], [50, -176]],
    naves: [{ p: [115, -228], l: 82, a: 30, alto: 9, giro: -0.08, techo: 0xb9bec2 }, { p: [232, -262], l: 56, a: 42, alto: 8, giro: -0.08, techo: 0xa7aeb4 },
      { p: [305, -212], l: 44, a: 26, alto: 7, giro: -0.08, techo: 0xc9ccce }, { p: [160, -335], l: 64, a: 22, alto: 6, giro: -0.08, techo: 0x8f979e }],
    contenedores: { de: [205, -420], a: [335, -365], n: 22 } },
  { nombre: "Lote en construcción", tipo: "tierra", borde: [[262, -690], [470, -690], [470, -520], [262, -520]] },
  { nombre: "Bosque al noroeste", tipo: "bosque", borde: [[-1250, -1080], [-40, -1080], [-40, -170], [-300, -170], [-300, -82], [-1250, 226]] },
  { nombre: "Casas al noroeste", tipo: "barrio", densidad: 0.55, giro: 0.2, cuadra: [58, 40],
    borde: [[-1250, -1080], [-480, -1080], [-480, -790], [-1250, -790]] },
  { nombre: "Casas junto a la ruta 32 (oeste)", tipo: "barrio", densidad: 0.6, giro: RUTA32_OESTE, cuadra: [50, 36],
    borde: [[-1080, -400], [-840, -400], [-840, 118], [-1080, 196]] },
  // --- este
  { nombre: "La Colina", tipo: "barrio", densidad: 0.95, giro: RUTA241_ESTE, cuadra: [60, 38],
    borde: [[272, -130], [1180, -88], [1180, 330], [760, 300], [760, 170], [272, 150]] },
  { nombre: "Nave de techo rojo", tipo: "patio", borde: [[498, -116], [700, -116], [700, -28], [498, -28]],
    naves: [{ p: [556, -70], l: 70, a: 36, alto: 10, giro: -0.17, techo: 0xc65a3e }] },
  { nombre: "Colina Sector Nueve", tipo: "barrio", densidad: 0.6, giro: -0.5, cuadra: [62, 44],
    borde: [[760, 170], [1180, 330], [1180, 900], [760, 900]] },
  { nombre: "Bosque al sureste", tipo: "bosque", borde: [[272, 150], [760, 170], [760, 900], [272, 900]] },
  { nombre: "Potrero", tipo: "potrero", borde: [[330, 250], [610, 240], [630, 430], [340, 440]] },
  { nombre: "Urbanización Atlántida", tipo: "barrio", densidad: 0.75, giro: -0.45, cuadra: [56, 40],
    borde: [[650, 900], [1180, 900], [1180, 1260], [650, 1260]] },
  // --- sur
  { nombre: "Bosque al sur", tipo: "bosque", borde: [[-1250, 600], [-700, 600], [-700, 445], [272, 445], [272, 1300], [-1250, 1300]] },
  { nombre: "Los Almendros", tipo: "barrio", densidad: 0.45, giro: 0.7, cuadra: [70, 50],
    borde: [[-470, 470], [-130, 470], [-60, 640], [-200, 790], [-490, 770]] },
  { nombre: "Camino a Atlántida", tipo: "barrio", densidad: 0.45, giro: 0.35, cuadra: [70, 50],
    borde: [[-210, 880], [140, 880], [140, 1110], [-210, 1110]] },
  { nombre: "Escuela Villa Hermosa", tipo: "patio", borde: [[-690, 815], [-570, 815], [-570, 935], [-690, 935]],
    naves: [{ p: [-640, 845], l: 46, a: 12, alto: 4, giro: 0.6, techo: 0x6d8fb3, pared: 0xf2ead8 },
      { p: [-625, 875], l: 46, a: 12, alto: 4, giro: 0.6, techo: 0x6d8fb3, pared: 0xf2ead8 },
      { p: [-610, 905], l: 30, a: 10, alto: 4, giro: 0.6, techo: 0x8f979e, pared: 0xf2ead8 }] },
  // --- oeste
  { nombre: "Bosque al suroeste", tipo: "bosque", borde: [[-300, -60], [-300, 445], [-700, 445], [-700, 600], [-1250, 600], [-1250, 226]] },
  { nombre: "Condominios", tipo: "barrio", densidad: 1, giro: RUTA32_OESTE, cuadra: [36, 26],
    borde: [[-400, -16], [-660, 69], [-660, 172], [-400, 88]] },
  { nombre: "Logística Diversificada (LDS)", tipo: "patio", borde: [[-1260, 214], [-950, 112], [-950, 340], [-1260, 430]],
    naves: [{ p: [-1010, 168], l: 92, a: 40, alto: 11, giro: RUTA32_OESTE, techo: 0xe3e5e6 }, { p: [-1112, 205], l: 72, a: 36, alto: 10, giro: RUTA32_OESTE, techo: 0xdfe2e4 },
      { p: [-1205, 245], l: 58, a: 30, alto: 9, giro: RUTA32_OESTE, techo: 0xcfd3d6 }, { p: [-1060, 285], l: 80, a: 30, alto: 9, giro: RUTA32_OESTE, techo: 0xd6d9db }],
    contenedores: { de: [-1220, 300], a: [-1110, 360], n: 36 } },
  { nombre: "Isaías Marchena", tipo: "barrio", densidad: 0.7, giro: RUTA32_OESTE, cuadra: [54, 38],
    borde: [[-1100, 380], [-760, 300], [-760, 560], [-1100, 640]] },
];

// Calles de afuera que no salen del croquis: [puntos], ancho en metros
const CALLES = [
  { puntos: [[520, 3], [560, 150], [700, 300], [950, 420], [1250, 520]], ancho: 7 },            // hacia Colina Sector Nueve
  { puntos: [[-345, 522], [-200, 640], [-60, 800], [30, 950], [250, 1050], [700, 1010], [1250, 1040]], ancho: 7 },   // Los Almendros → Atlántida
  { puntos: [[-1078, 192], [-1060, 420], [-1040, 700]], ancho: 7 },                              // acceso a LDS
];
// La 241 no sigue recta al salir por la esquina suroeste: baja hacia Los Almendros y la Escuela Villa Hermosa
const RUMBOS = [{ cerca: [-264, 437], por: [[-310, 478], [-385, 560], [-480, 690], [-607, 846], [-700, 1000], [-820, 1300], [-1000, 1900]] }];

// ---------- colores
const SUELO = { barrio: 0xa9b591, patio: 0xa3a6a8, tierra: 0xb49c74, bosque: 0x6f9a55, potrero: 0xa8c97e };
const CAPA = { bosque: 1, potrero: 2, barrio: 2, tierra: 3, patio: 3 };   // las zonas de encima tapan a las de abajo
const PAREDES = [0xefe7d6, 0xf1d9b5, 0xcfe0e8, 0xe9c7c0, 0xf3f0e8, 0xd9e6c8, 0xf4e3a6, 0xd7d3e8];
const TECHOS = [0x8f979e, 0x9aa1a6, 0xb4553f, 0xc46a4a, 0x5f7f99, 0xd8d8d2, 0x5c8a6a, 0x7d858c];
const CONTENEDORES = [0x2f6fa8, 0xb8412e, 0xe9ecee, 0x3f8a5a, 0xd99a2b];
const TONOS_BOSQUE = [0x3f7d34, 0x356f2e, 0x467f36, 0x2f6a2c, 0x4f8f3a];

// ---------- geometría plana
function dentro([x, z], poli) {
  let si = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, zi] = poli[i], [xj, zj] = poli[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) si = !si;
  }
  return si;
}
function distSegmento([x, z], [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}
const distLinea = (p, puntos) => { let d = Infinity; for (let i = 1; i < puntos.length; i++) d = Math.min(d, distSegmento(p, puntos[i - 1], puntos[i])); return d; };
// tramos [t0, t1] de un segmento p0→p1 que quedan dentro del polígono
function recortar(p0, p1, poli) {
  const ts = [0, 1];
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [x1, z1] = poli[j], [x2, z2] = poli[i];
    const d = (p1[0] - p0[0]) * (z2 - z1) - (p1[1] - p0[1]) * (x2 - x1);
    if (Math.abs(d) < 1e-9) continue;
    const t = ((x1 - p0[0]) * (z2 - z1) - (z1 - p0[1]) * (x2 - x1)) / d;
    const u = ((x1 - p0[0]) * (p1[1] - p0[1]) - (z1 - p0[1]) * (p1[0] - p0[0])) / d;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  const tramos = [];
  for (let i = 1; i < ts.length; i++) {
    const m = (ts[i - 1] + ts[i]) / 2;
    if (dentro([p0[0] + (p1[0] - p0[0]) * m, p0[1] + (p1[1] - p0[1]) * m], poli)) tramos.push([ts[i - 1], ts[i]]);
  }
  return tramos;
}
// cruce de dos segmentos: t sobre el primero, o null
function cruce(a, b, c, d) {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
}

export function armarEntorno({ THREE, escena, datos, liviano }) {
  const t = datos.campus.terreno, x0 = t.x, x1 = t.x + t.ancho, z0 = t.z, z1 = t.z + t.largo;
  const enCroquis = ([x, z], m = 0) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m;
  const aCroquis = ([x, z]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
  let semilla = 11;
  const rnd = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
  const elegir = (lista) => lista[Math.floor(rnd() * lista.length)];
  const L = 4000;

  // ---------- zacate hasta el horizonte (la niebla lo funde con el cielo): cuatro piezas que tocan el borde del croquis
  const zacate = new THREE.MeshLambertMaterial({ color: 0x98c47a });   // el mismo verde de los bordes de la textura
  const pieza = (xa, xb, za, zb) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa, zb - za), zacate);
    m.rotation.x = -Math.PI / 2; m.position.set((xa + xb) / 2, 0, (za + zb) / 2); m.receiveShadow = true; escena.add(m);
  };
  pieza(x0 - L, x1 + L, z0 - L, z0); pieza(x0 - L, x1 + L, z1, z1 + L); pieza(x0 - L, x0, z0, z1); pieza(x1, x1 + L, z0, z1);

  // ---------- carreteras que salen del croquis
  // Arrancan del tramo exacto donde la textura corta la calle y a los 30 m quedan de su ancho. Una que llega a otra
  // más al norte termina ahí (la 241 se une a la ruta 32 en La Colina) y la 241 del suroeste sigue su rumbo real.
  const carreteras = (datos.campus.salidas || []).map((s) => {
    const [ax, az] = s.a, [bx, bz] = s.b, [dx, dz] = s.dir, nx = -dz, nz = dx;
    const c = [(ax + bx) / 2, (az + bz) / 2];
    const ancho = Math.max(Math.min(Math.abs((bx - ax) * nx + (bz - az) * nz), 10), 7);
    const rumbo = RUMBOS.find((r) => Math.hypot(r.cerca[0] - c[0], r.cerca[1] - c[1]) < 80);
    const puntos = [c, [c[0] + dx * 30, c[1] + dz * 30], ...(rumbo ? rumbo.por : [[c[0] + dx * L, c[1] + dz * L]])];
    return { s, c, ancho, puntos };
  });
  for (const r of carreteras) {
    for (const o of carreteras) {
      if (o === r || o.c[1] >= r.c[1]) continue;   // solo termina en una que va más al norte
      for (let i = 1; i < r.puntos.length; i++) {
        let corte = null;
        for (let k = 1; k < o.puntos.length && corte === null; k++) corte = cruce(r.puntos[i - 1], r.puntos[i], o.puntos[k - 1], o.puntos[k]);
        if (corte !== null) {
          const a = r.puntos[i - 1], b = r.puntos[i];
          r.puntos = [...r.puntos.slice(0, i), [a[0] + (b[0] - a[0]) * corte, a[1] + (b[1] - a[1]) * corte]];
          break;
        }
      }
    }
  }
  const vias = [...carreteras.map((r) => ({ puntos: r.puntos, ancho: r.ancho })), ...CALLES];
  const cercaDeVia = (p, margen) => vias.some((v) => distLinea(p, v.puntos) < v.ancho / 2 + margen);

  // tiras de asfalto: una sola malla para todas las calles y carreteras de afuera
  const asf = [], asfColor = [], tonoAsfalto = new THREE.Color();
  const tri = (a, b, c) => { asf.push(a[0], 0, a[1], b[0], 0, b[1], c[0], 0, c[1]); for (let k = 0; k < 3; k++) asfColor.push(tonoAsfalto.r, tonoAsfalto.g, tonoAsfalto.b); };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  const tira = (puntos, ancho) => {
    for (let i = 1; i < puntos.length; i++) {
      const [ax, az] = puntos[i - 1], [bx, bz] = puntos[i], l = Math.hypot(bx - ax, bz - az) || 1;
      const ux = (bx - ax) / l, uz = (bz - az) / l, nx = -uz * ancho / 2, nz = ux * ancho / 2, e = ancho / 2;   // se alarga medio ancho para tapar las uniones
      const A = [ax - ux * e, az - uz * e], B = [bx + ux * e, bz + uz * e];
      quad([A[0] + nx, A[1] + nz], [B[0] + nx, B[1] + nz], [B[0] - nx, B[1] - nz], [A[0] - nx, A[1] - nz]);
    }
  };
  tonoAsfalto.setHex(0x70747a);   // carreteras: el gris de la textura
  for (const r of carreteras) {
    const { s, c, ancho, puntos } = r, [dx, dz] = s.dir, nx = -dz, nz = dx, medio = ancho / 2;
    // arranque: del tramo cortado por el borde al ancho de la calle, en 30 m
    let [a, b] = [s.a, s.b];
    if ((b[0] - c[0]) * nx + (b[1] - c[1]) * nz < 0) [a, b] = [b, a];
    const p30 = puntos[1];
    quad(a, b, [p30[0] + nx * medio, p30[1] + nz * medio], [p30[0] - nx * medio, p30[1] - nz * medio]);
    tira(puntos.slice(1), ancho);
  }
  tonoAsfalto.setHex(0x80848a);   // calles de barrio: un gris más claro
  for (const v of CALLES) tira(v.puntos, v.ancho);

  // ---------- suelo de cada zona (barrio, patio, bosque…), en una malla con colores por vértice
  const sue = [], col = [], cc = new THREE.Color();
  const capaDe = (z) => CAPA[z.tipo] || 1;
  for (const z of ZONAS) {
    const contorno = z.borde.map(([x, y]) => new THREE.Vector2(x, y));
    const caras = THREE.ShapeUtils.triangulateShape(contorno, []);
    cc.setHex(SUELO[z.tipo]);
    const y = capaDe(z) * 0.02;   // separadas un poco y con polygonOffset: no titilan al alejarse
    for (const f of caras) for (const k of f) { sue.push(z.borde[k][0], y, z.borde[k][1]); col.push(cc.r, cc.g, cc.b); }
  }
  // Todos los triángulos de cara hacia arriba (vistos desde arriba, en sentido antihorario): si alguno queda al
  // revés, la luz lo trata como visto por debajo y sale casi negro.
  const orientar = (arr, colores) => {
    for (let i = 0; i < arr.length; i += 9) {
      const abx = arr[i + 3] - arr[i], abz = arr[i + 5] - arr[i + 2], acx = arr[i + 6] - arr[i], acz = arr[i + 8] - arr[i + 2];
      if (abz * acx - abx * acz < 0) {
        for (let k = 0; k < 3; k++) { [arr[i + 3 + k], arr[i + 6 + k]] = [arr[i + 6 + k], arr[i + 3 + k]]; if (colores) [colores[i + 3 + k], colores[i + 6 + k]] = [colores[i + 6 + k], colores[i + 3 + k]]; }
      }
    }
  };
  const plano = (arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    const n = new Float32Array(arr.length); for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute("normal", new THREE.BufferAttribute(n, 3));
    return g;
  };
  orientar(sue, col);
  const gs = plano(sue); gs.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const suelo = new THREE.Mesh(gs, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  escena.add(suelo);   // sin sombras, igual que el asfalto

  // ---------- casas, naves y contenedores (instancias)
  const casas = [];   // { x, z, giro, ancho, largo, alto, techo (alto del techo), cPared, cTecho, plano }
  const zonaDe = (p) => { let mejor = null; for (const z of ZONAS) if (dentro(p, z.borde) && (!mejor || capaDe(z) >= capaDe(mejor))) mejor = z; return mejor; };
  const metaCasas = liviano ? 1400 : 2700, metaArbolesBarrio = liviano ? 260 : 520;
  const calles = [], arbolesBarrio = [];
  for (const z of ZONAS) {
    if (z.tipo !== "barrio") continue;
    const [A, B] = z.cuadra, ux = Math.cos(z.giro), uz = Math.sin(z.giro), vx = -uz, vz = ux;
    // rejilla de calles en el marco de la zona
    const us = z.borde.map(([x, y]) => x * ux + y * uz), vs = z.borde.map(([x, y]) => x * vx + y * vz);
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    const aMundo = (u, v) => [u * ux + v * vx, u * uz + v * vz];
    const fase = rnd();
    // las calles no cruzan los patios, lotes ni otras zonas que quedan encima del barrio
    const encima = ZONAS.filter((o) => o !== z && capaDe(o) > capaDe(z));
    const agregar = (p0, p1) => {
      for (let [ta, tb] of recortar(p0, p1, z.borde)) {
        let tramos = [[ta, tb]];
        for (const o of encima) {
          const fuera = [];
          for (const [a0, a1] of tramos) {
            const q0 = [p0[0] + (p1[0] - p0[0]) * a0, p0[1] + (p1[1] - p0[1]) * a0], q1 = [p0[0] + (p1[0] - p0[0]) * a1, p0[1] + (p1[1] - p0[1]) * a1];
            let ini = 0;
            for (const [b0, b1] of recortar(q0, q1, o.borde)) { if (b0 > ini) fuera.push([a0 + (a1 - a0) * ini, a0 + (a1 - a0) * b0]); ini = b1; }
            if (ini < 1) fuera.push([a0 + (a1 - a0) * ini, a1]);
          }
          tramos = fuera;
        }
        for (const [a0, a1] of tramos) if ((a1 - a0) * Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 8)
          calles.push([[p0[0] + (p1[0] - p0[0]) * a0, p0[1] + (p1[1] - p0[1]) * a0], [p0[0] + (p1[0] - p0[0]) * a1, p0[1] + (p1[1] - p0[1]) * a1]]);
      }
    };
    for (let u = Math.floor(u0 / A) * A + fase * A; u <= u1; u += A) agregar(aMundo(u, v0 - 1), aMundo(u, v1 + 1));
    for (let v = Math.floor(v0 / B) * B + fase * B; v <= v1; v += B) agregar(aMundo(u0 - 1, v), aMundo(u1 + 1, v));
    // lotes: dos filas por cuadra, de frente a la calle
    const ANCHO_CALLE = 5.5;
    for (let u = Math.floor(u0 / A) * A + fase * A; u < u1; u += A) {
      for (let v = Math.floor(v0 / B) * B + fase * B; v < v1; v += B) {
        const fondo = (B - ANCHO_CALLE) / 2;
        for (const fila of [0, 1]) {
          for (let k = u + ANCHO_CALLE / 2 + 1; k + 9 < u + A - ANCHO_CALLE / 2; k += 9 + rnd() * 4) {
            const ancho = 6.5 + rnd() * 2.5, largo = Math.min(fondo - 2, 7 + rnd() * 3);
            const vv = fila ? v + B - ANCHO_CALLE / 2 - 1.5 - largo / 2 : v + ANCHO_CALLE / 2 + 1.5 + largo / 2;
            const p = aMundo(k + ancho / 2, vv);
            if (!dentro(p, z.borde) || enCroquis(p, 6) || zonaDe(p) !== z || cercaDeVia(p, 7)) continue;
            const d = aCroquis(p);
            if (rnd() > z.densidad * Math.exp(-d / 700)) continue;
            if (rnd() < 0.1) { arbolesBarrio.push({ p, r: 2.4 + rnd() * 1.8, palma: rnd() < 0.25 }); continue; }
            const dos = rnd() < 0.12;
            casas.push({ x: p[0], z: p[1], giro: z.giro + (rnd() - 0.5) * 0.06, ancho, largo, alto: dos ? 5.6 : 2.8 + rnd() * 0.6,
              techo: 1 + rnd() * 0.6, cPared: elegir(PAREDES), cTecho: elegir(TECHOS), plano: rnd() < 0.15, d });
          }
        }
      }
    }
  }
  // si sobran casas para el límite, se quedan las más cercanas al campus (las lejanas casi no se ven por la niebla)
  casas.sort((a, b) => a.d - b.d);
  casas.length = Math.min(casas.length, metaCasas);
  arbolesBarrio.length = Math.min(arbolesBarrio.length, metaArbolesBarrio);
  for (const [a, b] of calles) tira([a, b], 5.5);

  const naves = [];   // mismo formato que las casas
  for (const z of ZONAS) {
    for (const n of z.naves || []) naves.push({ x: n.p[0], z: n.p[1], giro: n.giro, ancho: n.l, largo: n.a, alto: n.alto, techo: Math.max(1.5, n.a * 0.08),
      cPared: n.pared || 0xdde0e2, cTecho: n.techo, plano: false });
    if (z.contenedores) {
      const { de, a, n } = z.contenedores;
      for (let i = 0; i < n; i++) {
        const fila = i % 6, col_ = Math.floor(i / 6), cols = Math.ceil(n / 6);
        const x = de[0] + (a[0] - de[0]) * (col_ + 0.5) / cols, y = de[1] + (a[1] - de[1]) * (fila + 0.5) / 6;
        naves.push({ x, z: y, giro: z.naves?.[0]?.giro || 0, ancho: 12, largo: 2.4, alto: 2.6 * (rnd() < 0.3 ? 2 : 1), techo: 0, cPared: elegir(CONTENEDORES), plano: true });
      }
    }
  }
  const todas = [...casas, ...naves];
  if (todas.length) {
    const caja = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    // techo a dos aguas de 1 × 1 × 1: la cumbrera corre a lo largo de x
    const techo = new THREE.BufferGeometry();
    const v = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5, 1, 0], [0.5, 1, 0]];
    const caras = [[0, 4, 5], [0, 5, 1], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 5, 2]];
    techo.setAttribute("position", new THREE.Float32BufferAttribute(caras.flat().flatMap((i) => v[i]), 3));
    techo.computeVertexNormals();
    const paredes = new THREE.InstancedMesh(caja, new THREE.MeshLambertMaterial(), todas.length);
    const conTecho = todas.filter((c) => c.techo > 0);
    const techos = new THREE.InstancedMesh(techo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), conTecho.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), esc = new THREE.Vector3(), c = new THREE.Color();
    todas.forEach((k, i) => {
      q.setFromAxisAngle(eje, -k.giro);
      paredes.setMatrixAt(i, m4.compose(pos.set(k.x, 0, k.z), q, esc.set(k.ancho, k.alto, k.largo)));
      paredes.setColorAt(i, c.setHex(k.cPared));
    });
    conTecho.forEach((k, i) => {
      q.setFromAxisAngle(eje, -k.giro);
      const alto = k.plano ? 0.25 : k.techo;
      techos.setMatrixAt(i, m4.compose(pos.set(k.x, k.alto, k.z), q, esc.set(k.ancho + 0.8, alto, k.largo + 0.8)));
      techos.setColorAt(i, c.setHex(k.cTecho));
    });
    for (const m of [paredes, techos]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; escena.add(m); }
  }

  if (asf.length) {
    orientar(asf, asfColor);
    const g = plano(asf); g.setAttribute("color", new THREE.Float32BufferAttribute(asfColor, 3));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -5 }));
    m.position.y = 0.1;   // sin sombras: casi todo queda fuera del alcance de las sombras y, cerca del borde, salían rayas
    escena.add(m);
  }

  // ---------- árboles
  // cerca del campus: sueltos en el zacate, con los mismos árboles detallados de la maqueta; en los bosques, copas
  // sencillas y tupidas (son cientos y casi siempre se ven de lejos)
  const arboles = [...arbolesBarrio];
  const metaSueltos = liviano ? 200 : 360;
  for (let i = 0, n = 0; n < metaSueltos && i < metaSueltos * 40; i++) {
    const p = [x0 - 420 + rnd() * (t.ancho + 840), z0 - 420 + rnd() * (t.largo + 840)], d = aCroquis(p);
    if (d < 4 || rnd() > Math.exp(-d / 140) || zonaDe(p) || cercaDeVia(p, 6)) continue;
    arboles.push({ p, r: 2.6 + rnd() * 2.4, palma: rnd() < 0.15 }); n++;
  }
  const bosque = [], metaBosque = liviano ? 800 : 1600;
  const zonasBosque = ZONAS.filter((z) => z.tipo === "bosque");
  for (let i = 0; bosque.length < metaBosque && i < metaBosque * 30; i++) {
    const p = [x0 - 950 + rnd() * (t.ancho + 1900), z0 - 950 + rnd() * (t.largo + 1900)];
    const z = zonaDe(p);
    if (!z || z.tipo !== "bosque" || !zonasBosque.includes(z) || enCroquis(p, 4) || cercaDeVia(p, 5)) continue;
    if (rnd() > Math.exp(-aCroquis(p) / 520)) continue;
    bosque.push({ p, r: 4 + rnd() * 3.5, tono: elegir(TONOS_BOSQUE) });
  }
  if (bosque.length) {
    const copas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), bosque.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), esc = new THREE.Vector3(), c = new THREE.Color(), e = new THREE.Euler();
    bosque.forEach((a, i) => {
      q.setFromEuler(e.set(0, rnd() * 6.28, 0));
      copas.setMatrixAt(i, m4.compose(pos.set(a.p[0], a.r * 1.3, a.p[1]), q, esc.set(a.r, a.r * 0.9, a.r)));
      copas.setColorAt(i, c.setHex(a.tono));
    });
    copas.instanceMatrix.needsUpdate = true; copas.instanceColor.needsUpdate = true; escena.add(copas);
  }
  return { arboles };
}
