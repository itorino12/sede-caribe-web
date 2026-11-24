// Maqueta 3D del campus (three.js). Los datos salen del croquis oficial y de la pestaña «lugares».
// Se dibuja solo cuando algo cambia (girar, acercar, elegir un edificio), para no gastar batería.
import * as THREE from "./vendor/three.module.min.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { ficha, sinMovimiento, rellenarFicha } from "./recorrido-ficha.js";
import { MARCAS, prioridadDe, compararRango, FRENTE_PORTADA, CONGOS } from "./recorrido-config.js";
import { armarEntorno } from "./recorrido-entorno.js";

const raiz = document.querySelector("[data-recorrido]");
const lienzo = raiz.querySelector(".mapa3d__lienzo");
const capaMarcas = raiz.querySelector(".mapa3d__marcas");
// En la portada la maqueta gira sola, sin números ni fichas, y al tocarla abre el recorrido
const PORTADA = raiz.dataset.portada !== undefined;
// el recorrido trae los datos en la página; la portada los pide aparte, después de cargar
const enPagina = document.getElementById("datos-campus");
const datos = enPagina ? JSON.parse(enPagina.textContent) : await fetch(raiz.dataset.datos).then((r) => r.json());
const lugares = new Map(datos.lugares.map((l) => [l.id, l]));
const N = datos.campus.numeros;   // números de los lugares que se arman aparte (pista, portones, puente…)

// ---------- escena
// Se intenta con calidad alta y, si el teléfono no lo permite, con opciones más livianas.
// Si no hay 3D, queda la imagen fija de la maqueta y la lista de lugares.
// En teléfonos la maqueta va en modo liviano: sin suavizado de bordes, menos resolución y sombras más
// simples. Algunos chips (por ejemplo PowerVR) pierden el contexto gráfico con la versión completa.
const liviano = matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 820;
// En la portada no se acepta un 3D sin aceleración gráfica (iría a saltos y calentaría el teléfono): ahí van las
// vistas de respaldo. Las herramientas que dibujan las capturas (#captura-…) sí lo usan.
const CAPTURA = location.hash.startsWith("#captura-");
const exigente = PORTADA && !CAPTURA;
function crearRenderer() {
  for (const opciones of [...(liviano ? [] : [{ antialias: true, alpha: true }]), { antialias: false, alpha: true, powerPreference: "low-power" }, { antialias: false, alpha: false, powerPreference: "low-power", precision: "mediump" }]) {
    try { return new THREE.WebGLRenderer({ canvas: lienzo, failIfMajorPerformanceCaveat: exigente, ...opciones }); }
    catch (e) { console.warn("Maqueta 3D: no se pudo iniciar con", opciones, e); }
  }
  return null;
}
const renderer = crearRenderer();
if (!renderer) {
  raiz.classList.add("mapa3d--sin-3d");
  const nota = raiz.querySelector(".mapa3d__nota");
  if (nota) nota.textContent = "Este navegador no permitió abrir la maqueta 3D (WebGL); se muestra la versión sin 3D.";
  // maqueta giratoria con imágenes (pesa poco y funciona en cualquier teléfono); en la portada, vistas que giran solas
  import(PORTADA ? "./portada-giro.js" : "./recorrido-giro.js");
}
if (renderer) {   // ---------- todo lo que sigue es la maqueta 3D
lienzo.addEventListener("webglcontextlost", (e) => { e.preventDefault(); raiz.classList.add("mapa3d--sin-3d"); raiz.closest(".portada__foto")?.classList.remove("portada__foto--en-vivo"); import(PORTADA ? "./portada-giro.js" : "./recorrido-giro.js"); });
// la portada es de adorno: en celular basta un poco menos de resolución que en el recorrido
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, liviano ? (PORTADA ? 1.25 : 1.5) : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
// ni el sol ni los edificios se mueven: las sombras se calculan una vez y no en cada cuadro (es la mitad del trabajo)
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.shadowMap.type = liviano ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
const escena = new THREE.Scene();
escena.fog = new THREE.Fog(0xdfeaf2, 520, 1100);
const camara = new THREE.PerspectiveCamera(38, 1, 1, 3000);

escena.add(new THREE.HemisphereLight(0xf4f8ff, 0x6d8a5a, 1.45));
const sol = new THREE.DirectionalLight(0xfff4e0, 2.1);
sol.position.set(-160, 260, -120);
sol.castShadow = true;
sol.shadow.mapSize.set(liviano ? 1024 : 2048, liviano ? 1024 : 2048);
Object.assign(sol.shadow.camera, { left: -260, right: 260, top: 260, bottom: -260, near: 50, far: 800 });
sol.shadow.bias = -0.0005;
escena.add(sol);

// Terreno con la textura generada del croquis (zacate, calles, carretera y pista), con el relieve del plano de
// conjunto de la OEPI: una malla de alturas en decímetros (herramientas/relieve.py). Fuera de ella, y en su borde,
// la altura es cero, como el entorno.
const t = datos.campus.terreno;
const relieve = (() => {
  const r = datos.campus.relieve;
  if (!r) return null;
  const bytes = atob(r.datos), h = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) h[i] = ((bytes.charCodeAt(i) << 24) >> 24) * r.unidad;   // byte con signo
  return { ...r, h };
})();
// altura del terreno (m) en un punto; «asentar» empareja después la malla bajo los lugares que se suben enteros
function alturaEn(x, z) {
  const r = relieve;
  if (!r) return 0;
  const fx = (x - r.x) / r.paso, fz = (z - r.z) / r.paso;
  if (!(fx >= 0 && fz >= 0 && fx <= r.nx - 1 && fz <= r.nz - 1)) return 0;
  const i = Math.min(Math.floor(fx), r.nx - 2), j = Math.min(Math.floor(fz), r.nz - 2), u = fx - i, v = fz - j, k = j * r.nx + i, h = r.h;
  return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + r.nx] * (1 - u) + h[k + r.nx + 1] * u) * v;
}
const textura = new THREE.TextureLoader().load(raiz.dataset.suelo, pedirDibujo);
textura.colorSpace = THREE.SRGBColorSpace;
textura.anisotropy = 4;
const sueloGeo = (() => {
  const paso = relieve ? relieve.paso * (liviano ? 2 : 1) : t.ancho;
  const g = new THREE.PlaneGeometry(t.ancho, t.largo, Math.max(1, Math.round(t.ancho / paso)), Math.max(1, Math.round(t.largo / paso)));
  g.rotateX(-Math.PI / 2);
  g.translate(t.x + t.ancho / 2, 0, t.z + t.largo / 2);
  return g;
})();
function levantarSuelo() {   // se llama de nuevo cuando «asentar» empareja el terreno
  const pos = sueloGeo.attributes.position, r = relieve;
  // en celular y tableta la malla del suelo va cada 2 celdas del relieve: entre un vértice alto junto al camino y
  // otro sobre el camino, el zacate se asomaba por encima del piso de los pasillos (fotos de la Sede, nov. 2026).
  // Cada vértice que queda a una celda gruesa del piso de un pasillo o acera (r.bajo) baja hasta su rasante
  const cerca = r && r.bajo && liviano ? 2 : 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = alturaEn(x, z);
    if (cerca) {
      const i0 = Math.round((x - r.x) / r.paso), j0 = Math.round((z - r.z) / r.paso);
      for (let j = j0 - cerca; j <= j0 + cerca; j++) for (let k = i0 - cerca; k <= i0 + cerca; k++) {
        if (j < 0 || k < 0 || j >= r.nz || k >= r.nx) continue;
        const c = j * r.nx + k;
        if (r.bajo[c] && r.h[c] < h) h = r.h[c];
      }
    }
    pos.setY(i, h);
  }
  pos.needsUpdate = true;
  sueloGeo.computeVertexNormals(); sueloGeo.computeBoundingBox(); sueloGeo.computeBoundingSphere();
}
levantarSuelo();
// el suelo cede ante lo que va encima casi a ras (losas, aceras, rayas): sin parpadeo ni zacate asomándose
const suelo = new THREE.Mesh(sueloGeo, new THREE.MeshLambertMaterial({ map: textura, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 6 }));
suelo.receiveShadow = true;
escena.add(suelo);
// Alrededor del croquis: zacate hasta el horizonte, las carreteras que siguen y los barrios, naves y bosques de
// los alrededores según Google Maps (recorrido-entorno.js)
const entorno = armarEntorno({ THREE, escena, datos, liviano });
const inicioCampus = escena.children.length;   // lo que se agregue de aquí en adelante se asienta sobre el relieve

// ---------- edificios
// Estilo tomado de las fotos de la Sede: paredes blancas, celosías grises en las ventanas y techos de cuatro
// aguas gris verdoso con aleros anchos (las residencias llevan además una linternilla con su propio techo).
const colores = { pared: 0xfbfaf6, techo: 0x66756b, losa: 0xe3e6ea, celosia: 0x7d858c, elegido: 0x005da4, paredElegida: 0xeaf2f9 };
// La maqueta exagera un poco las alturas para que los edificios se lean desde arriba
const EXAGERAR = 1.4;
const edificios = [];
let grupoCongos = null;   // los congos se tocan aparte de los edificios
const congosVivos = [], centroCongos = new THREE.Vector3();
function prisma(contorno, alto, desde, material, crecer = 0) {
  const cx = contorno.reduce((s, p) => s + p[0], 0) / contorno.length;
  const cz = contorno.reduce((s, p) => s + p[1], 0) / contorno.length;
  const sh = new THREE.Shape();
  contorno.forEach(([x, z], i) => {
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1;
    const px = x + (dx / d) * crecer, pz = z + (dz / d) * crecer;
    i ? sh.lineTo(px, -pz) : sh.moveTo(px, -pz);
  });
  const g = new THREE.ExtrudeGeometry(sh, { depth: alto, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, desde, 0);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function techo(triangulos, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(triangulos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const celosia = new THREE.MeshStandardMaterial({ color: colores.celosia, roughness: 0.7 });
const losa = new THREE.MeshStandardMaterial({ color: colores.losa });

const vidrio = new THREE.MeshStandardMaterial({ color: 0x33424f, roughness: 0.2, metalness: 0.3 });
const celeste = new THREE.MeshStandardMaterial({ color: 0x9fd2ee, roughness: 0.8 });
const vidrioVerde = new THREE.MeshStandardMaterial({ color: 0x2f7d76, roughness: 0.15, metalness: 0.35 });
const acero = new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.6, metalness: 0.3 });
const parasol = new THREE.MeshStandardMaterial({ color: 0xf2f3f4, roughness: 0.5, side: THREE.DoubleSide });

// Mural de colores inventado (manchas y figuras: sugiere un mural, no copia ninguno)
function texturaMuralEd(semilla, fondo = "#e9dcc0") {
  const az = (i) => { const v = Math.sin(i * 53.3) * 43758.5; return v - Math.floor(v); };
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 192;
  const x = cv.getContext("2d"); x.fillStyle = fondo; x.fillRect(0, 0, 512, 192);
  const tonos = ["#1f7a8c", "#e07a2e", "#2f8f4e", "#c23b3b", "#f2c230", "#5a3e8c", "#3d8fd6", "#8a5a3c", "#f08fb0"];
  for (let k = 0; k < 70; k++) {
    const a = az(semilla + k), b = az(semilla + k * 7 + 3), c = az(semilla + k * 13 + 5);
    x.fillStyle = tonos[Math.floor(c * tonos.length)];
    x.beginPath(); x.ellipse(a * 512, b * 192, 8 + c * 34, 6 + a * 22, b * 3, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Desplaza un contorno convexo d metros hacia afuera (cada lado paralelo a sí mismo)
function desplazar(c, d) {
  const n = c.length, sal = [];
  const cx = c.reduce((s, p) => s + p[0], 0) / n, cz = c.reduce((s, p) => s + p[1], 0) / n;
  const normal = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; } return [nx, nz]; };
  for (let i = 0; i < n; i++) {
    const p0 = c[(i + n - 1) % n], p1 = c[i], p2 = c[(i + 1) % n];
    const [ax, az] = normal(p0, p1), [bx, bz] = normal(p1, p2);
    const mx = ax + bx, mz = az + bz, k = d / Math.max(0.3, (mx * ax + mz * az) / Math.hypot(mx, mz)) / (Math.hypot(mx, mz) || 1);
    sal.push([p1[0] + mx * k, p1[1] + mz * k]);
  }
  return sal;
}
// Fachada principal de un volumen: el lado largo que mira al sur (hacia donde se ve la maqueta)
function fachadaSur(contorno, frente = [0, 1]) {   // frente: hacia dónde debe mirar la fachada (por defecto, al sur)
  const cx = contorno.reduce((s, p) => s + p[0], 0) / contorno.length, cz = contorno.reduce((s, p) => s + p[1], 0) / contorno.length;
  let mejor = null;
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i], b = contorno[(i + 1) % contorno.length];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / largo, nz = (b[0] - a[0]) / largo;
    if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
    const puntaje = largo * (0.6 + nx * frente[0] + nz * frente[1]);
    if (!mejor || puntaje > mejor.puntaje) mejor = { a, b, largo, nx, nz, puntaje };
  }
  return mejor;
}
// la fachada cuya normal apunta más hacia «frente», sin importar el largo (para una punta del edificio)
function fachadaMirando(contorno, frente) {
  const f = fachadaSur(contorno, frente);
  const cx = contorno.reduce((s, p) => s + p[0], 0) / contorno.length, cz = contorno.reduce((s, p) => s + p[1], 0) / contorno.length;
  let mejor = -2;
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i], b = contorno[(i + 1) % contorno.length], largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / largo, nz = (b[0] - a[0]) / largo;
    if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    const p = nx * frente[0] + nz * frente[1];
    if (p > mejor) { mejor = p; Object.assign(f, { a, b, largo, nx, nz }); }
  }
  return f;
}
// Baranda de tubos (foto del pasillo de 25): parales y cuatro tubos horizontales de acero gris azulado, con
// pasamanos arriba; a lo largo de x local, de -largo/2 a largo/2
const tuboBaranda = new THREE.MeshStandardMaterial({ color: 0x5f6f84, roughness: 0.45, metalness: 0.55 });
function baranda(largo, alto = 1.05) {
  const g = new THREE.Group();
  const caja_ = (w, h, d, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), tuboBaranda); m.position.set(x, y, 0); g.add(m); };
  caja_(largo, 0.07, 0.07, 0, alto);
  for (const y of [0.25, 0.45, 0.65, 0.85]) caja_(largo, 0.035, 0.035, 0, y);
  const n = Math.max(1, Math.round(largo / 1.6));
  for (let i = 0; i <= n; i++) caja_(0.07, alto, 0.07, -largo / 2 + (largo * i) / n, alto / 2);
  return g;
}
// banca de tubos (foto): asiento de reglas de acero gris azulado sobre dos marcos
function bancaTubos() {
  const g = new THREE.Group();
  const caja_ = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), tuboBaranda); m.position.set(x, y, z); g.add(m); };
  for (let k = 0; k < 5; k++) caja_(1.6, 0.03, 0.07, 0, 0.45, -0.2 + k * 0.1);
  for (const x of [-0.7, 0.7]) { caja_(0.06, 0.45, 0.06, x, 0.22, -0.2); caja_(0.06, 0.45, 0.06, x, 0.22, 0.2); caja_(0.06, 0.06, 0.46, x, 0.44, 0); }
  return g;
}
// Galería (edificio 12, foto): pasillo corrido en los dos pisos del frente sur, con piso de concreto, baranda de
// tubos al borde, columnas de acero, bancas y la losa del techo volada encima; escalera exterior en diagonal.
// La baranda se abre donde llega una pasarela (aberturas: [x, z, ancho]) y arriba de la escalera.
function galeria(grupo, vol, alto, pisos, { aberturas = [], mover_postes: moverPostes = [], quitar_postes: quitarPostes = [], abrir_abajo: abrirAbajo = [], escalera: xEsc = null, cerrar_oeste: cerrarOeste = false, barandas_abajo: barandasAbajo = [] } = {}) {
  const f = fachadaSur(vol.contorno), fondo = 2.6, dx = (f.b[0] - f.a[0]) / f.largo, dz = (f.b[1] - f.a[1]) / f.largo;
  const angulo = Math.atan2(-dz, dx), alturaPiso = alto / pisos;
  const en = (u, v, y) => [f.a[0] + dx * u + f.nx * v, y, f.a[1] + dz * u + f.nz * v];
  const pieza = (w, h, d, mat, u, v, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(...en(u, v, y)); m.rotation.y = angulo; m.castShadow = !liviano; m.receiveShadow = true; grupo.add(m); return m; };
  const concretoP = new THREE.MeshStandardMaterial({ color: 0xa9a7a1, roughness: 0.95 });
  // tramos de la orilla libres (sin baranda): aberturas por u
  const uDe0 = (x) => (x - f.a[0]) / dx;
  // escalera (fotos): dos tramos paralelos, el que sube del primer piso (al este) y el que llega al segundo (al oeste)
  const ESC = xEsc == null ? null : { arriba: [xEsc - 1.45, xEsc - 0.1].map(uDe0).sort((a, b) => a - b),
                                       abajo: [xEsc + 0.1, xEsc + 1.45].map(uDe0).sort((a, b) => a - b) };
  const uEsc = ESC ? (ESC.arriba[0] + ESC.abajo[1]) / 2 : f.largo * 0.62;
  const huecos = aberturas.map(([x, z, w]) => { const u = (x - f.a[0]) * dx + (z - f.a[1]) * dz; return [u - w / 2 - 0.1, u + w / 2 + 0.1]; });
  const tramos = (extra) => {
    const cortes = [...huecos, ...extra].sort((a, b) => a[0] - b[0]);
    const out = []; let u0 = 0;
    for (const [a, b] of cortes) { if (a > u0 + 0.3) out.push([u0, a]); u0 = Math.max(u0, b); }
    if (f.largo > u0 + 0.3) out.push([u0, f.largo]);
    return out;
  };
  const n = Math.max(2, Math.round(f.largo / 5));
  // columnas; mover_postes: [[x de antes, x nueva]] corre la columna más cercana a esa x (en la fachada)
  const uDe = (x) => (x - f.a[0]) / dx;
  const usCol = Array.from({ length: n + 1 }, (_, i) => f.largo * i / n);
  for (const [xa, xb] of moverPostes) {
    const k = usCol.reduce((m, u, i) => (Math.abs(u - uDe(xa)) < Math.abs(usCol[m] - uDe(xa)) ? i : m), 0);
    usCol[k] = uDe(xb);
  }
  for (const xq of quitarPostes) {   // quitar_postes: [x] quita la columna más cercana a esa x
    const k = usCol.reduce((m, u, i) => (Math.abs(u - uDe(xq)) < Math.abs(usCol[m] - uDe(xq)) ? i : m), 0);
    usCol.splice(k, 1);
  }
  for (const u of usCol) pieza(0.3, alto + 0.6, 0.3, tuboBaranda, u, fondo, (alto + 0.6) / 2);
  for (let p = 0; p < pisos; p++) {
    const y = p === 0 ? 0.3 : alturaPiso * p;
    pieza(f.largo, p === 0 ? 0.3 : 0.3, fondo + 0.3, p === 0 ? concretoP : losa, f.largo / 2, (fondo + 0.3) / 2, y - 0.15);   // piso
    // baranda al borde: abajo solo junto a las aberturas no; arriba, también abierta donde llega la escalera
    const extra = p === 0 ? [ESC ? ESC.abajo : [uEsc - 4.2, uEsc + 4.2], ...abrirAbajo.map(([xa, xb]) => [uDe(xa), uDe(xb)].sort((a, b) => a - b))]
      : [ESC ? ESC.arriba : [uEsc + 1.6, uEsc + 3.4]];
    for (const [a, b] of tramos(extra)) {
      const br = baranda(b - a); br.position.set(...en((a + b) / 2, fondo + 0.12, y)); br.rotation.y = angulo; grupo.add(br);
    }
    // bancas contra la baranda, entre columnas
    for (let k = 1; k < n; k += 2) {
      const u = f.largo * (k + 0.5) / n;
      if (huecos.some(([a, b]) => u > a - 1 && u < b + 1) || Math.abs(u - uEsc) < 4.5) continue;
      const bc = bancaTubos(); bc.position.set(...en(u, fondo - 0.4, y)); bc.rotation.y = angulo; grupo.add(bc);
    }
  }
  // (anotaciones) barandas a los lados de la entrada asfaltada: salen de la orilla del pasillo hacia afuera, en las x
  for (const xb of barandasAbajo) {
    const LB = 4.0, br = baranda(LB); br.position.set(...en(uDe(xb), fondo + 0.15 + LB / 2, 0.05));
    br.rotation.y = angulo + Math.PI / 2; grupo.add(br);
  }
  if (cerrarOeste) {
    // (anotaciones) en la punta oeste el techo del pasillo sigue hasta el borde del techo del edificio (la esquina
    // quedaba sin techo) y el pasillo de arriba se cierra con baranda
    const uW = dx > 0 ? 0 : f.largo, sW = dx > 0 ? -1 : 1, extra = 3.2;
    pieza(extra, 0.2, fondo + 0.8 + extra, losa, uW + sW * extra / 2, (fondo + 0.8 + extra) / 2 - extra, alto + 0.5);
    for (let p = 1; p < pisos; p++) {
      const br = baranda(fondo + 0.1); br.position.set(...en(uW + sW * 0.1, (fondo + 0.1) / 2, alturaPiso * p));
      br.rotation.y = angulo + Math.PI / 2; grupo.add(br);
    }
  }
  pieza(f.largo + 0.4, 0.2, fondo + 0.8, losa, f.largo / 2, (fondo + 0.8) / 2, alto + 0.5);   // techo volado
  if (ESC) { escaleraGaleria(grupo, { en, angulo, f, dx, dz, fondo, alto, alturaPiso, ESC }); return; }
  // escalera exterior en diagonal, a un tercio de la fachada
  const largoEsc = Math.hypot(alturaPiso, 6);
  const esc = new THREE.Mesh(new THREE.BoxGeometry(largoEsc, 0.25, 1.4), acero);
  esc.position.set(...en(uEsc, fondo + 1.1, alturaPiso / 2));
  esc.rotation.set(0, angulo, Math.atan2(alturaPiso, 6));
  esc.castShadow = true; grupo.add(esc);
}
// Escalera del pasillo (fotos del edificio 25): en forma de U, afuera del pasillo. El tramo de abajo sale del
// pasillo del primer piso hacia afuera hasta un descanso a media altura (losa de concreto sobre vigas de acero
// gris); el de arriba vuelve desde el descanso hasta el pasillo del segundo piso, al lado. Gradas de granito
// lavado sin contrahuella sobre dos zancas de acero gris; barandas de tubo gris con cinco barras a los dos lados
// de cada tramo y alrededor del descanso; cuatro columnas redondas grises (las de adelante suben hasta un techo
// plano blanco al nivel del techo del pasillo, al que llegan inclinadas desde el alero) y un alero de lámina
// ondulada de una agua en la unión de las columnas rectas con las inclinadas
function escaleraGaleria(grupo, { en, angulo, f, dx, dz, fondo, alto, alturaPiso, ESC }) {
  const gris = new THREE.MeshStandardMaterial({ color: 0x7d858c, roughness: 0.55, metalness: 0.45 });
  const granito = new THREE.MeshStandardMaterial({ color: 0xcfc8ba, roughness: 0.9 });
  const blanco = new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.7 });
  const lamina = new THREE.MeshStandardMaterial({ color: 0xc9cdd0, roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide,
    map: (() => { const t = texturaDibujada(64, 8, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0);
      for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? "#9da2a6" : "#eef0f1"); x.fillStyle = g; x.fillRect(0, 0, w, h); });
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 1); return t; })() });
  // v hacia afuera = s · (z local de una pieza girada «angulo»)
  const s = Math.sign(f.nx * -dz + f.nz * dx) || 1;
  const caja = (w, h, d, mat, u, v, y, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(...en(u, v, y));
    m.rotation.set(rx, angulo, rz, "YXZ"); m.castShadow = !liviano; m.receiveShadow = true; grupo.add(m); return m;
  };
  const tubo = (r, h, mat, u, v, y0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat); m.position.set(...en(u, v, y0 + h / 2));
    m.castShadow = !liviano; grupo.add(m); return m;
  };
  // pieza larga (a lo largo de v) inclinada de (vA, yA) a (vB, yB)
  const inclinada = (w, h, mat, u, vA, yA, vB, yB) => {
    const L = Math.hypot(vB - vA, yB - yA);
    return caja(w, h, L, mat, u, (vA + vB) / 2, (yA + yB) / 2, Math.atan2(-(yB - yA), (vB - vA) * s));
  };
  const barandaInclinada = (u, vA, yA, vB, yB) => {
    for (const k of [0.22, 0.42, 0.62, 0.82]) inclinada(0.035, 0.035, gris, u, vA, yA + k, vB, yB + k);
    inclinada(0.06, 0.06, gris, u, vA, yA + 1.0, vB, yB + 1.0);                            // pasamanos
    for (const t of [0, 0.5, 1]) caja(0.06, 1.0, 0.06, gris, u, vA + (vB - vA) * t, yA + (yB - yA) * t + 0.5);
  };
  const barandaRecta = (uA, uB, v, y) => {                                                     // a lo largo de u
    const L = Math.abs(uB - uA), um = (uA + uB) / 2;
    for (const k of [0.22, 0.42, 0.62, 0.82]) caja(L, 0.035, 0.035, gris, um, v, y + k);
    caja(L, 0.06, 0.06, gris, um, v, y + 1.0);
    for (const u of [uA, um, uB]) caja(0.06, 1.0, 0.06, gris, u, v, y + 0.5);
  };
  const barandaLado = (u, vA, vB, y) => {                                                     // a lo largo de v
    for (const k of [0.22, 0.42, 0.62, 0.82]) caja(0.035, 0.035, Math.abs(vB - vA), gris, u, (vA + vB) / 2, y + k);
    caja(0.06, 0.06, Math.abs(vB - vA), gris, u, (vA + vB) / 2, y + 1.0);
    for (const v of [vA, vB]) caja(0.06, 1.0, 0.06, gris, u, v, y + 0.5);
  };
  const y1 = 0.3, y2 = alturaPiso, yD = (y1 + y2) / 2, N = 11;
  const vP = fondo + 0.15, run = 3.0, vD0 = vP + run, vD1 = vD0 + 1.5;                       // pasillo, descanso
  const tramo = ([u0, u1], vA, yA, vB, yB) => {
    const w = u1 - u0, um = (u0 + u1) / 2, r = (vB - vA) / (N - 1), h = (yB - yA) / N;
    for (let i = 0; i < N - 1; i++) caja(w - 0.1, 0.07, Math.abs(r) + 0.04, granito, um, vA + r * (i + 0.5), yA + h * (i + 1) - 0.035);
    for (const ue of [u0 + 0.06, u1 - 0.06]) inclinada(0.06, 0.32, gris, ue, vA, yA - 0.1, vB, yB - 0.1);   // zancas
    for (const ue of [u0 + 0.02, u1 - 0.02]) barandaInclinada(ue, vA, yA, vB, yB);
  };
  // de abajo: del pasillo del primer piso hacia afuera, subiendo; de arriba: del descanso de vuelta al segundo piso
  tramo(ESC.abajo, vP, y1, vD0, yD);
  tramo(ESC.arriba, vD0, yD, vP, y2);
  // descanso: losa de granito sobre vigas grises, con baranda al frente y a los lados
  const uA = Math.min(ESC.arriba[0], ESC.abajo[0]), uB = Math.max(ESC.arriba[1], ESC.abajo[1]), uM = (uA + uB) / 2, W = uB - uA;
  caja(W + 0.1, 0.14, vD1 - vD0, granito, uM, (vD0 + vD1) / 2, yD - 0.07);
  caja(W + 0.1, 0.26, 0.12, gris, uM, vD1, yD - 0.27);
  caja(W + 0.1, 0.26, 0.12, gris, uM, vD0, yD - 0.27);
  for (const u of [uA, uB]) caja(0.12, 0.26, vD1 - vD0, gris, u, (vD0 + vD1) / 2, yD - 0.27);
  barandaRecta(uA, uB, vD1 - 0.03, yD);
  for (const u of [uA + 0.02, uB - 0.02]) barandaLado(u, vD0, vD1, yD);
  // (anotaciones) columnas de adelante: rectas del suelo hasta el alero de lámina y de ahí inclinadas hacia el
  // edificio hasta el techo; dos cortas bajo el borde de atrás del descanso
  const yJ = y2 + 2.35, yT = alto + 0.5, vC = vD1 + 0.15, vI = vC - 1.4;   // unión, techo (= el del pasillo), columnas
  const unir = (u, vA, yA, vB, yB, r) => {                                          // tubo de (vA, yA) a (vB, yB)
    const L = Math.hypot(vB - vA, yB - yA), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 12), gris);
    m.position.set(...en(u, (vA + vB) / 2, (yA + yB) / 2));
    m.rotation.set(Math.atan2((vB - vA) * s, yB - yA), angulo, 0, "YXZ"); m.castShadow = !liviano; grupo.add(m);
  };
  for (const u of [uA - 0.15, uB + 0.15]) {
    tubo(0.13, yJ, gris, u, vC, 0);
    unir(u, vC, yJ, vI, yT - 0.1, 0.12);
    caja(0.45, 0.3, 0.45, new THREE.MeshStandardMaterial({ color: 0xbab6ac, roughness: 0.95 }), u, vC, 0.15);
    tubo(0.09, yD - 0.4, gris, u, vD0, 0);
  }
  // techo plano blanco al mismo nivel que el techo del pasillo, volado sobre la escalera, con viga gris debajo
  const vT0 = fondo + 0.6, vT1 = vC + 0.4;
  caja(W + 2.2, 0.2, vT1 - vT0, blanco, uM, (vT0 + vT1) / 2, yT);
  caja(W + 2.2, 0.06, vT1 - vT0, lamina, uM, (vT0 + vT1) / 2, yT - 0.13);
  caja(W + 0.6, 0.18, 0.14, gris, uM, vI, yT - 0.2);
  // (anotaciones) lámina ondulada encima de los postes inclinados, como un techito de zinc que sobresale a los lados
  // y por abajo
  {
    const dv = vI - vC, dy = yT - 0.1 - yJ, Ld = Math.hypot(dv, dy), nv = dy / Ld, ny = -dv / Ld;   // normal hacia arriba y afuera
    const t0 = -0.12, t1 = 0.62, off = 0.2;
    const vL0 = vC + dv * t0 + nv * off, yL0 = yJ + dy * t0 + ny * off, vL1 = vC + dv * t1 + nv * off, yL1 = yJ + dy * t1 + ny * off;
    const L = Math.hypot(vL1 - vL0, yL1 - yL0), ang = Math.atan2(-(yL1 - yL0), (vL1 - vL0) * s);
    caja(uB - uA + 1.4, 0.05, L, lamina, uM, (vL0 + vL1) / 2, (yL0 + yL1) / 2, ang);
    for (const u of [uA - 0.15, uB + 0.15]) {                                         // correas sobre los postes
      const vc = (vL0 + vL1) / 2 - nv * 0.1, yc = (yL0 + yL1) / 2 - ny * 0.1;
      caja(0.08, 0.12, L * 0.9, gris, u, vc, yc, ang);
    }
  }
}
// Entrada principal (foto de la portada, de frente desde la ruta 32). De este a oeste: portón peatonal blanco y
// muro blanco con el rótulo azul «UCR · Sede del Caribe»; el carril de entrada bajo una losa blanca delgada e
// inclinada (más alta al este), con cielo de parasoles y columnas de acero inclinadas, entre dos pilares de concreto
// gris con su dintel; luego la caseta: losa delgada volada, muro blanco, celosía de lamas verticales blancas,
// directorios azules y una columna inclinada al oeste. Al frente, en la franja de zacate de la isla: el rótulo
// de concreto con el nombre, cuatro astas (Costa Rica, UCR y Limón, de este a oeste; la cuarta sin bandera),
// dos reflectores sobre pedestales, flores y dos palmas jóvenes. La isla, hacia la ruta 32, es plaza de adoquín.
function texturaDibujada(ancho, alto, dibujar) {
  const c = document.createElement("canvas"); c.width = ancho; c.height = alto;
  dibujar(c.getContext("2d"), ancho, alto);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const LETRA_ROTULO = "Optima, Candara, 'Gill Sans', 'Segoe UI', 'Source Sans 3', Arial, sans-serif";
function texturaRotulo() {
  return texturaDibujada(1200, 620, (x, W, H) => {
    x.fillStyle = "#a9aca7"; x.fillRect(0, 0, W, H);                       // marco de concreto
    const m = 46;
    x.fillStyle = "#9c9f9a"; x.fillRect(m, m, W - 2 * m, H - 2 * m);        // panel rehundido
    x.fillStyle = "#7d807b"; x.fillRect(m, m, W - 2 * m, 7); x.fillRect(m, m, 7, H - 2 * m);
    x.fillStyle = "#c3c5c0"; x.fillRect(m, H - m - 7, W - 2 * m, 7); x.fillRect(W - m - 7, m, 7, H - 2 * m);
    // grano del concreto
    for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? "60,62,60" : "230,232,228"},0.07)`; x.fillRect(Math.random() * W, Math.random() * H, 3, 3); }
    const texto = (t, px, y, cx, peso, variante = "") => {
      x.font = `${variante} ${peso} ${px}px ${LETRA_ROTULO}`; x.textAlign = "center";
      x.fillStyle = "rgba(70,72,69,0.55)"; x.fillText(t, cx + 3, y + 3);
      x.fillStyle = "#eceeeb"; x.fillText(t, cx, y);
    };
    texto("Universidad de Costa Rica", 74, 236, W * 0.555, 500, "small-caps");
    texto("Sede del Caribe", 104, 372, W * 0.51, 400);
  });
}
function texturaRotuloAzul() {   // muro blanco con el rótulo «UCR · Sede del Caribe» (al este del carril)
  return texturaDibujada(600, 560, (x, W, H) => {
    x.fillStyle = "#f3f4f5"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#ffffff"; x.fillRect(80, 190, 440, 52);
    x.strokeStyle = "#9db8d6"; x.lineWidth = 3; x.strokeRect(80, 190, 440, 52);
    x.fillStyle = "#1f6fbf"; x.font = "700 38px 'Source Sans 3', Arial, sans-serif"; x.textAlign = "left"; x.fillText("UCR", 92, 230);
    x.fillStyle = "#6f8fb3"; x.font = "500 16px 'Source Sans 3', Arial, sans-serif"; x.fillText("Sede del Caribe · Limón", 180, 224);
    x.fillStyle = "#2a8ad6"; x.fillRect(80, 246, 440, 96);
    x.fillStyle = "#ffffff"; x.font = "600 52px 'Source Sans 3', Arial, sans-serif"; x.textAlign = "center"; x.fillText("Sede del Caribe", W / 2, 312);
  });
}
function texturaDirectorio() {   // directorio azul de la caseta
  return texturaDibujada(120, 320, (x, W, H) => {
    x.fillStyle = "#1d4f9c"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#ffffff"; x.fillRect(12, 14, 40, 16);
    x.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 9; i++) x.fillRect(14, 48 + i * 28, 70 + ((i * 37) % 25), 7);
  });
}
function bandera(franjas) {   // tela con franjas horizontales, de la parte de arriba hacia abajo
  const t = texturaDibujada(96, 64, (x, W, H) => {
    const total = franjas.reduce((s, f) => s + f[1], 0);
    let pos = 0;
    for (const [color, peso] of franjas) { x.fillStyle = color; const tam = (peso / total) * H; x.fillRect(0, pos, W, tam + 1); pos += tam; }
  });
  return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
}
function telaCaida(largo, alto) {   // bandera casi sin viento: cae desde el asta, con ondas suaves
  const g = new THREE.PlaneGeometry(largo, alto, 10, 4).translate(largo / 2, -alto / 2, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / largo;
    p.setY(i, p.getY(i) - u * largo * 1.15);
    p.setZ(i, Math.sin(u * 7.5) * 0.12 * u);
  }
  g.computeVertexNormals();
  return g;
}
function palmaJoven(alto) {   // palma ornamental joven: tronco delgado y penacho de hojas arqueadas
  const g = new THREE.Group();
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, alto, 6), new THREE.MeshLambertMaterial({ color: 0x9a9479 }));
  tronco.position.y = alto / 2; g.add(tronco);
  const hoja = new THREE.MeshLambertMaterial({ color: 0x8fb35c, side: THREE.DoubleSide, flatShading: true });
  for (let k = 0; k < 9; k++) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.1, 3, 1).translate(0, 1.05, 0), hoja);
    h.position.y = alto; h.rotation.set(0, (k / 9) * Math.PI * 2, 0); h.rotateZ(-Math.PI / 2 + 0.25 + (k % 3) * 0.3); h.scale.z = 0.25;
    g.add(h);
  }
  return g;
}
function entrada(grupo, e) {
  const k = e.volumenes[0].contorno, largo = Math.hypot(k[1][0] - k[0][0], k[1][1] - k[0][1]);
  const prof = Math.hypot(k[2][0] - k[1][0], k[2][1] - k[1][1]), L2 = largo / 2, P2 = prof / 2;
  let dx = (k[1][0] - k[0][0]) / largo, dz = (k[1][1] - k[0][1]) / largo;
  if (dx < 0) { dx = -dx; dz = -dz; }                      // d apunta al este
  let nx = dz, nz = -dx;                                    // n apunta al norte (hacia la carretera)
  if (nz > 0) { nx = -nx; nz = -nz; }
  const [cx, cz] = e.centro, giro = Math.atan2(nx, nz), giroD = Math.atan2(-dz, dx);
  const en = (a, b, y = 0) => new THREE.Vector3(cx + dx * a + nx * b, y, cz + dz * a + nz * b);
  const poner = (m, a, b, y, sombra = true) => { m.position.copy(en(a, b, y)); m.rotation.y = giro; m.castShadow = sombra && !liviano; m.receiveShadow = true; grupo.add(m); return m; };
  const blanco = new THREE.MeshStandardMaterial({ color: 0xf2f3f4, roughness: 0.55 });
  // las losas se ven blancas también por debajo (en la foto, el cielo de la losa es claro, no queda en sombra)
  const losaBlanca = new THREE.MeshStandardMaterial({ color: 0xf2f3f4, roughness: 0.55, emissive: 0x6a6c6e });
  const concreto = new THREE.MeshStandardMaterial({ color: 0x8e9294, roughness: 0.9 });
  const acero = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.45, roughness: 0.35 });
  const caja = (w, h, p, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, p), mat);   // w: este-oeste, p: norte-sur

  // --- parada techada (fotos de la Sede): losa blanca delgada y plana, volada hacia la carretera, con cielo blanco,
  // vigas oscuras y lámparas cuadradas; al frente, columnas de acero gris oscuro en V, cada par en un cuadro de zacate;
  // piso de adoquín en espiga con cordón amarillo. Al fondo, una hilera de hojas blancas delgadas y, entre ellas,
  // tablones grises de concreto con una banca al pie de cada uno (se ve el campus entre ellos). En las dos puntas, un
  // muro blanco con el directorio azul
  const alto = e.alto;
  const grisO = new THREE.MeshStandardMaterial({ color: 0x4a525b, roughness: 0.5, metalness: 0.35 });
  const tablon = new THREE.MeshStandardMaterial({ color: 0x9a9893, roughness: 0.95 });
  const amarilloC = new THREE.MeshStandardMaterial({ color: 0xf0c419, roughness: 0.7 });
  const adoquin = texturaDibujada(256, 256, (x, W, H) => {   // espiga de ladrillo rojizo y gris
    x.fillStyle = "#6f6467"; x.fillRect(0, 0, W, H);
    const tonos = ["#958589", "#8a7f84", "#9c8b88", "#857d83", "#a08f8e"];
    let k = 0;
    for (let fy = -2; fy < 18; fy++) for (let fx = -2; fx < 18; fx++) {
      x.fillStyle = tonos[(k++ * 7) % tonos.length];
      const bx = fx * 16 + (fy % 2) * 8, by = fy * 16;
      if ((fx + fy) % 2) x.fillRect(bx + 1, by + 1, 30, 14); else x.fillRect(bx + 1, by + 1, 14, 30);
    }
  });
  adoquin.wrapS = adoquin.wrapT = THREE.RepeatWrapping;
  const bS0 = -P2 - 0.6, bN0 = P2 + 3.3, aW0 = -L2 - 0.4, aE0 = L2 + 0.1, bFin = -P2 + 0.6;
  const piso = caja(aE0 - aW0, 0.16, bN0 - bS0, new THREE.MeshStandardMaterial({ map: adoquin, roughness: 0.95 }));
  adoquin.repeat.set((aE0 - aW0) / 2.4, (bN0 - bS0) / 2.4);
  poner(piso, (aW0 + aE0) / 2, (bS0 + bN0) / 2, 0.08, false);
  poner(caja(aE0 - aW0 + 0.2, 0.2, 0.2, amarilloC), (aW0 + aE0) / 2, bN0 + 0.1, 0.1, false);   // cordón amarillo al frente
  poner(caja(0.2, 0.2, bN0 - bS0, amarilloC), aW0 - 0.1, (bS0 + bN0) / 2, 0.1, false);           // y en la punta oeste
  // losa: delgada, plana, volada al frente; vigas oscuras por debajo y lámparas cuadradas
  const yL = alto + 0.15;
  poner(caja(aE0 - aW0 + 1.2, 0.3, bN0 - bS0 + 0.6, losaBlanca), (aW0 + aE0) / 2, (bS0 + bN0) / 2 + 0.2, yL);
  for (const b of [bFin + 0.6, bN0 - 0.9]) poner(caja(aE0 - aW0, 0.22, 0.14, grisO), (aW0 + aE0) / 2, b, yL - 0.26, false);
  for (let a = aW0 + 2; a < aE0 - 1; a += 3.2) poner(caja(0.12, 0.2, bN0 - bS0 - 0.6, grisO), a, (bS0 + bN0) / 2, yL - 0.25, false);
  const luz = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let a = aW0 + 2.8; a < aE0 - 1.5; a += 4.4) for (const b of [bFin + 1.9, bN0 - 1.6]) poner(caja(0.9, 0.04, 0.9, luz), a, b, yL - 0.16, false);
  // muros blancos de las puntas con el directorio azul hacia la carretera
  const dir = new THREE.MeshBasicMaterial({ map: texturaDirectorio() });
  const aMuroE = aE0 - 2.4, aMuroW = aW0 + 0.25;
  poner(caja(aE0 - aMuroE, alto, 1.4, blanco), (aE0 + aMuroE) / 2, bFin, alto / 2);
  poner(new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.5), dir), (aE0 + aMuroE) / 2, bFin + 0.71, 1.6, false);
  poner(caja(0.5, alto, 1.4, blanco), aMuroW, bFin, alto / 2);
  // hojas blancas, tablones grises y bancas
  const a0 = aW0 + 0.5, a1 = aMuroE, paso = 1.15, n = Math.floor((a1 - a0) / paso);
  const qG = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), giro), uno = new THREE.Vector3(1, 1, 1);
  const hojas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, alto, 0.7), blanco, n + 1);
  const tablones = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, alto * 0.72, 0.16), tablon, n);
  const asientos = new THREE.InstancedMesh(new THREE.BoxGeometry(paso - 0.3, 0.08, 0.42), tablon, n);
  const patas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.42, 0.34), tablon, n * 2);
  for (let i = 0; i <= n; i++) hojas.setMatrixAt(i, new THREE.Matrix4().compose(en(a0 + i * paso, bFin, alto / 2), qG, uno));
  for (let i = 0; i < n; i++) {
    const a = a0 + (i + 0.5) * paso;
    tablones.setMatrixAt(i, new THREE.Matrix4().compose(en(a, bFin - 0.12, 0.16 + alto * 0.36), qG, uno));
    asientos.setMatrixAt(i, new THREE.Matrix4().compose(en(a, bFin + 0.38, 0.46), qG, uno));
    for (const s of [0, 1]) patas.setMatrixAt(i * 2 + s, new THREE.Matrix4().compose(en(a + (s ? 1 : -1) * (paso / 2 - 0.3), bFin + 0.38, 0.21), qG, uno));
  }
  for (const m of [hojas, tablones, asientos, patas]) { m.castShadow = !liviano; m.receiveShadow = true; grupo.add(m); }
  // columnas en V al frente, sobre un cuadro de zacate
  const zacateC = new THREE.MeshLambertMaterial({ color: 0x5f8a3e });
  for (let a = aW0 + 2.2; a < aE0 - 1; a += 5.2) {
    const b = bN0 - 0.9;
    poner(caja(0.8, 0.04, 0.8, zacateC), a, b, 0.17, false);
    poner(caja(0.35, 0.1, 0.35, grisO), a, b, 0.2, false);
    for (const abre of [-1, 1]) {
      const h = Math.hypot(yL - 0.2, 1.1), c = caja(0.16, h, 0.16, grisO);
      c.position.copy(en(a + abre * 0.55, b, (yL + 0.2) / 2)); c.rotation.set(0, giroD, 0); c.rotateZ(-abre * Math.atan2(1.1, yL - 0.2)); c.castShadow = !liviano; grupo.add(c);   // juntas abajo, abiertas arriba
    }
  }

  // --- portal del carril de entrada: dos pilares de concreto con dintel, de la punta este de la caseta a la isla del este
  const aP = L2 + 0.3, aQ = L2 + 7.9, altoPortal = 3.5;
  for (const a of [aP, aQ]) poner(caja(0.8, altoPortal, 0.8, concreto), a, P2 - 0.4, altoPortal / 2);
  poner(caja(aQ - aP + 0.8, 0.55, 0.8, concreto), (aP + aQ) / 2, P2 - 0.4, altoPortal - 0.27);
  const barrotes = new THREE.MeshStandardMaterial({ color: 0x4b5054, metalness: 0.4, roughness: 0.5, transparent: true, opacity: 0.85 });
  const reja = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 2.1, 0.06), barrotes, 14);
  for (let i = 0; i < 14; i++) reja.setMatrixAt(i, new THREE.Matrix4().compose(en(aP + 0.6 + i * 0.24, P2 - 1.3, 1.05), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), giro), new THREE.Vector3(1, 1, 1)));
  grupo.add(reja);   // portón corredizo de barrotes, medio abierto

  // --- muro blanco con el rótulo azul y portón peatonal, en la isla al este del carril
  const muro = caja(3.0, 2.8, 0.35, [blanco, blanco, blanco, blanco, new THREE.MeshStandardMaterial({ map: texturaRotuloAzul(), roughness: 0.6 }), blanco]);
  poner(muro, aQ + 2.3, P2 + 0.2, 1.4);
  poner(caja(0.32, 2.5, 0.32, blanco), aQ + 4.2, P2 + 0.2, 1.25);
  const rejaP = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 1.9, 0.04), blanco, 9);
  for (let i = 0; i < 9; i++) rejaP.setMatrixAt(i, new THREE.Matrix4().compose(en(aQ + 4.45 + i * 0.16, P2 + 0.2, 1.05), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
  grupo.add(rejaP);
  poner(caja(1.4, 0.06, 0.05, blanco), aQ + 5.05, P2 + 0.2, 2.0, false);

  // --- losa del carril: delgada, inclinada (más alta al este), con cielo de parasoles; columnas inclinadas en V
  const aW = L2 - 4.5, aE = L2 + 15, bS = P2 - 3.2, bN = P2 + 7.2, yW = 3.9, yE = 4.9, pend = Math.atan2(yE - yW, aE - aW);
  const parasol = texturaDibujada(64, 16, (x, W, H) => { x.fillStyle = "#e7e9ea"; x.fillRect(0, 0, W, H); x.fillStyle = "#b9bdc0"; x.fillRect(0, 0, 22, H); x.fillStyle = "#d3d6d8"; x.fillRect(22, 0, 4, H); });
  parasol.wrapS = parasol.wrapT = THREE.RepeatWrapping; parasol.repeat.set((aE - aW) / 0.32, 1);
  const cielo = new THREE.MeshStandardMaterial({ map: parasol, roughness: 0.7, emissive: 0x8a8d90, emissiveMap: parasol });
  const losa = caja(aE - aW, 0.3, bN - bS, [losaBlanca, losaBlanca, blanco, cielo, losaBlanca, losaBlanca]);
  losa.position.copy(en((aW + aE) / 2, (bS + bN) / 2, (yW + yE) / 2)); losa.rotation.set(0, giroD, 0); losa.rotateZ(pend);
  losa.castShadow = !liviano; grupo.add(losa);
  const yLosa = (a) => yW + ((a - aW) / (aE - aW)) * (yE - yW) - 0.15;
  const columna = (a, b, inclina) => {
    const h = yLosa(a + Math.sin(inclina) * yLosa(a)) / Math.cos(inclina);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h, 8).translate(0, h / 2, 0), acero);
    c.position.copy(en(a, b, 0)); c.rotation.set(0, giroD, 0); c.rotateZ(-inclina); c.castShadow = !liviano; grupo.add(c);
  };
  const bCol = bN - 0.9;
  for (const [a, abre] of [[aP + 0.6, 0.2], [aP + 7.0, 0.22]]) { columna(a, bCol, abre); columna(a, bCol, -abre * 0.5); }
  columna(aE - 2.2, bCol, 0.26);

  // --- rótulo de concreto en la franja de zacate, con la cara hacia la carretera
  const aR = 1.6, bR = 11.7, anchoR = 6.0, altoR = 3.1, baseR = 0.45;
  const gris = new THREE.MeshStandardMaterial({ color: 0xa9aca7, roughness: 0.92 });
  const cara = new THREE.MeshStandardMaterial({ map: texturaRotulo(), roughness: 0.9 });
  poner(caja(anchoR, altoR, 0.6, [gris, gris, gris, gris, cara, gris]), aR, bR, baseR + altoR / 2);
  poner(caja(anchoR - 0.5, baseR, 0.45, new THREE.MeshStandardMaterial({ color: 0x8b8e8a, roughness: 0.95 })), aR, bR, baseR / 2);

  // cuatro astas tras el rótulo, en su mitad este; de este a oeste: Costa Rica, UCR, Limón y la cuarta sin bandera
  const telas = [
    bandera([["#002b7f", 1], ["#ffffff", 1], ["#ce1126", 2], ["#ffffff", 1], ["#002b7f", 1]]),
    bandera([["#9fd0f0", 1], ["#ffffff", 1]]),
    bandera([["#5aa9e0", 1], ["#ffffff", 1], ["#3c9a3c", 1]]),
  ];
  const vuela = Math.atan2(-(dz * 0.8 + nz * 0.6), dx * 0.8 + nx * 0.6);   // la tela cae hacia el este y un poco al frente
  for (let i = 0; i < 4; i++) {
    const a = aR + anchoR / 2 - 1.75 - i * 0.95, p = en(a, bR - 1.0);
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 10, 6), acero);
    palo.position.set(p.x, 5, p.z); palo.castShadow = !liviano; grupo.add(palo);
    const remate = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), acero); remate.position.set(p.x, 10.05, p.z); grupo.add(remate);
    if (!telas[i]) continue;
    const tela = new THREE.Mesh(telaCaida(1.5, 0.95), telas[i]);
    tela.position.set(p.x, 9.75, p.z); tela.rotation.y = vuela; tela.castShadow = !liviano; grupo.add(tela);
  }
  // reflectores sobre pedestales, al frente del rótulo
  const negro = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.5 });
  for (const a of [aR + 1.4, aR - 2.85]) {
    poner(caja(0.5, 0.5, 0.5, new THREE.MeshStandardMaterial({ color: 0xdedfdd, roughness: 0.8 })), a, bR + 1.3, 0.25);
    const foco = poner(caja(0.42, 0.42, 0.3, negro), a, bR + 1.3, 0.72);
    foco.rotateX(-0.35);
  }
  // flores: girasoles al este del rótulo y un macizo rojo y anaranjado al frente
  const flores = (a, b, r, colores, n) => {
    const geo = new THREE.IcosahedronGeometry(0.075, 0), mats = colores.map((c) => new THREE.MeshLambertMaterial({ color: c }));
    const azar = (i) => { const v = Math.sin(i * 12.9898 + a * 78.233) * 43758.5453; return v - Math.floor(v); };
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(geo, mats[i % mats.length]), ang = azar(i) * Math.PI * 2, rr = Math.sqrt(azar(i + 99)) * r;
      f.position.copy(en(a + Math.cos(ang) * rr, b + Math.sin(ang) * rr * 0.6, 0.12 + azar(i + 7) * 0.22)); grupo.add(f);
    }
    const mata = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4f7d34 }));
    mata.scale.set(1, 0.35, 0.6); mata.position.copy(en(a, b, 0)); mata.rotation.y = giro; grupo.add(mata);
  };
  flores(aR + 5.6, bR + 0.9, 0.75, [0xf2c21b, 0xf5d33a, 0xf2c21b, 0x5a3a1a, 0xffffff], 70);
  flores(aR - 1.3, bR + 0.75, 0.55, [0xe0452b, 0xf28a1f, 0xd62f2f, 0xf5b82e], 50);
  // palmas jóvenes: una frente al carril, al este del rótulo, y otra al oeste
  for (const [a, b, h] of [[aR + 4.4, bR + 0.3, 3.3], [aR - 5.7, bR - 0.4, 3.6]]) {
    const pj = palmaJoven(h); pj.position.copy(en(a, b, 0)); pj.rotation.y = a; grupo.add(pj);
  }
}

// Balcones (anotaciones; foto del edificio nuevo): en una punta del edificio, uno a ras del primer piso y otro en el
// segundo, losa de concreto en voladizo con baranda de tubo gris y columnas de acero en las esquinas
function balcones(grupo, vol, alto, pisos, frente, unirGaleria = false) {
  const f = fachadaMirando(vol.contorno, frente), dx = (f.b[0] - f.a[0]) / f.largo, dz = (f.b[1] - f.a[1]) / f.largo;
  const ang = Math.atan2(-dz, dx), fondo = 2.4, largo = f.largo - 0.6;
  const cx = (f.a[0] + f.b[0]) / 2, cz = (f.a[1] + f.b[1]) / 2;
  const en = (u, v, y) => [cx + dx * u + f.nx * v, y, cz + dz * u + f.nz * v];
  const pieza = (w, h, d, mat, u, v, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(...en(u, v, y)); m.rotation.y = ang; m.castShadow = !liviano; grupo.add(m); };
  const tubo = new THREE.MeshStandardMaterial({ color: 0x6b7278, roughness: 0.5, metalness: 0.5 });
  // (anotaciones) unido al pasillo de la galería sur: la losa sigue por la esquina hasta la orilla del pasillo
  // (2,6 m afuera de la fachada sur) y la baranda da la vuelta; del lado del pasillo no lleva baranda
  const sur = dz > 0 ? 1 : -1, FONDO_GALERIA = 2.6;
  const uFin = sur * (f.largo / 2 + FONDO_GALERIA + 0.25), uBal = sur * largo / 2;
  for (let p = 0; p < pisos; p++) {
    // unido a la galería, la losa queda a ras del piso del pasillo (0,3 m abajo; arriba, el piso)
    const y = unirGaleria ? (p === 0 ? 0.3 : (alto / pisos) * p) - 0.125 : p === 0 ? 0.45 : (alto / pisos) * p;
    pieza(largo, 0.25, fondo, losa, 0, fondo / 2, y);                                      // losa
    for (const h of [0.5, 1.0]) pieza(largo, 0.06, 0.06, tubo, 0, fondo - 0.05, y + h);   // baranda al frente
    for (const lado of [-1, 1]) {
      if (unirGaleria && lado === sur) continue;
      for (const h of [0.5, 1.0]) pieza(0.06, 0.06, fondo, tubo, lado * largo / 2, fondo / 2, y + h);
    }
    const n = Math.max(2, Math.round(largo / 1.2));
    for (let i = 0; i <= n; i++) pieza(0.04, 1.0, 0.04, tubo, -largo / 2 + (largo * i) / n, fondo - 0.05, y + 0.5);
    if (unirGaleria) {
      const L = Math.abs(uFin - uBal), um = (uFin + uBal) / 2;
      pieza(L, 0.25, fondo, losa, um, fondo / 2, y);                                       // losa de la esquina
      for (const h of [0.5, 1.0]) pieza(L, 0.06, 0.06, tubo, um, fondo - 0.05, y + h);     // baranda al este
      const uR = sur * (f.largo / 2 + FONDO_GALERIA + 0.12);                               // y al sur, en línea con la del pasillo
      for (const h of [0.5, 1.0]) pieza(0.06, 0.06, fondo, tubo, uR, fondo / 2, y + h);
      const k = Math.max(1, Math.round(L / 1.2));
      for (let i = 0; i <= k; i++) pieza(0.04, 1.0, 0.04, tubo, uBal + ((uFin - uBal) * i) / k, fondo - 0.05, y + 0.5);
      for (let i = 0; i <= 2; i++) pieza(0.04, 1.0, 0.04, tubo, uR, (fondo * i) / 2, y + 0.5);
    }
  }
  for (const lado of [-1, 1]) pieza(0.25, alto, 0.25, acero, lado * largo / 2, fondo, alto / 2);   // columnas
  if (unirGaleria) {
    // (anotaciones) la esquina unida lleva su trozo de techo, a la altura del techo volado del pasillo, y un poste
    // en la esquina de afuera
    const uIni = sur * (f.largo / 2 - 0.3), uTecho = sur * (f.largo / 2 + FONDO_GALERIA + 0.8);
    pieza(Math.abs(uTecho - uIni), 0.2, 3.2, losa, (uIni + uTecho) / 2, 1.6, alto + 0.5);
    pieza(0.25, alto + 0.6, 0.25, acero, sur * (f.largo / 2 + FONDO_GALERIA), fondo, (alto + 0.6) / 2);
  }
}

// Mural de mosaico (foto): en la pared que da al frente indicado, entre el zócalo y el alero, con la puerta al
// centro. Olas de colores (azul, rojo, naranja) con un ave, una banda amarilla con cuadros negros que serpentea,
// fondo de teselas verdes con palmas, un remolino morado con una media luna roja y un girasol
function texturaMosaico(W, H) {
  return texturaDibujada(W, H, (x) => {
    let semilla = 7;
    const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
    x.fillStyle = "#3d4a33"; x.fillRect(0, 0, W, H);                                   // fondo de teselas oscuras
    for (let i = 0; i < W * H / 60; i++) {                                              // teselas verdes y ocres
      const t = azar(); x.fillStyle = t < 0.4 ? "#56683f" : t < 0.7 ? "#43502f" : t < 0.85 ? "#7a6a3a" : "#2c3426";
      x.fillRect(azar() * W, azar() * H, 3 + azar() * 4, 3 + azar() * 4);
    }
    const ola = (color, y0, amp, grosor, fase, hasta = W) => {
      x.fillStyle = color; x.beginPath(); x.moveTo(0, y0 + grosor);
      for (let px = 0; px <= hasta; px += 8) x.lineTo(px, y0 + Math.sin(px / W * 6.2 + fase) * amp);
      for (let px = hasta; px >= 0; px -= 8) x.lineTo(px, y0 + grosor + Math.sin(px / W * 6.2 + fase) * amp * 0.8);
      x.closePath(); x.fill();
    };
    // a la izquierda: olas azul, roja y naranja que suben desde abajo
    x.save(); x.beginPath(); x.rect(0, 0, W * 0.32, H); x.clip();
    ola("#e8722c", H * 0.05, H * 0.12, H * 0.42, 0.3); ola("#2f5fb4", H * 0.18, H * 0.16, H * 0.38, 1.4);
    ola("#d8382f", H * 0.55, H * 0.12, H * 0.3, 2.6); ola("#3a73d0", H * 0.78, H * 0.08, H * 0.3, 0.4);
    x.restore();
    // ave blanca sobre el azul
    x.strokeStyle = "#f2f2ee"; x.lineWidth = H * 0.025; x.beginPath();
    x.moveTo(W * 0.07, H * 0.42); x.quadraticCurveTo(W * 0.1, H * 0.3, W * 0.12, H * 0.4); x.quadraticCurveTo(W * 0.14, H * 0.3, W * 0.17, H * 0.38); x.stroke();
    // banda amarilla con cuadros negros, que serpentea de izquierda a derecha
    x.lineCap = "round"; x.strokeStyle = "#1c1c18"; x.lineWidth = H * 0.16;
    const banda = (px) => H * (0.45 + Math.sin(px / W * 9 + 0.8) * 0.28);
    x.beginPath(); for (let px = W * 0.12; px <= W * 0.72; px += 6) x.lineTo(px, banda(px)); x.stroke();
    x.strokeStyle = "#f0c12e"; x.lineWidth = H * 0.12;
    x.beginPath(); for (let px = W * 0.12; px <= W * 0.72; px += 6) x.lineTo(px, banda(px)); x.stroke();
    x.fillStyle = "#1c1c18";
    for (let px = W * 0.13; px <= W * 0.71; px += H * 0.1) x.fillRect(px - H * 0.025, banda(px) - H * 0.025, H * 0.05, H * 0.05);
    // palmas
    const palma = (px, py, r) => {
      x.strokeStyle = "#7d8f3c"; x.lineWidth = H * 0.018;
      x.beginPath(); x.moveTo(px, py + r * 1.6); x.lineTo(px, py); x.stroke();
      for (let k = 0; k < 7; k++) { const a = Math.PI * (1.05 + k * 0.15); x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * r * 0.7, py + Math.sin(a) * r * 0.9 - r * 0.3, px + Math.cos(a) * r, py + Math.sin(a) * r * 0.6 + r * 0.2); x.stroke(); }
    };
    palma(W * 0.34, H * 0.3, H * 0.28); palma(W * 0.5, H * 0.32, H * 0.25);
    // a la derecha: remolino morado y rosado, media luna roja y girasol
    x.fillStyle = "#7e5a9e"; x.beginPath(); x.ellipse(W * 0.79, H * 0.5, W * 0.11, H * 0.46, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#b0849f"; x.beginPath(); x.ellipse(W * 0.76, H * 0.42, W * 0.06, H * 0.28, 0.3, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#d8302a"; x.lineWidth = H * 0.1; x.beginPath(); x.arc(W * 0.83, H * 0.55, H * 0.36, Math.PI * 0.95, Math.PI * 2.05); x.stroke();
    x.fillStyle = "#e3a21e";
    for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; x.beginPath(); x.ellipse(W * 0.885 + Math.cos(a) * H * 0.15, H * 0.52 + Math.sin(a) * H * 0.15, H * 0.08, H * 0.03, a, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = "#4a3418"; x.beginPath(); x.arc(W * 0.885, H * 0.52, H * 0.1, 0, Math.PI * 2); x.fill();
    // abajo, triángulos azules y morados
    for (const [px, c] of [[0.58, "#3b63b8"], [0.66, "#5d4b9a"], [0.95, "#3b63b8"]]) { x.fillStyle = c; x.beginPath(); x.moveTo(W * px, H); x.lineTo(W * (px + 0.04), H * 0.82); x.lineTo(W * (px + 0.09), H); x.fill(); }
    // juntas de mosaico: puntitos claros
    x.fillStyle = "rgba(240,236,220,0.18)";
    for (let i = 0; i < W * H / 220; i++) x.fillRect(azar() * W, azar() * H, 1.5, 1.5);
  });
}
function muralMosaico(grupo, vol, alto, frente) {
  const f = fachadaMirando(vol.contorno, frente), ang = Math.atan2(f.nx, f.nz);
  const largo = f.largo * 0.86, altoM = alto - 1.25;
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(largo, altoM), new THREE.MeshStandardMaterial({ map: texturaMosaico(2048, Math.round(2048 * altoM / largo)), roughness: 0.6 }));
  const cx = (f.a[0] + f.b[0]) / 2, cz = (f.a[1] + f.b[1]) / 2;
  mural.position.set(cx + f.nx * 0.14, 0.75 + altoM / 2, cz + f.nz * 0.14); mural.rotation.y = ang; grupo.add(mural);
  // puerta al centro (marco negro y vidrio oscuro) y zócalo de concreto con su acera
  const dx = (f.b[0] - f.a[0]) / f.largo, dz = (f.b[1] - f.a[1]) / f.largo, angF = Math.atan2(-dz, dx);
  const marco = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.4 }));
  marco.position.set(cx + f.nx * 0.18, 0.75 + 1.2, cz + f.nz * 0.18); marco.rotation.y = angF; grupo.add(marco);
  const vidrioP = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.04), new THREE.MeshStandardMaterial({ color: 0x2b3a44, roughness: 0.15, metalness: 0.3 }));
  vidrioP.position.set(cx + f.nx * 0.24, 0.75 + 1.15, cz + f.nz * 0.24); vidrioP.rotation.y = angF; grupo.add(vidrioP);
  const zocalo = new THREE.Mesh(new THREE.BoxGeometry(f.largo, 0.75, 0.3), new THREE.MeshStandardMaterial({ color: 0xb9b7b0, roughness: 0.95 }));
  zocalo.position.set(cx + f.nx * 0.15, 0.37, cz + f.nz * 0.15); zocalo.rotation.y = angF; grupo.add(zocalo);
  const acera = new THREE.Mesh(new THREE.BoxGeometry(f.largo, 0.12, 2.2), new THREE.MeshStandardMaterial({ color: 0xc4bfb4, roughness: 0.95 }));
  acera.position.set(cx + f.nx * 1.4, 0.06, cz + f.nz * 1.4); acera.rotation.y = angF; grupo.add(acera);
}
// Adoquín en espiga (foto de la entrada de la biblioteca): ladrillos grises de 2:1 en zigzag, con juntas
function texturaEspiga() {
  const t = texturaDibujada(512, 512, (x, W) => {
    x.fillStyle = "#6f706c"; x.fillRect(0, 0, W, W);
    let semilla = 11;
    const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
    const u = W / 8;   // ancho de un ladrillo (largo = 2u)
    for (let i = -8; i < 16; i++) for (let j = -8; j < 16; j++) {
      const tono = 120 + Math.round(azar() * 40), c = `rgb(${tono},${tono + 2},${tono - 4})`;
      x.fillStyle = c;
      const ox = (i + j) * u, oy = (j - i) * u;   // dos ladrillos por celda: uno acostado y otro parado
      x.fillRect(ox + 2, oy + 2, 2 * u - 4, u - 4);
      x.fillStyle = `rgb(${tono - 12},${tono - 10},${tono - 16})`;
      x.fillRect(ox + 2 * u + 2, oy + 2 - u, u - 4, 2 * u - 4);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// Entrada de la biblioteca (foto): en la esquina entre los dos cuerpos, dos puertas de vidrio de marco negro (una
// en cada pared) con el rótulo «BIBLIOTECA» entre ellas, un alero blanco que corre por las dos paredes, al frente
// una plaza de adoquín en espiga con cordón rojizo que se abre hacia la calle; a la izquierda la pared blanca
// bajo las ventanas, acera, dos aires acondicionados, macetas y un jardín de piedras; a la derecha la pared
// celeste con tres basureros y su rótulo
function puertaBiblioteca(grupo, volumenes, { cerca, frente }) {
  const v0 = volumenes[0];
  const f1 = fachadaMirando(v0.contorno, frente);
  // el otro cuerpo a ras del suelo más cercano al punto indicado, y su pared que mira hacia afuera de la esquina
  const centroDe = (c) => c.reduce((s, p) => [s[0] + p[0] / c.length, s[1] + p[1] / c.length], [0, 0]);
  const otros = volumenes.filter((v) => v !== v0 && !v.desde);
  const v1 = otros.sort((p, q) => Math.hypot(...centroDe(p.contorno).map((k, i) => k - cerca[i])) - Math.hypot(...centroDe(q.contorno).map((k, i) => k - cerca[i])))[0];
  const c0 = centroDe(v0.contorno), c1 = centroDe(v1.contorno);
  // W: a lo largo de f1, alejándose del otro cuerpo; f2 es la pared del otro cuerpo que mira hacia W
  let W = [(f1.b[0] - f1.a[0]) / f1.largo, (f1.b[1] - f1.a[1]) / f1.largo];
  if (W[0] * (cerca[0] - c1[0]) + W[1] * (cerca[1] - c1[1]) < 0) W = [-W[0], -W[1]];
  const f2 = fachadaMirando(v1.contorno, W);
  let S = [(f2.b[0] - f2.a[0]) / f2.largo, (f2.b[1] - f2.a[1]) / f2.largo];
  if (S[0] * f1.nx + S[1] * f1.nz < 0) S = [-S[0], -S[1]];
  // esquina K: cruce de las dos paredes
  const d1 = [f1.b[0] - f1.a[0], f1.b[1] - f1.a[1]], d2 = [f2.b[0] - f2.a[0], f2.b[1] - f2.a[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  const t1 = ((f2.a[0] - f1.a[0]) * d2[1] - (f2.a[1] - f1.a[1]) * d2[0]) / den;
  const K = [f1.a[0] + d1[0] * t1, f1.a[1] + d1[1] * t1];
  const largoDer = Math.max(...v1.contorno.map((p) => (p[0] - K[0]) * S[0] + (p[1] - K[1]) * S[1]));
  const P = (a, b) => [K[0] + W[0] * a + S[0] * b, K[1] + W[1] * a + S[1] * b];
  const angW = Math.atan2(-W[1], W[0]), angS = Math.atan2(-S[1], S[0]);
  // pieza a lo largo de la pared izquierda (largo en W) o de la derecha (largo en S)
  const pieza = (w, h, d, mat, a, b, y, porS = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); const [x, z] = P(a, b);
    m.position.set(x, y, z); m.rotation.y = porS ? angS : angW; m.castShadow = !liviano; m.receiveShadow = true; grupo.add(m); return m;
  };
  const plano = (pts, mat, y, uv = 1) => {   // polígono en el suelo (a, b)
    const forma = new THREE.Shape(pts.map(([a, b]) => { const [x, z] = P(a, b); return new THREE.Vector2(x, -z); }));
    const g = new THREE.ShapeGeometry(forma); g.rotateX(-Math.PI / 2);
    const uvs = g.attributes.uv; for (let k = 0; k < uvs.count; k++) uvs.setXY(k, uvs.getX(k) / uv, uvs.getY(k) / uv);
    const m = new THREE.Mesh(g, mat); m.position.y = y; m.receiveShadow = true; grupo.add(m); return m;
  };
  const negro = new THREE.MeshStandardMaterial({ color: 0x202326, roughness: 0.45, metalness: 0.35 });
  const vidrioO = new THREE.MeshStandardMaterial({ color: 0x33414c, roughness: 0.1, metalness: 0.4 });
  const blancoA = new THREE.MeshStandardMaterial({ color: 0xf1f1ed, roughness: 0.7 });
  const blancoP = new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.9 });
  const concretoG = new THREE.MeshStandardMaterial({ color: 0xa3a19b, roughness: 0.95 });
  const rojizo = new THREE.MeshStandardMaterial({ color: 0x8a5a48, roughness: 0.95 });
  // plaza de adoquín en espiga, con cordón rojizo del lado del zacate
  const espiga = new THREE.MeshStandardMaterial({ map: texturaEspiga(), roughness: 0.95 });
  const plaza = [[0, 0], [3.0, 0], [3.0, 1.5], [10.6, 12.8], [-0.2, 12.8], [-0.2, largoDer]];   // sin montarse en la acera
  plano(plaza, espiga, 0.08, 3.2);
  const cordon = (pa, pb) => {
    const L = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]); const m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.14, 0.25), rojizo);
    const [xa, za] = P(...pa), [xb, zb] = P(...pb);
    m.position.set((xa + xb) / 2, 0.08, (za + zb) / 2); m.rotation.y = Math.atan2(-(zb - za), xb - xa); grupo.add(m);
  };
  cordon([3.0, 1.5], [10.6, 12.8]);
  cordon([3.0, 0.1], [3.0, 1.5]);
  // a la izquierda: acera junto a la pared y jardín de piedras con macetas hasta el cordón
  pieza(9.0, 0.14, 1.5, concretoG, 7.5, 0.75, 0.07);
  plano([[3.3, 1.6], [12.0, 1.6], [12.0, 6.0], [6.0, 6.0]], new THREE.MeshStandardMaterial({ color: 0x5b4b3d, roughness: 1 }), 0.06);
  const piedra = new THREE.MeshStandardMaterial({ color: 0xb9b5aa, roughness: 0.9 });
  for (const [a, b] of [[4.4, 1.9], [5.6, 2.0], [7.0, 2.6], [8.6, 2.1], [9.8, 3.4], [6.6, 4.2], [10.8, 5.1], [8.0, 4.9]]) {
    const pr = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), piedra); const [x, z] = P(a, b);
    pr.position.set(x, 0.08, z); pr.scale.y = 0.55; grupo.add(pr);
  }
  const maceta = new THREE.MeshStandardMaterial({ color: 0x2c4f8a, roughness: 0.6 }), hoja = new THREE.MeshLambertMaterial({ color: 0x4f7f3a });
  for (const [a, b, h] of [[5.2, 2.4, 0.6], [7.6, 1.9, 0.8], [10.2, 2.3, 0.7], [9.0, 3.9, 0.9]]) {
    const [x, z] = P(a, b);
    const mc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.32, 10), maceta); mc.position.set(x, 0.22, z); grupo.add(mc);
    for (let k = 0; k < 6; k++) {
      const hj = new THREE.Mesh(new THREE.ConeGeometry(0.05, h, 4), hoja);
      hj.position.set(x + Math.cos(k) * 0.08, 0.38 + h / 2, z + Math.sin(k) * 0.08); hj.rotation.set(Math.sin(k * 2.3) * 0.5, 0, Math.cos(k * 1.7) * 0.5); grupo.add(hj);
    }
  }
  // dos aires acondicionados sobre la acera, contra la pared blanca
  for (const [a, w, h] of [[4.6, 0.95, 0.75], [6.2, 0.8, 0.6]]) {
    pieza(w, h, 0.34, blancoA, a, 0.3, 0.14 + h / 2);
    const aspa = new THREE.Mesh(new THREE.CircleGeometry(h * 0.33, 14), new THREE.MeshStandardMaterial({ color: 0x55595d, roughness: 0.6 }));
    const [x, z] = P(a - w * 0.12, 0.48); aspa.position.set(x, 0.14 + h / 2, z); aspa.rotation.y = Math.atan2(S[0], S[1]); grupo.add(aspa);
  }
  // pared blanca bajo las ventanas (izquierda), sobre un zócalo gris
  pieza(9.0, 1.15, 0.08, blancoP, 7.5, 0.05, 0.85);
  pieza(9.0, 0.3, 0.1, concretoG, 7.5, 0.06, 0.15);
  // puertas de vidrio con marco negro, una en cada pared, y columna negra en la esquina
  for (const porS of [false, true]) {
    const [a, b] = porS ? [0.06, 1.5] : [1.5, 0.06];
    pieza(2.2, 2.45, 0.06, vidrioO, a, b, 1.22, porS);
    for (const k of [-1.1, 0, 1.1]) pieza(0.08, 2.5, 0.1, negro, porS ? a : a + k, porS ? b + k : b, 1.25, porS);
    pieza(2.3, 0.1, 0.1, negro, a, b, 2.48, porS); pieza(2.3, 0.08, 0.1, negro, a, b, 0.04, porS);
    pieza(2.3, 0.45, 0.06, negro, a, b, 2.75, porS);   // franja oscura sobre la puerta
  }
  pieza(0.3, 3.0, 0.3, negro, 0.15, 0.15, 1.5);
  // rótulo «BIBLIOTECA» sobre las puertas, mirando a la plaza
  const rot = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.26), new THREE.MeshBasicMaterial({ map: texturaDibujada(400, 104, (x, w, h) => {
    x.fillStyle = "#1f3f8f"; x.fillRect(0, 0, w, h); x.fillStyle = "#ffffff"; x.fillRect(6, 6, w - 12, h - 12);
    x.fillStyle = "#1f3f8f"; x.font = `700 58px ${LETRA_ROTULO}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("BIBLIOTECA", w / 2, h / 2 + 3);
  }) }));
  { const [x, z] = P(0.55, 0.55); rot.position.set(x, 2.68, z); rot.rotation.y = Math.atan2(W[0] + S[0], W[1] + S[1]); grupo.add(rot); }
  // alero blanco que corre por las dos paredes (cielo claro y canoa al frente) y remates colgantes en las puntas
  const altoA = 3.05, voladizo = 1.6;
  pieza(9.5, 0.12, voladizo, blancoA, 4.75, voladizo / 2, altoA);
  pieza(9.5, 0.42, 0.12, blancoA, 4.75, voladizo, altoA + 0.1);
  pieza(largoDer, 0.12, voladizo, blancoA, voladizo / 2, largoDer / 2, altoA, true);
  pieza(largoDer, 0.42, 0.12, blancoA, voladizo, largoDer / 2, altoA + 0.1, true);
  pieza(0.16, 0.3, 0.16, blancoA, 9.35, voladizo - 0.1, altoA - 0.25);
  pieza(0.16, 0.3, 0.16, blancoA, voladizo - 0.1, largoDer - 0.15, altoA - 0.25, true);
  // a la derecha: tres basureros (azul, gris, negro) con su rótulo en un marco
  const bote = (color, b) => pieza(0.5, 0.9, 0.55, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), 0.45, b, 0.53, true);
  bote(0x1f5fb4, 3.0); bote(0x5b5f63, 3.55); bote(0x1f2224, 4.1);
  pieza(1.7, 0.4, 0.04, new THREE.MeshStandardMaterial({ color: 0x3a6a5a, roughness: 0.6 }), 0.25, 3.55, 1.45, true);
  for (const b of [2.75, 4.35]) pieza(0.05, 1.7, 0.05, negro, 0.25, b, 0.85, true);
}

// Fachada sur del edificio 26 (fotos, representativa): de oeste a este, el ala de los laboratorios con el piso de
// abajo de vidrio oscuro y arriba una banda de ventanas oscuras con una fila de ventanitas cuadradas encima; un cuerpo
// de vidrio claro; el paso que atraviesa el edificio (abierto abajo, con su alerito gris y bajantes rojos); la torre
// blanca con una columna de ventanitas cuadradas con marco gris; y el ala del este con vidrio abajo y arriba, con la
// cercha de acero en la parte alta. Al frente, la acera al paso con su guía amarilla y lámparas de poste
function fachada26(grupo, vol, alto, pisos, { frente = [0, 1], paso_x: pasoX = null } = {}) {
  const f = fachadaMirando(vol.contorno, frente);
  let a = f.a, b = f.b;
  if (b[0] < a[0]) [a, b] = [b, a];   // a: punta oeste
  const L = f.largo, ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, ang = Math.atan2(-uz, ux);
  const en = (u, v, y) => [a[0] + ux * u + f.nx * v, y, a[1] + uz * u + f.nz * v];
  const pieza = (w, h, d, mat, u, v, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(...en(u, v, y)); m.rotation.y = ang; m.castShadow = !liviano; m.receiveShadow = true; grupo.add(m); return m; };
  const P = alto / pisos;
  const blancoF = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.85 });
  const grisF = new THREE.MeshStandardMaterial({ color: 0x5b6268, roughness: 0.6, metalness: 0.2 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.15, metalness: 0.4 });
  const claro = new THREE.MeshStandardMaterial({ color: 0x7f97a3, roughness: 0.1, metalness: 0.3 });
  const marco = new THREE.MeshStandardMaterial({ color: 0x8b9094, roughness: 0.8 });
  const rojo = new THREE.MeshStandardMaterial({ color: 0xb3262c, roughness: 0.5 });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xd9ad2b, roughness: 0.8 });
  const v0 = 0.12;   // todo un poco por delante de la pared
  const montantes = (u0, u1, y0, h, paso) => { for (let u = u0; u <= u1 + 1e-6; u += paso) pieza(0.07, h, 0.05, grisF, u, v0 + 0.06, y0 + h / 2); };
  const s_ = L / 26;   // las medidas van pensadas para 26 m de largo
  // (anotaciones) el paso queda en línea con la pasarela que une 25 y 26 (paso_x: su x)
  const uPc = pasoX == null ? 14 * s_ : (pasoX - a[0]) / ux;
  const W0 = 0, C1 = uPc - 1.5, P1 = uPc + 1.5, W1 = C1 - 2 * s_, T1 = P1 + 3 * s_, E1 = L;
  // ala oeste: abajo vidrio oscuro; arriba antepecho blanco, ventanas oscuras y ventanitas cuadradas
  pieza(W1 - W0, P - 0.6, 0.06, negro, (W0 + W1) / 2, v0, 0.3 + (P - 0.6) / 2); montantes(W0 + 0.3, W1 - 0.3, 0.3, P - 0.6, 1.4);
  pieza(W1 - W0, 0.25, 0.3, grisF, (W0 + W1) / 2, v0 + 0.1, P - 0.1);
  pieza(W1 - W0, 0.9, 0.08, blancoF, (W0 + W1) / 2, v0, P + 0.45);
  pieza(W1 - W0 - 0.6, P - 1.9, 0.06, negro, (W0 + W1) / 2, v0 + 0.02, P + 0.9 + (P - 1.9) / 2); montantes(W0 + 0.3, W1 - 0.3, P + 0.9, P - 1.9, 1.0);
  pieza(W1 - W0, 0.55, 0.06, blancoF, (W0 + W1) / 2, v0, alto - 0.65);
  for (let u = W0 + 0.6; u < W1 - 0.3; u += 0.65) pieza(0.4, 0.36, 0.05, negro, u, v0 + 0.03, alto - 0.65);
  // cuerpo de vidrio claro, los dos pisos
  pieza(C1 - W1, alto - 0.6, 0.06, claro, (W1 + C1) / 2, v0, 0.3 + (alto - 0.6) / 2); montantes(W1, C1, 0.3, alto - 0.6, (C1 - W1) / 2);
  pieza(C1 - W1, 0.18, 0.08, grisF, (W1 + C1) / 2, v0 + 0.03, P);
  // paso que atraviesa el edificio: vano oscuro abajo, alerito gris volado, bajantes rojos a los lados
  pieza(P1 - C1, P - 0.1, 0.1, new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.9 }), (C1 + P1) / 2, v0 + 0.02, (P - 0.1) / 2);
  pieza(P1 - C1 + 0.4, 0.14, 1.6, grisF, (C1 + P1) / 2, v0 + 0.8, P - 0.1);
  for (let k = 0; k < 4; k++) pieza(0.08, 0.14, 1.4, marco, C1 + 0.3 + k * (P1 - C1 - 0.6) / 3, v0 + 0.8, P - 0.25);
  // arriba también abierto: es solo pasillo, vacío de lado a lado
  pieza(P1 - C1, P - 0.2, 0.1, new THREE.MeshStandardMaterial({ color: 0x2a2f33, roughness: 0.9 }), (C1 + P1) / 2, v0 + 0.02, P + (P - 0.2) / 2);
  for (const u of [C1 + 0.15, P1 - 0.15]) pieza(0.1, alto, 0.1, rojo, u, v0 + 0.12, alto / 2);
  // torre blanca con columna de ventanitas cuadradas
  pieza(T1 - P1, alto + 0.3, 0.4, blancoF, (P1 + T1) / 2, v0 + 0.15, (alto + 0.3) / 2);
  for (let k = 0; k < 5; k++) {
    const y = 0.9 + k * (alto - 1.4) / 4;
    pieza(0.75, 0.75, 0.08, marco, (P1 + T1) / 2, v0 + 0.37, y);
    pieza(0.45, 0.45, 0.06, negro, (P1 + T1) / 2, v0 + 0.4, y);
  }
  // ala este: vidrio oscuro abajo y arriba, ventanitas, cercha de acero en lo alto
  pieza(E1 - T1, P - 0.6, 0.06, negro, (T1 + E1) / 2, v0, 0.3 + (P - 0.6) / 2); montantes(T1 + 0.3, E1 - 0.3, 0.3, P - 0.6, 1.4);
  pieza(E1 - T1, 0.6, 0.08, blancoF, (T1 + E1) / 2, v0, P + 0.3);
  pieza(E1 - T1, P - 1.9, 0.06, negro, (T1 + E1) / 2, v0 + 0.02, P + 0.6 + (P - 1.9) / 2); montantes(T1 + 0.3, E1 - 0.3, P + 0.6, P - 1.9, 1.1);
  for (let u = T1 + 0.5; u < E1 - 0.3; u += 0.65) pieza(0.4, 0.36, 0.05, negro, u, v0 + 0.03, alto - 0.95);
  const yC = alto - 0.35, nC = Math.max(2, Math.round((E1 - T1) / 2.2)), pasoC = (E1 - T1) / nC;
  pieza(E1 - T1, 0.08, 0.08, grisF, (T1 + E1) / 2, v0 + 0.1, yC + 0.25); pieza(E1 - T1, 0.08, 0.08, grisF, (T1 + E1) / 2, v0 + 0.1, yC - 0.25);
  for (let k = 0; k < nC; k++) {
    const d = pieza(Math.hypot(pasoC, 0.5), 0.06, 0.06, grisF, T1 + pasoC * (k + 0.5), v0 + 0.1, yC);
    d.rotation.set(0, ang, (k % 2 ? 1 : -1) * Math.atan2(0.5, pasoC), "YXZ");
  }
  // acera al paso con guía amarilla, y lámparas de poste
  const uP = (C1 + P1) / 2;
  pieza(P1 - C1 + 0.6, 0.06, 7, new THREE.MeshStandardMaterial({ color: 0xbab7b0, roughness: 0.95 }), uP, 3.6, 0.03);
  pieza(0.35, 0.02, 7, amarillo, uP + 0.5, 3.6, 0.07);
  const posteL = new THREE.MeshStandardMaterial({ color: 0xc7cacc, roughness: 0.5, metalness: 0.3 });
  for (const [u, v] of [[C1 - 1.2, 2.8], [P1 + 0.9, 5.5], [W1 - 4, 1.2]]) {
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 10), posteL); pl.position.set(...en(u, v, 0.55)); grupo.add(pl);
  }
}

// Máquinas de ejercicio al aire libre (foto junto a los baños de la piscina): tubos azules con piezas amarillas,
// cada una sobre su base de concreto. El frente (donde se sube la persona) mira a +z local
function maquinaEjercicio(tipo) {
  const g = new THREE.Group();
  const azul = new THREE.MeshStandardMaterial({ color: 0x2f5fb0, roughness: 0.45, metalness: 0.3 });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xe8c04a, roughness: 0.6 });
  const concreto = new THREE.MeshStandardMaterial({ color: 0x9d9a92, roughness: 0.95 });
  const tubo = (x0, y0, z0, x1, y1, z1, r, m = azul) => {   // tubo recto de un punto a otro
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), L = a.distanceTo(b);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 8), m);
    t.position.copy(a).add(b).multiplyScalar(0.5);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(t);
  };
  const caja = (w, h, d, m, x, y, z, rx = 0) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); c.position.set(x, y, z); c.rotation.x = rx; g.add(c); };
  const base = (w, d) => caja(w, 0.12, d, concreto, 0, 0.06, 0);
  if (tipo === "press") {   // poste central alto, arco arriba y dos asientos con respaldo, uno a cada lado
    base(1.6, 0.9);
    tubo(0, 0, 0, 0, 2.3, 0, 0.09);
    tubo(-0.55, 2.25, 0, 0.55, 2.25, 0, 0.05); tubo(-0.55, 2.25, 0, -0.55, 2.05, 0, 0.05); tubo(0.55, 2.25, 0, 0.55, 2.05, 0, 0.05);
    for (const s of [-1, 1]) {
      tubo(0, 0.45, 0, s * 0.75, 0.45, 0, 0.04, amarillo);
      caja(0.42, 0.06, 0.4, amarillo, s * 0.75, 0.5, 0.1);                 // asiento
      caja(0.4, 0.5, 0.06, amarillo, s * 0.75, 0.85, -0.14, -0.12);       // respaldo
      tubo(s * 0.55, 1.5, 0, s * 0.75, 1.2, 0.45, 0.03, amarillo);         // brazo
      tubo(s * 0.75, 1.2, 0.45, s * 0.75, 0.9, 0.5, 0.03, amarillo);       // mango
    }
  } else if (tipo === "pendulo") {   // poste con manubrio arriba y dos pedales que cuelgan
    base(1.0, 1.0);
    tubo(0, 0, 0, 0, 1.6, 0, 0.08);
    tubo(-0.3, 1.55, 0.12, 0.3, 1.55, 0.12, 0.03);
    for (const s of [-1, 1]) { tubo(s * 0.12, 1.2, 0.05, s * 0.18, 0.25, 0.08, 0.03, amarillo); caja(0.22, 0.04, 0.32, amarillo, s * 0.18, 0.22, 0.1); }
  } else if (tipo === "caminadora") {   // marco horizontal sobre dos postes, con dos pares de piernas colgantes
    base(1.8, 0.8);
    tubo(-0.7, 0, 0, -0.7, 1.45, 0, 0.07); tubo(0.7, 0, 0, 0.7, 1.45, 0, 0.07);
    tubo(-0.85, 1.45, 0, 0.85, 1.45, 0, 0.06); tubo(-0.85, 1.25, 0.25, 0.85, 1.25, 0.25, 0.04);
    for (const s of [-1, 1]) for (const d of [-0.12, 0.12]) { tubo(s * 0.35 + d, 1.4, 0, s * 0.35 + d * 1.4, 0.35, 0.05, 0.03); }
    for (const s of [-1, 1]) caja(0.4, 0.04, 0.3, amarillo, s * 0.35, 0.33, 0.05);
  } else if (tipo === "rueda") {   // rueda de hombros amarilla en un poste y al lado el asiento de piernas
    base(2.2, 0.9);
    tubo(-0.6, 0, 0, -0.6, 1.5, 0, 0.08);
    const rueda = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 24), amarillo); rueda.position.set(-0.6, 1.55, 0.12); g.add(rueda);
    for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.025), amarillo); r.position.set(-0.6, 1.55, 0.12); r.rotation.z = (k * Math.PI) / 4; g.add(r); }
    tubo(0.5, 0, 0, 0.5, 0.7, 0, 0.07);
    caja(0.45, 0.06, 0.45, amarillo, 0.5, 0.55, 0.05); caja(0.45, 0.45, 0.06, amarillo, 0.5, 0.85, -0.2, -0.25);
    tubo(0.5, 0.45, 0.2, 0.5, 0.25, 0.65, 0.04, amarillo); caja(0.4, 0.05, 0.12, amarillo, 0.5, 0.25, 0.68);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
  return g;
}

// Coordinación de Docencia (edificio 4, fotos de nov. 2026): paredes blancas con ventanas altas de reja negra en
// cada cara. En la cara donde llega el pasillo techado (puerta), puertas dobles de vidrio con marco de aluminio,
// rótulo azul «Coordinación de Docencia» encima, ventanas de reja a los lados, bajante blanco y una condensadora;
// la guía táctil amarilla sigue hasta la puerta. El Punto Verde va aparte, en el piso del pasillo (puntoVerde()). En la cara de la ventanilla, el ventanal grande de reja con la ventanilla de atención, la pizarra
// de avisos, el dispensador de agua, el mueble de madera bajo la ventana, la banca negra de metal, las
// condensadoras y una maceta. El corredor perimetral es de concreto con la guía amarilla cerca de la orilla.
const GIRO_MECEDORA = 1.0;
function docencia(grupo, vol, alto, { puerta = [0.5, 0.87], ventanilla = [1, 0], casilleros = null } = {}, alero = 2.8) {
  const c = vol.contorno;
  const reja = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.6, metalness: 0.3 });
  const oscuroV = new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.2, metalness: 0.3 });
  const aluminio = new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.45, metalness: 0.15 });
  const crema = new THREE.MeshStandardMaterial({ color: 0xdcd8cc, roughness: 0.7 });
  const madera = new THREE.MeshStandardMaterial({ color: 0x9a6b3c, roughness: 0.7 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.5, metalness: 0.3 });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xe0b52a, roughness: 0.8 });
  const caraDe = (frente) => {
    const f = fachadaMirando(c, frente), ux = (f.b[0] - f.a[0]) / f.largo, uz = (f.b[1] - f.a[1]) / f.largo;
    const mx = (f.a[0] + f.b[0]) / 2, mz = (f.a[1] + f.b[1]) / 2, ang = Math.atan2(f.nx, f.nz);
    // u: a lo largo de la cara desde el centro (positivo hacia la derecha de quien la mira), v: hacia afuera
    const s = ux * f.nz - uz * f.nx > 0 ? 1 : -1;
    const en = (u, v, y) => [mx + ux * u * s + f.nx * v, y, mz + uz * u * s + f.nz * v];
    const pieza = (w, h, d, m, u, v, y, giro = 0) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); p.position.set(...en(u, v, y)); p.rotation.y = ang + giro;
      p.castShadow = !liviano; p.receiveShadow = true; grupo.add(p); return p;
    };
    return { f, en, pieza, ang, L: f.largo };
  };
  const cartel = (ancho, alto_, dibujar, w = 512) => {   // textura de canvas para rótulos y avisos
    const cv = document.createElement("canvas"); cv.width = w; cv.height = Math.round((w * alto_) / ancho);
    dibujar(cv.getContext("2d"), cv.width, cv.height);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex });
  };
  // ventana alta con reja negra: vidrio oscuro, marco y barrotes verticales con dos travesaños
  const ventanaReja = (K, u, ancho, y0, h) => {
    K.pieza(ancho, h, 0.04, oscuroV, u, 0.03, y0 + h / 2);
    K.pieza(ancho + 0.12, 0.06, 0.1, reja, u, 0.08, y0); K.pieza(ancho + 0.12, 0.06, 0.1, reja, u, 0.08, y0 + h);
    K.pieza(0.06, h, 0.1, reja, u - ancho / 2, 0.08, y0 + h / 2); K.pieza(0.06, h, 0.1, reja, u + ancho / 2, 0.08, y0 + h / 2);
    const n = Math.max(2, Math.round(ancho / 0.14));
    for (let k = 1; k < n; k++) K.pieza(0.025, h, 0.025, reja, u - ancho / 2 + (ancho * k) / n, 0.1, y0 + h / 2);
    for (const t of [0.33, 0.66]) K.pieza(ancho, 0.03, 0.03, reja, u, 0.1, y0 + h * t);
  };
  const condensadora = (K, u, v) => {
    K.pieza(0.9, 0.62, 0.34, new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.6 }), u, v, 0.33);
    K.pieza(0.5, 0.5, 0.02, new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.8 }), u - 0.12, v + 0.18, 0.34);
    K.pieza(0.8, 0.04, 0.4, negro, u, v, 0.02);
  };
  const cPuerta = fachadaMirando(c, puerta), cVent = fachadaMirando(c, ventanilla), cCas = casilleros && fachadaMirando(c, casilleros);
  const mismaCara = (f, g) => f.a === g.a && f.b === g.b;
  const caras = [];
  for (let i = 0; i < c.length; i++) {   // una dirección hacia afuera por cara, para recorrerlas todas
    const a = c[i], b = c[(i + 1) % c.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    caras.push([(b[1] - a[1]) / L, -(b[0] - a[0]) / L]);
  }
  for (const n of caras) {
    const K = caraDe(n);
    if (mismaCara(K.f, cPuerta) || mismaCara(K.f, cVent) || (cCas && mismaCara(K.f, cCas))) continue;
    // caras sin detalle: dos ventanas altas con reja
    for (const u of [-K.L * 0.24, K.L * 0.24]) ventanaReja(K, u, Math.min(2.4, K.L * 0.3), alto * 0.5, alto * 0.24);
  }

  // --- cara de la puerta
  const P = caraDe(puerta), anchoP = 1.7, altoP = 2.25;
  P.pieza(anchoP + 0.3, altoP + 0.15, 0.08, aluminio, 0, 0.04, (altoP + 0.15) / 2);   // marco
  for (const lado of [-1, 1]) {
    P.pieza(anchoP / 2 - 0.1, altoP - 0.2, 0.05, oscuroV, lado * anchoP / 4, 0.09, altoP / 2);   // hojas de vidrio
    P.pieza(0.04, 0.35, 0.06, aluminio, lado * 0.12, 0.13, 1.05);                               // haladeras
  }
  P.pieza(0.05, altoP, 0.07, aluminio, 0, 0.1, altoP / 2);
  P.pieza(0.42, 0.14, 0.02, cartel(0.42, 0.14, (x, w, h) => { x.fillStyle = "#1f4f9a"; x.fillRect(0, 0, w, h); x.fillStyle = "#fff"; x.font = `700 ${h * 0.7}px Arial, sans-serif`; x.textAlign = "center"; x.fillText("HALE", w / 2, h * 0.78); }, 128),
    -anchoP / 4, 0.12, 1.25);
  // persiana de aluminio sobre la puerta con el rótulo azul
  P.pieza(anchoP + 0.3, alto - altoP - 0.55, 0.06, aluminio, 0, 0.04, altoP + 0.15 + (alto - altoP - 0.55) / 2);
  for (let k = 0; k < 5; k++) P.pieza(anchoP + 0.3, 0.02, 0.08, new THREE.MeshStandardMaterial({ color: 0x8f969b }), 0, 0.06, altoP + 0.3 + k * 0.2);
  P.pieza(1.25, 0.42, 0.03, cartel(1.25, 0.42, (x, w, h) => {
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h); x.fillStyle = "#1d4f9c"; x.fillRect(8, 8, w - 16, h - 16);
    x.fillStyle = "#ffffff"; x.textAlign = "center"; x.font = `700 ${h * 0.26}px Arial, sans-serif`;
    x.fillText("COORDINACIÓN", w / 2, h * 0.45); x.fillText("DE DOCENCIA", w / 2, h * 0.78);
  }), 0, 0.12, altoP + 0.5);
  for (const lado of [-1, 1]) ventanaReja(P, lado * (anchoP / 2 + 1.6), 2.3, alto * 0.62, alto * 0.2);
  // bajante blanco a la izquierda, condensadora a la derecha, aviso pegado en la pared
  P.pieza(0.12, alto, 0.12, new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 }), -(anchoP / 2 + 0.55), 0.15, alto / 2);
  condensadora(P, P.L / 2 - 1.1, 0.35);
  P.pieza(0.4, 0.55, 0.02, cartel(0.4, 0.55, (x, w, h) => { x.fillStyle = "#f2f0e6"; x.fillRect(0, 0, w, h); x.fillStyle = "#e8c32c"; x.fillRect(0, 0, w, h * 0.25); x.fillStyle = "#555"; for (let k = 0; k < 8; k++) x.fillRect(w * 0.1, h * (0.35 + k * 0.07), w * (0.5 + (k % 3) * 0.12), h * 0.025); }, 128),
    P.L / 2 - 0.7, 0.03, 1.7);
  // guía táctil desde el pasillo hasta la puerta, atravesando el corredor
  P.pieza(0.36, 0.014, alero - 0.15, amarillo, 0, (alero - 0.15) / 2, 0.075);   // solo sobre el corredor
  // --- cara de la ventanilla
  const V = caraDe(ventanilla), uV = 0.9, anchoV = 3.0;
  ventanaReja(V, uV, anchoV, 0.95, alto * 0.42);
  V.pieza(anchoV + 0.2, 0.08, 0.3, crema, uV, 0.12, 0.92);   // repisa
  V.pieza(0.85, 0.55, 0.05, new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.3 }), uV - 0.5, 0.06, 1.25);   // ventanilla de atención
  // guirnalda navideña sobre el ventanal (nov.–dic.)
  V.pieza(anchoV, 0.12, 0.1, new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.9 }), uV, 0.16, 0.95 + alto * 0.42 - 0.05);
  for (let k = 0; k < 5; k++) V.pieza(0.2, 0.2, 0.05, new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.7 }), uV - anchoV / 2 + 0.3 + k * (anchoV - 0.6) / 4, 0.2, 0.95 + alto * 0.42 - 0.08);
  ventanaReja(V, -V.L / 2 + 0.7, 0.9, alto * 0.6, alto * 0.22);   // ventanita de la esquina
  // mueble de madera bajo el ventanal, banca negra de metal y condensadora al fondo
  V.pieza(1.3, 0.75, 0.6, madera, uV - 0.6, 0.45, 0.42); V.pieza(1.4, 0.05, 0.68, new THREE.MeshStandardMaterial({ color: 0xb98c5a }), uV - 0.6, 0.45, 0.82);
  const banca = new THREE.Group();
  for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 0.08), negro); t.position.set(0, 0.45, -0.18 + k * 0.12); banca.add(t); }
  for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.03), negro); t.position.set(0, 0.6 + k * 0.12, -0.24); t.rotation.x = -0.12; banca.add(t); }
  for (const s of [-0.6, 0.6]) for (const d of [-0.18, 0.18]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), negro); p.position.set(s, 0.22, d); banca.add(p); }
  banca.position.set(...V.en(uV + 1.3, 0.65, 0)); banca.rotation.y = V.ang; banca.traverse((o) => { o.castShadow = !liviano; }); grupo.add(banca);
  condensadora(V, uV + 2.4, 0.3);
  // a la izquierda: dispensador de agua, pizarra de avisos, aviso amarillo, condensadora y maceta
  V.pieza(0.34, 1.0, 0.34, new THREE.MeshStandardMaterial({ color: 0xd9d6cd, roughness: 0.6 }), -1.2, 0.25, 0.5);
  V.pieza(0.24, 0.12, 0.02, new THREE.MeshStandardMaterial({ color: 0x2f9fb0, roughness: 0.5 }), -1.2, 0.43, 0.92);
  V.pieza(1.5, 0.95, 0.03, cartel(1.5, 0.95, (x, w, h) => {
    x.fillStyle = "#f4f2ea"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#6c3a8f"; x.fillRect(w * 0.3, h * 0.04, w * 0.48, h * 0.62);
    x.fillStyle = "#fff"; x.font = `700 ${h * 0.09}px Arial, sans-serif`; x.textAlign = "left";
    ["Espacio", "libre de", "acoso", "sexual"].forEach((t, k) => x.fillText(t, w * 0.33, h * (0.16 + k * 0.12)));
    x.fillStyle = "#2b3f6b"; x.fillRect(w * 0.79, h * 0.04, w * 0.18, h * 0.62);
    x.fillStyle = "#e8c32c"; x.fillRect(w * 0.02, h * 0.04, w * 0.25, h * 0.92);
    x.fillStyle = "#555"; for (let k = 0; k < 6; k++) x.fillRect(w * 0.05, h * (0.15 + k * 0.12), w * 0.18, h * 0.025);
  }), -2.0, 0.03, 1.55);
  V.pieza(0.42, 0.62, 0.02, cartel(0.42, 0.62, (x, w, h) => { x.fillStyle = "#f2f0e6"; x.fillRect(0, 0, w, h); x.fillStyle = "#e8b82a"; x.fillRect(0, 0, w, h * 0.18); x.fillStyle = "#555"; for (let k = 0; k < 9; k++) x.fillRect(w * 0.1, h * (0.26 + k * 0.07), w * 0.75, h * 0.025); }, 128),
    -3.2, 0.03, 1.6);
  condensadora(V, -V.L / 2 + 1.2, 0.35);
  V.pieza(0.45, 0.4, 0.45, new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.9 }), -2.6, 0.4, 0.2);
  const hojas = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.9, flatShading: true }));
  hojas.position.set(...V.en(-2.6, 0.4, 0.75)); hojas.scale.y = 0.8; grupo.add(hojas);

  // --- cara de los casilleros (fotos, nov. 2026): desde la esquina de la ventanilla, dos condensadoras una sobre otra
  // con el bajante blanco y una banca de metal con tablillas oscuras; la ventana de malla con un afiche, una mecedora
  // gris con cojín verde y una mesita redonda de madera con una mata y un cuadro; los casilleros beige con candados,
  // otra mecedora y una maceta con una mata alta. En la orilla del corredor, baranda azul
  if (cCas) {
    const K = caraDe(casilleros), gris = new THREE.MeshStandardMaterial({ color: 0x5d6166, roughness: 0.5 });
    const beige = new THREE.MeshStandardMaterial({ color: 0xc9c2ad, roughness: 0.6, metalness: 0.2 });
    // banca (las condensadoras apiladas y el bajante se quitaron, anotaciones)
    const banca = (u, v) => {
      const b = new THREE.Group();
      for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.11), new THREE.MeshStandardMaterial({ color: 0x3a2c26, roughness: 0.6 })); t.position.set(0, 0.45, -0.15 + k * 0.14); b.add(t); }
      for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.03), new THREE.MeshStandardMaterial({ color: 0x3a2c26, roughness: 0.6 })); t.position.set(0, 0.62 + k * 0.14, -0.24); b.add(t); }
      for (const sx of [-0.6, 0.6]) {
        for (const d of [-0.2, 0.18]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), negro); pata.position.set(sx, 0.22, d); b.add(pata); }
        const brazo = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.45), negro); brazo.position.set(sx, 0.68, -0.02); b.add(brazo);
        const resp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), negro); resp.position.set(sx, 0.75, -0.24); b.add(resp);
      }
      b.position.set(...K.en(u, v, 0)); b.rotation.y = K.ang; b.traverse((o) => { o.castShadow = !liviano; }); grupo.add(b);
    };
    banca(-K.L / 2 + 2.1, 0.4);   // (anotaciones) un poco más hacia la esquina de la ventanilla
    condensadora(K, -K.L / 2 + 0.75, 0.35);   // (anotaciones) un aire en cada punta de la cara
    condensadora(K, K.L / 2 + 0.3, 0.45);
    // mecedora: concha gris de malla sobre dos patines curvos, con cojín verde
    const mecedora = (u, v, giro) => {
      const m = new THREE.Group();
      const concha = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), gris);
      concha.material = new THREE.MeshStandardMaterial({ color: 0x5d6166, roughness: 0.5, side: THREE.DoubleSide });
      concha.rotation.x = Math.PI - 0.5; concha.position.set(0, 0.62, -0.05); m.add(concha);
      const cojin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.4), new THREE.MeshStandardMaterial({ color: 0x9ccf4e, roughness: 0.9 })); cojin.position.set(0, 0.48, 0.05); cojin.rotation.x = -0.25; m.add(cojin);
      for (const sx of [-0.28, 0.28]) {
        const patin = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 6, 16, 0.9), gris); patin.rotation.set(0, Math.PI / 2, 0); patin.position.set(sx, 0.92, 0); patin.rotation.z = Math.PI + 1.12; m.add(patin);
        for (const d of [-0.2, 0.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.03), gris); p.position.set(sx, 0.27, d); m.add(p); }
      }
      m.position.set(...K.en(u, v, 0)); m.rotation.y = K.ang + giro; m.traverse((o) => { o.castShadow = !liviano; }); grupo.add(m);
    };
    // ventana de malla con el afiche, mesita con mata y cuadro, mecedora
    ventanaReja(K, -0.2, 1.8, alto * 0.38, alto * 0.34);
    K.pieza(0.55, 0.75, 0.02, cartel(0.55, 0.75, (x, w, h) => {
      x.fillStyle = "#f4f6fb"; x.fillRect(0, 0, w, h); x.fillStyle = "#3a5fa8"; x.font = `700 ${h * 0.07}px Arial, sans-serif`; x.textAlign = "center";
      ["Siente", "Conecta", "Respira"].forEach((t, k) => x.fillText(t, w * (0.3 + (k % 2) * 0.4), h * (0.2 + k * 0.15)));
      x.fillStyle = "#e07a3a"; x.beginPath(); x.arc(w * 0.3, h * 0.78, w * 0.13, 0, 7); x.fill();
      x.fillStyle = "#2f6fb5"; x.beginPath(); x.arc(w * 0.7, h * 0.78, w * 0.13, 0, 7); x.fill();
    }, 128), -0.2 + 0.6, 0.14, alto * 0.38 + alto * 0.22);
    const madera = new THREE.MeshStandardMaterial({ color: 0xb08a5e, roughness: 0.7 });
    const uM = -1.15;   // (anotaciones) primero la mesita y luego la mecedora
    const mesita = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 18), madera); mesita.position.set(...K.en(uM, 0.4, 0.6)); grupo.add(mesita);
    for (let k = 0; k < 3; k++) { const a = (k * Math.PI * 2) / 3, p = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), negro); p.position.set(...K.en(uM + Math.cos(a) * 0.2, 0.4 + Math.sin(a) * 0.2, 0.3)); grupo.add(p); }
    K.pieza(0.14, 0.15, 0.14, new THREE.MeshStandardMaterial({ color: 0xf2f2ee }), uM + 0.1, 0.45, 0.69);
    const mata = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), new THREE.MeshStandardMaterial({ color: 0x3f7a3a, flatShading: true })); mata.position.set(...K.en(uM + 0.1, 0.45, 0.85)); grupo.add(mata);
    K.pieza(0.18, 0.22, 0.02, new THREE.MeshStandardMaterial({ color: 0xd8b24a }), uM - 0.13, 0.42, 0.72, 0.3);
    mecedora(-0.1, 0.8, GIRO_MECEDORA);   // volteada hacia la entrada (la esquina de la ventanilla y la puerta)
    // casilleros: dos columnas de cuerpos de tres puertas, con candados
    const uC = 2.85;   // (anotaciones) casilleros y maceta más hacia la punta norte
    for (const du of [-0.45, 0.45]) {
      K.pieza(0.88, 1.95, 0.5, beige, uC + du, 0.27, 1.0);
      for (let k = 0; k < 3; k++) {
        K.pieza(0.8, 0.02, 0.02, new THREE.MeshStandardMaterial({ color: 0x8e8774 }), uC + du, 0.53, 0.36 + k * 0.62);
        for (const dd of [-0.2, 0.2]) K.pieza(0.05, 0.08, 0.04, new THREE.MeshStandardMaterial({ color: 0xb9963c, metalness: 0.5 }), uC + du + dd, 0.54, 0.62 + k * 0.62);
      }
    }
    K.pieza(0.4, 0.38, 0.4, new THREE.MeshStandardMaterial({ color: 0xb4532f, roughness: 0.8 }), uC + 1.25, 0.35, 0.3);
    for (let k = 0; k < 6; k++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.02), new THREE.MeshStandardMaterial({ color: 0x3f8a3a })); h.position.set(...K.en(uC + 1.25, 0.35, 0.85));
      h.rotation.set((k % 3 - 1) * 0.4, K.ang + k, (k % 2 ? 1 : -1) * 0.35); grupo.add(h);
    }
    // baranda azul en la orilla del corredor
    const azul = new THREE.MeshStandardMaterial({ color: 0x2f5f8f, roughness: 0.5, metalness: 0.3 });
    K.pieza(K.L * 0.56, 0.06, 0.06, azul, 0, alero - 0.25, 0.95);
    for (const u of [-K.L * 0.28, 0, K.L * 0.28]) K.pieza(0.05, 0.95, 0.05, azul, u, alero - 0.25, 0.5);
  }

  // corredor perimetral: guía táctil amarilla cerca de la orilla, toda la vuelta
  const g = desplazar(c, alero - 0.75);
  for (let i = 0; i < g.length; i++) {
    const a = g[i], b = g[(i + 1) % g.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, L + 0.3), amarillo);
    t.position.set((a[0] + b[0]) / 2, 0.075, (a[1] + b[1]) / 2); t.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); t.receiveShadow = true; grupo.add(t);
  }
}

// Cara oeste del edificio 26 (foto): tres paneles altos de lámina blanca de lamas horizontales, curvos como velas y
// escalonados, que cubren el segundo piso; abajo, pilares blancos con ventanales de cuadrícula gris, una columna gris
// y lámparas de poste
function oeste26(grupo, vol, alto, pisos) {
  const f = fachadaMirando(vol.contorno, [-1, 0]);
  let a = f.a, b = f.b;
  if (b[1] < a[1]) [a, b] = [b, a];   // a: punta norte
  const L = f.largo, ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, ang = Math.atan2(-uz, ux);
  const en = (u, v, y) => [a[0] + ux * u + f.nx * v, y, a[1] + uz * u + f.nz * v];
  const pieza = (w, h, d, mat, u, v, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(...en(u, v, y)); m.rotation.y = ang; m.castShadow = !liviano; m.receiveShadow = true; grupo.add(m); return m; };
  const P = alto / pisos;
  const blancoF = new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.85 });
  const grisF = new THREE.MeshStandardMaterial({ color: 0x7c8387, roughness: 0.5, metalness: 0.3 });
  const negro = new THREE.MeshStandardMaterial({ color: 0x232a30, roughness: 0.15, metalness: 0.4 });
  // abajo: pilares blancos y ventanales con cuadrícula
  const yTop = P * 0.95;
  pieza(L, 0.9, 0.12, blancoF, L / 2, 0.1, 0.45);
  for (const [u0, u1] of [[0.4, L * 0.33], [L * 0.42, L * 0.62], [L * 0.7, L - 0.4]]) {
    pieza(u1 - u0, yTop - 0.9, 0.06, negro, (u0 + u1) / 2, 0.1, 0.9 + (yTop - 0.9) / 2);
    for (let u = u0; u <= u1 + 1e-6; u += (u1 - u0) / 3) pieza(0.06, yTop - 0.9, 0.06, grisF, u, 0.15, 0.9 + (yTop - 0.9) / 2);
    for (let k = 1; k < 4; k++) pieza(u1 - u0, 0.05, 0.06, grisF, (u0 + u1) / 2, 0.15, 0.9 + ((yTop - 0.9) * k) / 4);
  }
  for (const u of [L * 0.375, L * 0.66]) pieza(1.0, yTop, 0.5, blancoF, u, 0.2, yTop / 2);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, alto, 10), grisF); col.position.set(...en(L * 0.52, 1.1, alto / 2)); grupo.add(col);
  // arriba: tres velas de lamas, de P*0.8 hasta el techo, escalonadas hacia afuera
  const lamas = texturaDibujada(64, 256, (x, w, h) => {
    x.fillStyle = "#e9ecee"; x.fillRect(0, 0, w, h);
    for (let j = 0; j < h; j += 8) { x.fillStyle = "#b9bfc4"; x.fillRect(0, j, w, 3); }
  });
  lamas.wrapS = lamas.wrapT = THREE.RepeatWrapping; lamas.repeat.set(1, 3);
  const vela = new THREE.MeshStandardMaterial({ map: lamas, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
  const y0 = P * 0.8, h = alto + 0.4 - y0, ancho = L / 3 * 0.9;
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(ancho, h, 1, 12), pz = g.attributes.position;
    for (let k = 0; k < pz.count; k++) { const t = pz.getY(k) / h + 0.5; pz.setZ(k, Math.sin(Math.PI * t) * 1.1 + (1 - t) * 0.5); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, vela); m.position.set(...en(L * (i + 0.5) / 3, 0.9 + (i % 2) * 0.35, y0 + h / 2));
    m.rotation.y = Math.atan2(f.nx, f.nz); m.castShadow = !liviano; grupo.add(m);
    pieza(0.12, h, 0.12, grisF, L * (i + 1) / 3 - 0.05, 0.9, y0 + h / 2);
  }
  // lámparas de poste en el zacate
  const posteL = new THREE.MeshStandardMaterial({ color: 0x8e9599, roughness: 0.5, metalness: 0.3 });
  for (const u of [L * 0.3, L * 0.85]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 10), posteL); pl.position.set(...en(u, 2.2, 0.55)); grupo.add(pl); }
}

// Soda (fotos, nov. 2026). Entrada en la cara noroeste, donde llega el pasillo techado: vano abierto con la hoja
// de metal celeste abierta, adentro el piso claro, la refrigeradora roja y la vitrina; encima el rótulo «SODA UCR
// CARIBE» en letras doradas sobre la pared blanca y la guirnalda de «FELIZ NAVIDAD»; a la derecha los menús
// pegados, el rótulo de no fumar y el verde de SALIDA; a la izquierda un estante de metal oxidado. En la cara
// noreste, hacia el comedor, la puerta de metal celeste con su reja en medio de la pared
function soda(grupo, vol, alto, { entrada = [-0.63, -0.78], p_entrada = null, puerta = [0.78, -0.63] } = {}) {
  const c = vol.contorno;
  const caraEn = (frente, punto) => {
    const f = fachadaMirando(c, frente), ang = Math.atan2(f.nx, f.nz), T = [f.nz, -f.nx];
    let m = [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2];
    if (punto) {   // el punto de la cara más cercano al dado
      const k = (punto[0] - m[0]) * T[0] + (punto[1] - m[1]) * T[1];
      m = [m[0] + T[0] * k, m[1] + T[1] * k];
    }
    const en = (u, v, y) => [m[0] + T[0] * u + f.nx * v, y, m[1] + T[1] * u + f.nz * v];
    const pieza = (w, h, d, mat, u, v, y, giro = 0) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); p.position.set(...en(u, v, y)); p.rotation.y = ang + giro;
      p.castShadow = !liviano; p.receiveShadow = true; grupo.add(p); return p;
    };
    return { en, pieza, ang };
  };
  const plano = (K, w, h, u, v, y, dibujar, ancho = 512) => {
    const cv = document.createElement("canvas"); cv.width = ancho; cv.height = Math.max(16, Math.round((ancho * h) / w));
    dibujar(cv.getContext("2d"), cv.width, cv.height);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.position.set(...K.en(u, v, y)); m.rotation.y = K.ang; grupo.add(m); return m;
  };
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const blancoS = mat(0xf2f1ec), celesteM = mat(0x9cc3dd, { roughness: 0.5, metalness: 0.3 });

  // --- entrada
  const E = caraEn(entrada, p_entrada), W = 2.1, H = 2.35;
  E.pieza(W + 1.2, alto - 0.05, 0.1, blancoS, 0, 0.04, (alto - 0.05) / 2);                     // paño blanco de la fachada
  E.pieza(W, H, 0.06, mat(0xe9e4d6, { roughness: 0.9 }), 0, 0.06, H / 2);                       // fondo del local, iluminado
  E.pieza(W, 0.02, 1.0, mat(0xd7d2c4), 0, -0.4, 0.02);                                          // piso de adentro
  E.pieza(0.55, 1.9, 0.12, mat(0xb3262c, { roughness: 0.4 }), -0.55, 0.1, 0.95);                // refrigeradora roja
  E.pieza(0.45, 1.3, 0.04, mat(0xe8e6de), -0.55, 0.17, 1.0);                                    // su puerta con afiches
  E.pieza(0.8, 0.9, 0.12, mat(0xc6cbcf, { metalness: 0.4 }), 0.55, 0.1, 0.75);                  // vitrina
  E.pieza(0.75, 0.5, 0.06, mat(0xdfe7ea, { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.6 }), 0.55, 0.12, 1.45);
  for (const u of [-W / 2 - 0.04, W / 2 + 0.04]) E.pieza(0.08, H, 0.14, mat(0x8fb3cb), u, 0.1, H / 2);   // marco
  const hoja = E.pieza(0.95, H - 0.1, 0.05, celesteM, -W / 2 - 0.05, 0.6, H / 2, -1.25);        // hoja abierta hacia afuera
  hoja.position.set(...E.en(-W / 2 + 0.1, 0.48, H / 2));
  plano(E, W + 0.9, 0.5, 0, 0.11, H + 0.35, (x, w, h) => {
    x.fillStyle = "#f6f4ee"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#c9a23a"; x.textAlign = "center";
    x.font = `700 ${h * 0.3}px Arial, sans-serif`; x.fillText("JUST WEIGHT PLACE", w / 2, h * 0.36);
    x.font = `700 ${h * 0.4}px Arial, sans-serif`; x.fillText("SODA UCR CARIBE", w / 2, h * 0.86);
  });
  // guirnalda: «FELIZ NAVIDAD» en letras rojas y verdes y ramas verdes con lazos rojos a los lados
  plano(E, W + 1.1, 0.42, 0, 0.16, H + 0.82, (x, w, h) => {
    x.textAlign = "center"; x.font = `900 ${h * 0.8}px Georgia, serif`;
    [..."FELIZ NAVIDAD"].forEach((ch, k, arr) => { x.fillStyle = k % 2 ? "#2f7a3a" : "#c0262d"; x.fillText(ch, (w * (k + 0.5)) / arr.length, h * 0.82); });
  });
  const rama = mat(0x2f5f32, { roughness: 0.95 });
  for (const u of [-W / 2 - 0.3, W / 2 + 0.3]) {
    E.pieza(0.18, H + 0.6, 0.12, rama, u, 0.16, (H + 0.6) / 2 + 0.2);
    for (let k = 0; k < 4; k++) E.pieza(0.12, 0.12, 0.05, mat(0xc0262d), u, 0.24, 0.6 + k * 0.6);
  }
  // menús y avisos a la derecha, no fumar y salida
  plano(E, 0.8, 1.1, W / 2 + 0.85, 0.1, 1.45, (x, w, h) => {
    x.fillStyle = "#f2f2ea"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#6aa84f"; x.fillRect(w * 0.08, h * 0.05, w * 0.84, h * 0.06);
    for (let k = 0; k < 3; k++) { x.fillStyle = "#e6c45a"; x.fillRect(w * 0.15, h * (0.18 + k * 0.27), w * 0.7, h * 0.2); }
  }, 128);
  plano(E, 0.4, 0.55, W / 2 + 1.55, 0.1, 1.45, (x, w, h) => {
    x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.fillStyle = "#c62828"; x.fillRect(0, 0, w, h * 0.18);
    x.strokeStyle = "#c62828"; x.lineWidth = w * 0.06; x.beginPath(); x.arc(w / 2, h * 0.55, w * 0.32, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(w * 0.27, h * 0.38); x.lineTo(w * 0.73, h * 0.72); x.stroke();
  }, 64);
  plano(E, 0.55, 0.3, W / 2 + 1.0, 1.3, 2.45, (x, w, h) => {
    x.fillStyle = "#1f6b3a"; x.fillRect(0, 0, w, h); x.fillStyle = "#e8c32c"; x.font = `700 ${h * 0.55}px Arial, sans-serif`;
    x.textAlign = "center"; x.fillText("SALIDA →", w / 2, h * 0.7);
  }, 128);
  // estante de metal oxidado a la izquierda, con cajas encima
  const oxido = mat(0x6b4a33, { roughness: 0.6, metalness: 0.4 });
  for (const du of [-0.6, 0.6]) for (const dv of [0.45, 1.15]) E.pieza(0.04, 1.6, 0.04, oxido, -W / 2 - 1.3 + du, dv, 0.8);
  for (const y of [0.25, 0.75, 1.25, 1.6]) E.pieza(1.25, 0.03, 0.75, oxido, -W / 2 - 1.3, 0.8, y);
  E.pieza(0.8, 0.25, 0.5, mat(0x3f68c0), -W / 2 - 1.3, 0.8, 1.75);
  E.pieza(0.7, 0.12, 0.45, mat(0xf0f0ec), -W / 2 - 1.3, 0.8, 1.94);

  // --- puerta hacia el comedor: metal celeste con reja, en medio de la pared
  const P = caraEn(puerta, null);
  P.pieza(1.1, 2.2, 0.08, celesteM, -0.8, 0.05, 1.1);
  for (let k = 0; k < 6; k++) P.pieza(0.03, 1.9, 0.04, mat(0x6f93ad), -1.25 + k * 0.18, 0.1, 1.1);
  P.pieza(1.6, 1.7, 0.06, mat(0xb9d2e2, { roughness: 0.5 }), 1.1, 0.05, 1.45);                  // reja celeste de la ventana
  for (let k = 0; k < 8; k++) P.pieza(0.025, 1.6, 0.03, mat(0x7e9fb5), 0.35 + k * 0.21, 0.09, 1.45);
  P.pieza(0.5, alto - 0.1, 0.25, mat(0xa6a39c, { roughness: 1 }), 0.15, 0.12, (alto - 0.1) / 2); // pilar de concreto
}

// Gimnasio de pesas bajo el corredor del gimnasio (fotos, nov. 2026): en la punta, entre la pared y las columnas,
// piso de concreto, jaulas de malla ciclón con marcos azules contra la pared, un rack de sentadillas negro con el
// travesaño rojo, bicicletas de spinning rojas y negras, una barra con dos sacos de boxeo colgando, una banca, la
// puerta gris del promotor deportivo con su rótulo y un extintor. t0..t1: tramo de la fachada (fracción de su largo)
function gimnasioPesas(grupo, vol, alto, frente, [t0, t1]) {
  const f = fachadaSur(vol.contorno, frente), dx = (f.b[0] - f.a[0]) / f.largo, dz = (f.b[1] - f.a[1]) / f.largo, ang = Math.atan2(f.nx, f.nz);
  const en = (u, v, y) => [f.a[0] + dx * u + f.nx * v, y, f.a[1] + dz * u + f.nz * v];   // u: metros a lo largo, v: hacia afuera
  const m = (c, x = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...x });
  const caja = (w, h, d, mat, u, v, y, giro = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(...en(u, v, y)); b.rotation.y = ang + giro; b.castShadow = !liviano; b.receiveShadow = true; grupo.add(b); return b; };
  const U0 = f.largo * t0 + 0.6, U1 = f.largo * t1, L = U1 - U0, uc = (U0 + U1) / 2;
  const azul = m(0x4a8fc8, { metalness: 0.3 }), negro = m(0x1d1f22, { metalness: 0.4 }), rojo = m(0xd0262e, { metalness: 0.3 });
  const malla = new THREE.MeshStandardMaterial({ color: 0x8fa6b8, roughness: 0.8, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  caja(L, 0.08, 3.2, m(0xa9a8a2, { roughness: 0.95 }), uc, 1.6, 0.04);                              // piso de concreto
  // jaulas de malla con marcos azules, a 0,8 m de la pared, dos tramos con un paso entre ellos
  for (const [a, b] of [[U0 + 1.6, uc - 0.4], [uc + 0.6, U1 - 0.2]]) {
    caja(b - a, 2.6, 0.02, malla, (a + b) / 2, 0.8, 1.3);
    for (const y of [0.05, 1.3, 2.6]) caja(b - a, 0.06, 0.06, azul, (a + b) / 2, 0.8, y);
    for (const u of [a, (a + b) / 2, b]) caja(0.06, 2.6, 0.06, azul, u, 0.8, 1.3);
  }
  // puerta gris del promotor deportivo, rótulo y extintor
  caja(0.95, 2.1, 0.06, m(0x5d6266), U0 + 0.6, 0.03, 1.05);
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 48; const x = cv.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, 128, 48); x.fillStyle = "#1d4f9c"; x.font = "700 17px Arial"; x.textAlign = "center"; x.fillText("Promotor", 64, 20); x.fillText("Deportivo", 64, 40);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const rot = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.17), new THREE.MeshBasicMaterial({ map: tx })); rot.position.set(...en(U0 + 0.6, 0.07, 2.3)); rot.rotation.y = ang; grupo.add(rot);
  const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), rojo); ext.position.set(...en(U0 + 1.3, 0.12, 1.1)); grupo.add(ext);
  // rack de sentadillas: cuatro parales negros, travesaño rojo arriba, barra con discos
  const uR = U0 + 2.6, vR = 2.0;
  for (const du of [-0.6, 0.6]) for (const dv of [-0.5, 0.5]) caja(0.07, 2.2, 0.07, negro, uR + du, vR + dv, 1.1);
  caja(1.3, 0.12, 0.12, rojo, uR, vR - 0.5, 2.2); caja(1.3, 0.06, 0.06, negro, uR, vR + 0.5, 2.2);
  for (const du of [-0.6, 0.6]) caja(0.1, 0.06, 1.2, negro, uR + du, vR, 0.04);
  caja(1.8, 0.04, 0.04, m(0xb9bec2, { metalness: 0.7 }), uR, vR - 0.4, 1.35);
  for (const du of [-0.8, 0.8]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), negro); d.rotation.z = Math.PI / 2; d.rotation.y = ang; d.position.set(...en(uR + du, vR - 0.4, 1.35)); grupo.add(d); }
  // bicicletas de spinning dentro de la jaula
  [[U0 + 1.9, 0xd0262e], [U0 + 3.0, 0x1d1f22], [U0 + 3.7, 0x1d1f22]].forEach(([u, c]) => {
    const mc = m(c, { metalness: 0.3 });
    caja(0.08, 0.06, 1.0, mc, u, 0.4, 0.05, Math.PI / 2);
    const tubo = caja(0.07, 0.9, 0.07, mc, u, 0.4, 0.5); tubo.rotation.z = 0.25;
    caja(0.12, 0.05, 0.25, negro, u - 0.15, 0.4, 0.98, Math.PI / 2);
    caja(0.35, 0.04, 0.05, negro, u + 0.3, 0.4, 1.05, Math.PI / 2);
    const vol_ = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14), negro); vol_.rotation.z = Math.PI / 2; vol_.rotation.y = ang + Math.PI / 2; vol_.position.set(...en(u + 0.25, 0.4, 0.35)); grupo.add(vol_);
  });
  // barra entre columna y pared con dos sacos de boxeo
  const uB = uc + 1.6;
  caja(3.0, 0.07, 0.07, m(0xb9bec2, { metalness: 0.6 }), uB, 1.8, 2.5, Math.PI / 2);
  for (const dv of [1.0, 2.6]) {
    caja(0.02, 0.4, 0.02, negro, uB, dv, 2.3);
    const saco = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 12), negro); saco.position.set(...en(uB, dv, 1.65)); saco.castShadow = !liviano; grupo.add(saco);
  }
  // banca de pesas
  caja(0.3, 0.08, 1.1, negro, uc - 0.6, 2.4, 0.5); caja(0.06, 0.45, 0.06, m(0x9a9fa4, { metalness: 0.5 }), uc - 0.6, 2.0, 0.25); caja(0.06, 0.45, 0.06, m(0x9a9fa4, { metalness: 0.5 }), uc - 0.6, 2.8, 0.25);
  // condensadora junto a la pared al fondo
  caja(0.8, 0.6, 0.35, m(0xd7d8d4), U1 - 0.7, 0.3, 0.3);
}

// Parasoles curvos de lámina blanca frente a la fachada (edificio 13): paneles altos que se arquean hacia afuera
function parasoles(grupo, vol, alto, frente, cuantos = 3) {
  const f = frente ? fachadaMirando(vol.contorno, frente) : fachadaSur(vol.contorno), dx = (f.b[0] - f.a[0]) / f.largo, dz = (f.b[1] - f.a[1]) / f.largo;
  const ancho = (f.largo / cuantos) * (cuantos <= 3 ? 0.94 : 0.82), altoP = alto * (cuantos <= 3 ? 0.97 : 0.9);
  for (let i = 0; i < cuantos; i++) {
    const g = new THREE.PlaneGeometry(ancho, altoP, 1, 10);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / altoP + 0.5; p.setZ(k, Math.sin(Math.PI * t) * 1.3); }
    g.computeVertexNormals();
    const panel = new THREE.Mesh(g, parasol);
    const t = (i + 0.5) / cuantos;
    panel.position.set(f.a[0] + dx * f.largo * t + f.nx * 1.0, Math.max(alto * 0.52, altoP / 2 + 0.05), f.a[1] + dz * f.largo * t + f.nz * 1.0);
    panel.rotation.y = Math.atan2(f.nx, f.nz);
    panel.castShadow = true; grupo.add(panel);
  }
}

for (const e of datos.campus.edificios) {
  const grupo = new THREE.Group();
  const estilo = e.estilo || {};
  const mat = {
    pared: new THREE.MeshStandardMaterial({ color: estilo.pared || colores.pared, roughness: 0.85 }),
    techo: new THREE.MeshStandardMaterial({ color: estilo.techo || colores.techo, roughness: 0.75, side: THREE.DoubleSide }),
  };
  if (e.tipo === "piscina") {
    // Piscina (fotos): pileta celeste con borde amarillo, deck de granito lavado, malla verde electrosoldada
    // alrededor, y detrás los vestidores (casetas blancas con zócalo gris y techo de una agua) y un toldo en arco
    const c = e.volumenes[0].contorno;
    grupo.add(prisma(c, 0.3, 0, new THREE.MeshStandardMaterial({ color: 0xbdbab2, roughness: 0.95 }), 7));       // deck
    grupo.add(prisma(c, 0.06, 0.3, new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 }), -1.6));   // borde amarillo
    const agua = prisma(c, 0.08, 0.33, new THREE.MeshStandardMaterial({ color: 0x5aaee8, roughness: 0.2, metalness: 0.05 }), -2.2);
    agua.castShadow = false;
    grupo.add(agua);
    mat.techo = agua.material;
    // malla verde alrededor del deck
    const cx0 = c.reduce((s, p) => s + p[0], 0) / c.length, cz0 = c.reduce((s, p) => s + p[1], 0) / c.length;
    const fuera = (p, d) => { const dx = p[0] - cx0, dz = p[1] - cz0, n = Math.hypot(dx, dz) || 1; return [p[0] + (dx / n) * d, p[1] + (dz / n) * d]; };
    const mallaV = new THREE.MeshLambertMaterial({ color: 0x1f4f3a, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    const posteV = new THREE.MeshLambertMaterial({ color: 0x1d4630 });
    for (let i = 0; i < c.length; i++) {
      const a = fuera(c[i], 8.2), b = fuera(c[(i + 1) % c.length], 8.2), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(L, 2), mallaV); m.position.set((a[0] + b[0]) / 2, 1, (a[1] + b[1]) / 2); m.rotation.y = Math.atan2(-(b[1] - a[1]), b[0] - a[0]); grupo.add(m);
      for (let d = 0; d <= L; d += 2.5) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.1, 0.1), posteV); p.position.set(a[0] + ((b[0] - a[0]) * d) / L, 1.05, a[1] + ((b[1] - a[1]) * d) / L); grupo.add(p); }
    }
    // lados de la pileta según hacia dónde miran: el sur da a la quebrada, el norte a la calle de la biblioteca
    const ladoHacia = (sentido) => {
      let mejor = null;
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        if (nx * (mx - cx0) + nz * (mz - cz0) < 0) { nx = -nx; nz = -nz; }
        const puntaje = nz * sentido;
        if (!mejor || puntaje > mejor.puntaje) mejor = { mx, mz, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, nx, nz, L, puntaje };
      }
      mejor.en = (t, d, y) => [mejor.mx + mejor.ux * t + mejor.nx * d, y, mejor.mz + mejor.uz * t + mejor.nz * d];
      mejor.ang = Math.atan2(-mejor.uz, mejor.ux);
      return mejor;
    };
    const ladoHaciaVec = ([vx, vz]) => {   // el lado de la pileta cuya normal apunta más hacia (vx, vz)
      let mejor = null;
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        if (nx * (mx - cx0) + nz * (mz - cz0) < 0) { nx = -nx; nz = -nz; }
        const puntaje = nx * vx + nz * vz;
        if (!mejor || puntaje > mejor.puntaje) mejor = { mx, mz, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, nx, nz, L, puntaje };
      }
      mejor.en = (t, d, y) => [mejor.mx + mejor.ux * t + mejor.nx * d, y, mejor.mz + mejor.uz * t + mejor.nz * d];
      mejor.ang = Math.atan2(-mejor.uz, mejor.ux);
      return mejor;
    };
    // vestidores y toldo en arco: detrás de la piscina, del lado de la quebrada (sur), al otro lado de la acera
    // que bordea la malla (la acera va a ~9,6 m del borde de la pileta; ver campus3d.py)
    const sur = ladoHacia(1);
    const blancoV = new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.85 });
    const grisV = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.85 });
    const laminaV = new THREE.MeshStandardMaterial({ color: 0xd6dade, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    // (anotaciones) más hacia el oeste y del tamaño marcado: unos 17,6 m de largo y 5 de fondo
    for (const [t, largo] of [[-0.7, 7], [8.1, 10.6]]) {
      const caseta = new THREE.Group();
      const zocalo = new THREE.Mesh(new THREE.BoxGeometry(largo, 1.8, 5), grisV); zocalo.position.y = 0.9; caseta.add(zocalo);
      const muro = new THREE.Mesh(new THREE.BoxGeometry(largo, 1.4, 5), blancoV); muro.position.y = 2.5; caseta.add(muro);
      const techo = new THREE.Mesh(new THREE.BoxGeometry(largo + 1.2, 0.12, 6.6), laminaV); techo.position.set(0, 3.45, 0.3); techo.rotation.x = -0.16; caseta.add(techo);
      caseta.position.set(...sur.en(t, 15, 0)); caseta.rotation.y = sur.ang; grupo.add(caseta);
    }
    // (anotaciones) el toldo en arco se quitó. En el deck, del lado sur y junto a la malla, dos enrolladores de
    // corcheras (foto): carrete con dos discos blancos, el eje sobre un marco con ruedas y las corcheras enrolladas
    // en franjas azul, crema y roja
    const corcheras = texturaDibujada(256, 128, (x, w, h) => {
      const franjas = ["#2456b0", "#e9e2cc", "#2456b0", "#e9e2cc", "#2456b0", "#b5262c", "#e9e2cc", "#b5262c", "#b5262c"];
      const a = w / franjas.length;
      franjas.forEach((c_, i) => { x.fillStyle = c_; x.fillRect(i * a, 0, a + 1, h); });
      for (let j = 0; j < h; j += 8) { x.fillStyle = "rgba(0,0,0,0.18)"; x.fillRect(0, j, w, 2); }   // los flotadores
    });
    const discoB = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 });
    const aceroC = new THREE.MeshStandardMaterial({ color: 0xb9bec3, roughness: 0.4, metalness: 0.6 });
    const rollo = new THREE.MeshStandardMaterial({ map: corcheras, roughness: 0.7 });
    for (const t of [-sur.L * 0.3, sur.L * 0.3]) {
      const carrete = new THREE.Group();
      const R = 0.78, AN = 1.5;
      const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(R, R, AN, 24), [rollo, discoB, discoB]);
      cuerpo.rotation.z = Math.PI / 2; cuerpo.position.y = R + 0.25; carrete.add(cuerpo);
      for (const lado of [-1, 1]) {
        const disco = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.08, R + 0.08, 0.05, 28), discoB);
        disco.rotation.z = Math.PI / 2; disco.position.set(lado * (AN / 2 + 0.04), R + 0.25, 0); carrete.add(disco);
        for (const dz of [-0.45, 0.45]) {   // patas del marco en A y ruedas
          const pata = new THREE.Mesh(new THREE.BoxGeometry(0.05, R + 0.35, 0.05), aceroC);
          pata.position.set(lado * (AN / 2 + 0.12), (R + 0.25) / 2, dz * 0.6); pata.rotation.x = -dz * 0.5; carrete.add(pata);
          const rueda = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x2a2d30 }));
          rueda.rotation.z = Math.PI / 2; rueda.position.set(lado * (AN / 2 + 0.12), 0.1, dz); carrete.add(rueda);
        }
      }
      const eje = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, AN + 0.4, 8), aceroC);
      eje.rotation.z = Math.PI / 2; eje.position.y = R + 0.25; carrete.add(eje);
      const base = new THREE.Mesh(new THREE.BoxGeometry(AN + 0.3, 0.05, 0.05), aceroC); base.position.y = 0.15; carrete.add(base);
      carrete.position.set(...sur.en(t, 4.5, 0.3)); carrete.rotation.y = sur.ang; grupo.add(carrete);
    }
    // baños de la piscina (fotos y satélite): al costado oeste, a lo largo de una acera con guía táctil.
    // Primero el cuarto de máquinas gris con celosías (extremo sur) y luego los baños blancos con zócalo gris,
    // puertas hacia la piscina y un alero oscuro sobre ellas
    const oeste = ladoHaciaVec([-Math.cos(0.26), -Math.sin(0.26)]);
    const sentido = Math.sign(oeste.uz) || 1;   // t crece hacia el sur si sentido > 0
    const D = 12.5, FONDO = 4;
    const bloque = (t, largo, conZocalo) => {
      const b = new THREE.Group();
      if (conZocalo) {
        const z = new THREE.Mesh(new THREE.BoxGeometry(largo, 1.5, FONDO), grisV); z.position.y = 0.75; b.add(z);
        const m = new THREE.Mesh(new THREE.BoxGeometry(largo, 1.6, FONDO), blancoV); m.position.y = 2.3; b.add(m);
      } else {
        const z = new THREE.Mesh(new THREE.BoxGeometry(largo, 2.4, FONDO), grisV); z.position.y = 1.2; b.add(z);
        const m = new THREE.Mesh(new THREE.BoxGeometry(largo, 0.9, FONDO), blancoV); m.position.y = 2.85; b.add(m);
      }
      const techo = new THREE.Mesh(new THREE.BoxGeometry(largo + 1, 0.12, FONDO + 1.4), laminaV); techo.position.y = 3.4; techo.rotation.x = 0.12; b.add(techo);
      b.position.set(...oeste.en(t, D, 0)); b.rotation.y = oeste.ang; grupo.add(b);
    };
    bloque(sentido * 12, 5, false);                 // cuarto de máquinas
    bloque(-sentido * 1.5, 20, true);               // baños
    const puerta = new THREE.MeshStandardMaterial({ color: 0x8e98a2, roughness: 0.6 });
    for (let k = 0; k < 6; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.06), puerta);
      p.position.set(...oeste.en(-sentido * (10 - k * 3.4), D - FONDO / 2 - 0.04, 1.05)); p.rotation.y = oeste.ang; grupo.add(p);
    }
    const alero = new THREE.Mesh(new THREE.BoxGeometry(20, 0.08, 1.8), new THREE.MeshStandardMaterial({ color: 0x2f3337, roughness: 0.6 }));
    alero.position.set(...oeste.en(-sentido * 1.5, D - FONDO / 2 - 0.9, 2.7)); alero.rotation.y = oeste.ang; grupo.add(alero);
    const acera = new THREE.Mesh(new THREE.BoxGeometry(30, 0.1, 1.6), new THREE.MeshStandardMaterial({ color: 0xbdbcb6, roughness: 0.95 }));
    acera.position.set(...oeste.en(sentido * 2, D - FONDO / 2 - 1.6, 0.05)); acera.rotation.y = oeste.ang; grupo.add(acera);
    const guia = new THREE.Mesh(new THREE.BoxGeometry(30, 0.11, 0.35), new THREE.MeshStandardMaterial({ color: 0xe8b42a, roughness: 0.8 }));
    guia.position.set(...oeste.en(sentido * 2, D - FONDO / 2 - 1.6, 0.06)); guia.rotation.y = oeste.ang; grupo.add(guia);
    // mesa de concreto azul junto al cuarto de máquinas
    const mesaAzul = new THREE.MeshStandardMaterial({ color: 0x6fa8d6, roughness: 0.9 });
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 14), mesaAzul); mesa.position.set(...oeste.en(sentido * 12, D + 4.5, 0.78)); grupo.add(mesa);
    const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.75, 8), mesaAzul); pata.position.set(...oeste.en(sentido * 12, D + 4.5, 0.37)); grupo.add(pata);
    // (fotos y anotaciones, nov. 2026) máquinas de ejercicio al aire libre en el zacate, a lo largo de la pared de
    // afuera de los baños, desde el cuarto de máquinas hacia el norte: de cerca a lejos, el press de pecho de dos
    // asientos, el péndulo, la caminadora aérea y la rueda con el asiento de piernas
    // (anotaciones) en línea con las tres mesas (x = 46,3), siguiendo hacia el sur
    [["press", -44.6], ["pendulo", -47.3], ["caminadora", -49.9], ["rueda", -52.6]].forEach(([tipo, t]) => {
      const m = maquinaEjercicio(tipo);
      m.position.set(46.3, 0, t); m.rotation.y = oeste.ang; grupo.add(m);
    });
    // parqueo de bicicletas y motos: adoquín rojizo pegado a la calle, en la cara que mira a la biblioteca (norte)
    const norte = ladoHacia(-1);
    // (anotaciones) un poco más grande y separado de la malla
    // (anotaciones) se corrió hacia las aulas, entre la malla y la acera de la calle, sin tocar la calle
    const T0 = -9.4, D0 = 10.6;
    const adoquin = new THREE.Mesh(new THREE.BoxGeometry(15, 0.08, 4.8), new THREE.MeshStandardMaterial({ color: 0x8e5a4c, roughness: 0.95 }));
    adoquin.position.set(...norte.en(T0, D0, 0.05)); adoquin.rotation.y = norte.ang; grupo.add(adoquin);
    const inox = new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 0.7, roughness: 0.25 });
    // (anotaciones) vistos desde la calle, los tubos para bicicletas van a la izquierda y las motos a la derecha
    for (let k = 0; k < 4; k++) {
      const u = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 12, Math.PI), inox);
      u.position.set(...norte.en(T0 + 1.7 + k * 1.6, D0 - 1.2, 0.45)); u.rotation.y = norte.ang + Math.PI / 2; grupo.add(u);
    }
    const tonos = [0x1f4fa8, 0x2a2d31, 0x5b2a6e, 0xb3262e, 0xe8e8e8];
    for (let k = 0; k < 5; k++) {
      const moto = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: tonos[k], roughness: 0.4, metalness: 0.3 });
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 1.9), m); cuerpo.position.y = 0.6; moto.add(cuerpo);
      for (const z of [-0.75, 0.75]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.15, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1a })); r.rotation.z = Math.PI / 2; r.position.set(0, 0.32, z); moto.add(r); }
      moto.position.set(...norte.en(T0 - 6.6 + k * 1.4, D0 + 0.6, 0)); moto.rotation.y = norte.ang + Math.PI / 2; grupo.add(moto);
    }
    grupo.traverse((o) => { if (o.isMesh && o.material !== mallaV) { o.castShadow = !liviano; o.receiveShadow = true; } });
  } else {
    const pisos = Math.max(e.pisos, 1), altoPiso = e.alto / pisos;
    for (const vol of e.volumenes) {
      if (!estilo.entrada) grupo.add(prisma(vol.contorno, vol.alto, vol.desde, mat.pared));   // la parada de la entrada es abierta
      if (vol.linterna) {   // ventanas corridas de la linternilla
        grupo.add(prisma(vol.contorno, vol.alto * 0.55, vol.desde + vol.alto * 0.25, celosia, 0.05));
        continue;
      }
      for (let p = 1; p < e.pisos; p++) grupo.add(prisma(vol.contorno, 0.3, altoPiso * p, losa, 0.5));
      if (estilo.zocalo) grupo.add(prisma(vol.contorno, altoPiso * 0.36, 0, new THREE.MeshStandardMaterial({ color: estilo.zocalo, roughness: 0.8 }), 0.04));
      // ventanas: celosías grises (edificios nuevos) o ventanales de vidrio (biblioteca)
      const ventanal = estilo.ventanas === "vidrio" || estilo.ventanas === "vidrio_verde";
      const cristal = estilo.ventanas === "vidrio_verde" ? vidrioVerde : vidrio;
      if (estilo.franja) grupo.add(prisma(vol.contorno, 0.6, altoPiso * 0.27, new THREE.MeshStandardMaterial({ color: estilo.franja, roughness: 0.8 }), 0.06));
      if (estilo.porton) {   // portón de lámina oscura en la fachada que mira a la calle (o la que diga porton_frente)
        const f = fachadaSur(vol.contorno, estilo.porton_frente), ang = Math.atan2(-(f.b[1] - f.a[1]), f.b[0] - f.a[0]);
        const p = new THREE.Mesh(new THREE.BoxGeometry(f.largo * 0.45, altoPiso * 0.78, 0.12), new THREE.MeshStandardMaterial({ color: estilo.porton, roughness: 0.6 }));
        p.position.set((f.a[0] + f.b[0]) / 2 + f.nx * 0.08, altoPiso * 0.39, (f.a[1] + f.b[1]) / 2 + f.nz * 0.08); p.rotation.y = ang; grupo.add(p);
      }
      if (estilo.rotulo) {   // panel blanco con «UCR / Sede del Caribe» en celeste, bajo el corredor
        const f = fachadaSur(vol.contorno, estilo.rotulo), ang = Math.atan2(f.nx, f.nz);
        const cv = document.createElement("canvas"); cv.width = 512; cv.height = 320;
        const x = cv.getContext("2d"); x.fillStyle = "#ffffff"; x.fillRect(0, 0, 512, 320);
        x.strokeStyle = "#005da4"; x.lineWidth = 14; x.strokeRect(7, 7, 498, 306);
        x.fillStyle = "#005da4"; x.textAlign = "center";
        x.font = "600 120px 'Source Sans 3', Arial, sans-serif"; x.fillText("UCR", 256, 170);
        x.fillRect(150, 192, 212, 6);
        x.font = "600 46px 'Source Sans 3', Arial, sans-serif"; x.fillText("SEDE DEL CARIBE", 256, 262);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.9), new THREE.MeshBasicMaterial({ map: tex }));
        const t = estilo.rotulo_t ?? 0.12;   // cerca de la esquina, como en la foto
        panel.position.set(f.a[0] + (f.b[0] - f.a[0]) * t + f.nx * 0.1, 1.35, f.a[1] + (f.b[1] - f.a[1]) * t + f.nz * 0.08);
        panel.rotation.y = ang; grupo.add(panel);
      }
      if (estilo.corredor) {   // viga perimetral de concreto sobre columnas: corredor abierto alrededor de la nave
        const concreto = new THREE.MeshStandardMaterial({ color: 0xa9aaa6, roughness: 0.95 });
        grupo.add(prisma(vol.contorno, 1.8, e.alto - 1.8, concreto, 3.4));
        const c = vol.contorno;
        for (let i = 0; i < c.length; i++) {
          const a = c[i], b = c[(i + 1) % c.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const cx = c.reduce((s, q) => s + q[0], 0) / c.length, cz = c.reduce((s, q) => s + q[1], 0) / c.length;
          for (let k = 0; k <= Math.round(L / 7); k++) {
            const t = k / Math.round(L / 7), x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
            const d = Math.hypot(x - cx, z - cz) || 1, s = (d + 3.2) / d;
            const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, e.alto - 1.8, 0.6), concreto);
            col.position.set(cx + (x - cx) * s, (e.alto - 1.8) / 2, cz + (z - cz) * s); col.castShadow = !liviano; grupo.add(col);
          }
        }
      }
      const banda = estilo.ventanas === "celeste" ? celeste : celosia;
      if (!estilo.entrada && estilo.ventanas !== "ninguna") for (let p = 0; p < pisos; p++) grupo.add(prisma(vol.contorno, altoPiso * (ventanal ? 0.4 : 0.3), altoPiso * p + altoPiso * (ventanal ? 0.4 : 0.36), ventanal ? cristal : banda, 0.05));
    }
    if (estilo.banos) {   // los baños en el extremo del edificio: azulejo claro, bloques de ventilación y rótulo
      const b = estilo.banos;
      grupo.add(prisma(b.contorno, e.alto * 0.97, 0, new THREE.MeshStandardMaterial({ color: 0xe6edf0, roughness: 0.7 }), 0.08));
      grupo.add(prisma(b.contorno, 0.7, e.alto * 0.6, new THREE.MeshStandardMaterial({ color: 0x8d949a, roughness: 0.9 }), 0.12));
      const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256;
      const x = cv.getContext("2d"); x.fillStyle = "#005da4"; x.fillRect(0, 0, 256, 256); x.fillStyle = "#ffffff";
      for (const [cx, falda] of [[78, false], [178, true]]) {   // pictogramas de hombre y mujer
        x.beginPath(); x.arc(cx, 58, 20, 0, Math.PI * 2); x.fill();
        if (falda) { x.beginPath(); x.moveTo(cx, 84); x.lineTo(cx + 34, 160); x.lineTo(cx - 34, 160); x.fill(); x.fillRect(cx - 16, 160, 10, 40); x.fillRect(cx + 6, 160, 10, 40); }
        else { x.fillRect(cx - 22, 84, 44, 76); x.fillRect(cx - 20, 160, 16, 40); x.fillRect(cx + 4, 160, 16, 40); }
      }
      x.fillRect(126, 40, 4, 160);
      x.font = "700 40px 'Source Sans 3', Arial, sans-serif"; x.textAlign = "center"; x.fillText("BAÑOS", 128, 242);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const rotulo = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: tex }));
      rotulo.position.set(b.fin[0] + b.eje[0] * 0.2, 2.0, b.fin[1] + b.eje[1] * 0.2);
      rotulo.rotation.y = Math.atan2(b.eje[0], b.eje[1]);
      grupo.add(rotulo);
    }
    if (e.techo.length) grupo.add(techo(e.techo, mat.techo));
    const alero = estilo.alero ?? 1.4;
    if (estilo.fascia) for (const vol of e.volumenes) {   // alero ancho con su fascia de color (fotos)
      grupo.add(prisma(desplazar(vol.contorno, alero), e.techo.length ? 0.75 : 0.5, e.alto - 0.7, new THREE.MeshStandardMaterial({ color: estilo.fascia, roughness: 0.8 })));
    }
    if (estilo.columnas) for (const vol of e.volumenes) {   // corredor perimetral bajo el alero, con columnas delgadas
      const c = desplazar(vol.contorno, alero - 0.45), mat = new THREE.MeshStandardMaterial({ color: estilo.columnas, roughness: 0.6 });
      const piso = prisma(desplazar(vol.contorno, alero - 0.2), estilo.piso_corredor ? 0.07 : 0.15, 0, new THREE.MeshStandardMaterial({ color: estilo.piso_corredor || 0xb4614e, roughness: 0.9 }));
      piso.castShadow = false; grupo.add(piso);
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 4.5));
        for (let k = 0; k < n; k++) {
          const t = k / n, px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
          if ((estilo.sin_columnas || []).some(([qx, qz]) => Math.hypot(px - qx, pz - qz) < 1.2)) continue;   // (anotaciones) quitadas
          const col = new THREE.Mesh(estilo.columnas_cuadradas ? new THREE.BoxGeometry(0.2, e.alto - 0.7, 0.2) : new THREE.CylinderGeometry(0.11, 0.11, e.alto - 0.7, 8), mat);
          col.position.set(a[0] + (b[0] - a[0]) * t, (e.alto - 0.7) / 2, a[1] + (b[1] - a[1]) * t); col.castShadow = !liviano; grupo.add(col);
        }
      }
    }
    if (estilo.forma_techo === "plano" && !estilo.entrada) for (const vol of e.volumenes) {   // losa plana volada (la entrada lleva la suya)
      const l = prisma(vol.contorno, 0.6, e.alto, mat.techo, 3.2);
      grupo.add(l);
    }
    if (estilo.galeria) e.volumenes.forEach((vol) => galeria(grupo, vol, e.alto, Math.max(e.pisos, 1), estilo.galeria === true ? {} : estilo.galeria));
    if (estilo.parasoles) e.volumenes.forEach((vol) => parasoles(grupo, vol, e.alto, estilo.parasoles_frente, estilo.parasoles_n));
    if (estilo.balcones) e.volumenes.forEach((vol) => balcones(grupo, vol, e.alto, Math.max(e.pisos, 1), estilo.balcones.frente, !!estilo.balcones.unir_galeria));
    if (estilo.mural_mosaico) muralMosaico(grupo, e.volumenes[0], e.alto, estilo.mural_mosaico.frente);
    if (estilo.puerta_biblioteca) puertaBiblioteca(grupo, e.volumenes, estilo.puerta_biblioteca);
    if (estilo.soda) soda(grupo, e.volumenes[0], e.alto, estilo.soda);
    if (estilo.pesas) gimnasioPesas(grupo, e.volumenes[0], e.alto, estilo.rotulo, estilo.pesas);
    if (estilo.docencia) docencia(grupo, e.volumenes[0], e.alto, estilo.docencia, estilo.alero ?? 1.4);
    if (estilo.fachada_26) fachada26(grupo, e.volumenes[0], e.alto, Math.max(e.pisos, 1), estilo.fachada_26);
    if (estilo.oeste_26) oeste26(grupo, e.volumenes[0], e.alto, Math.max(e.pisos, 1));
    if (estilo.entrada) entrada(grupo, e);
    if (estilo.talud) {   // el edificio se para sobre un talud de zacate, con escalera y rampa al frente
      const t = estilo.talud, c = e.volumenes[0].contorno;
      grupo.children.forEach((h) => { h.position.y += t; });
      const tierra = prisma(c, t, 0, new THREE.MeshLambertMaterial({ color: 0x7fae5a }), 4.5);
      tierra.castShadow = false; grupo.add(tierra);
      const f = fachadaSur(c);
      if (estilo.frente) {   // la escalera mira a la calle: se usa la fachada que da hacia ella
        let mejor = -2;
        for (let i = 0; i < c.length; i++) {
          const p = c[i], q = c[(i + 1) % c.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
          let nx = (q[1] - p[1]) / L, nz = -(q[0] - p[0]) / L;
          const mx = (p[0] + q[0]) / 2 - e.centro[0], mz = (p[1] + q[1]) / 2 - e.centro[1];
          if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
          const puntaje = nx * estilo.frente[0] + nz * estilo.frente[1];
          if (puntaje > mejor) { mejor = puntaje; Object.assign(f, { a: p, b: q, largo: L, nx, nz }); }
        }
      }
      // la escalera sale perpendicular a la fachada: arriba toca el edificio y abajo llega al pie del talud
      const largoEsc = Math.hypot(t, 4.5), concretoE = new THREE.MeshStandardMaterial({ color: 0xbdbdb8 });
      const mx = (f.a[0] + f.b[0]) / 2 + f.nx * 2.6, mz = (f.a[1] + f.b[1]) / 2 + f.nz * 2.6;
      const escalera = new THREE.Group();
      const n = 8;
      for (let i = 0; i < n; i++) {   // gradas: de afuera (abajo) hacia el edificio (arriba)
        const g = new THREE.Mesh(new THREE.BoxGeometry(2.4, (t * (i + 1)) / n, 4.5 / n + 0.02), concretoE);
        g.position.set(0, (t * (i + 1)) / n / 2, 2.25 - (4.5 / n) * (i + 0.5)); escalera.add(g);
      }
      escalera.position.set(mx, 0, mz); escalera.rotation.y = Math.atan2(f.nx, f.nz); grupo.add(escalera);
    }
    if (estilo.linterna_hex) {   // linternilla de ventanas en la punta del techo (Docencia)
      const anillo = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.0, 6), celosia); anillo.position.set(e.centro[0], e.cumbre - 0.3, e.centro[1]);
      const tapa = new THREE.Mesh(new THREE.ConeGeometry(3.6, 0.9, 6), mat.techo); tapa.position.set(e.centro[0], e.cumbre + 0.65, e.centro[1]);
      const borde = new THREE.Mesh(new THREE.CylinderGeometry(3.62, 3.62, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0x3f6f9e })); borde.position.set(e.centro[0], e.cumbre + 0.2, e.centro[1]);
      grupo.add(anillo, tapa, borde);
    }
    if (estilo.moderno) {   // Auditorio (fotos): franja alta gris, losa muy volada, columnas en V, mural y parasoles
      const c = e.volumenes[0].contorno;
      grupo.add(prisma(c, e.alto * 0.36, e.alto * 0.64, new THREE.MeshStandardMaterial({ color: 0xd2d5d8, roughness: 0.8 }), 0.05));
      grupo.add(prisma(desplazar(c, 4.2), 0.35, e.alto, mat.techo));
      const haciaCalle = fachadaSur(c, [0.86, 0.5]), haciaAla = fachadaSur(c, [-0.56, 0.83]);
      const enFachada = (f, t, d, y) => [f.a[0] + (f.b[0] - f.a[0]) * t + f.nx * d, y, f.a[1] + (f.b[1] - f.a[1]) * t + f.nz * d];
      const angF = (f) => Math.atan2(f.nx, f.nz);
      // el mural es la foto de la Sede (recortada y enderezada), en la mitad baja de la fachada
      const texMural = new THREE.TextureLoader().load(raiz.dataset.raiz + "assets/img/mural-miniauditorio.webp", pedirDibujo);
      texMural.colorSpace = THREE.SRGBColorSpace;
      const anchoMural = haciaCalle.largo * 0.62;
      const mural = new THREE.Mesh(new THREE.PlaneGeometry(anchoMural, anchoMural / 4.15), new THREE.MeshBasicMaterial({ map: texMural }));
      mural.position.set(...enFachada(haciaCalle, 0.4, 0.06, anchoMural / 4.15 / 2 + 0.3)); mural.rotation.y = angF(haciaCalle); grupo.add(mural);
      // (anotaciones y foto) junto al ala de baños no hay parasoles ni la caja roja
      const acer = new THREE.MeshStandardMaterial({ color: 0x7d858c, roughness: 0.5, metalness: 0.4 });
      // (fotos) la columna en V es la del techo del ala de baños (caseta «ala_moderna»)
    }
    if (estilo.cupula) {   // torrecita de ventilación sobre la cumbrera (con dos cuerpos, sobre el primero: [x, z, cumbre])
      const [qx, qz, qy] = Array.isArray(estilo.cupula) ? estilo.cupula : [e.centro[0], e.centro[1], e.cumbre];
      const torre = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), celeste);
      torre.position.set(qx, qy + 0.5, qz);
      const tapa = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0x4d5a63 }));
      tapa.rotation.y = Math.PI / 4;
      tapa.position.set(qx, qy + 1.9, qz);
      torre.castShadow = tapa.castShadow = true;
      grupo.add(torre, tapa);
    }
    // estilo.loma (edificio en lo alto de un talud): ahora es parte del relieve (plataforma elevada en relieve.py)
    if (estilo.hundido) {   // está en un bajo: talud de zacate alrededor, abierto del lado de la entrada (hacia el 2)
      const c = e.volumenes[0].contorno, zacate = new THREE.MeshLambertMaterial({ color: 0x86b862 }), h = estilo.hundido;
      const ext = desplazar(c, alero + 1.5);
      for (let i = 0; i < ext.length; i++) {
        const a = ext[i], b = ext[(i + 1) % ext.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        if (nx * ((a[0] + b[0]) / 2 - e.centro[0]) + nz * ((a[1] + b[1]) / 2 - e.centro[1]) < 0) { nx = -nx; nz = -nz; }
        if (nx * -0.89 + nz * -0.45 > 0.3 || nx * 0.777 + nz * -0.629 > 0.6) continue;   // entrada (hacia el 2) y comedor (este): abiertos
        const corte = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(5, 0), new THREE.Vector2(0.6, h), new THREE.Vector2(0, h)]);
        const geo = new THREE.ExtrudeGeometry(corte, { depth: L + 6, bevelEnabled: false });
        geo.translate(0, 0, -(L + 6) / 2);
        const m = new THREE.Mesh(geo, zacate);
        m.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2); m.rotation.y = Math.atan2(nx, nz) - Math.PI / 2; m.receiveShadow = true;
        grupo.add(m);
      }
    }
  }
  grupo.scale.y = EXAGERAR;
  grupo.userData = { id: e.id, centro: new THREE.Vector3(e.centro[0], e.cumbre * EXAGERAR, e.centro[1]), mat, alto: e.alto, talud: estilo.talud_suelo, huellaExacta: !!estilo.talud_suelo };
  grupo.traverse((o) => { o.userData.edificio = grupo; });
  escena.add(grupo);
  edificios.push(grupo);
}

// ---------- cerca perimetral (fotos): malla verde electrosoldada con alambre de púas, a lo largo de las carreteras
{
  const ALTO = 2.4, PASO = 3;
  const tramos = datos.campus.cerca || [];
  const postes = [];
  const malla = new THREE.MeshLambertMaterial({ color: 0x24533a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const puas = new THREE.MeshLambertMaterial({ color: 0xc3c7cb });
  const grupoCerca = new THREE.Group();
  grupoCerca.userData.lineal = true;
  for (const t of tramos) {
    for (let i = 0; i < t.length - 1; i++) {
      const [ax, az] = t[i], [bx, bz] = t[i + 1];
      const largo = Math.hypot(bx - ax, bz - az);
      if (largo < 0.5) continue;
      const ang = Math.atan2(-(bz - az), bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(largo, ALTO - 0.2), malla);
      panel.position.set(cx, (ALTO - 0.2) / 2 + 0.05, cz); panel.rotation.y = ang; grupoCerca.add(panel);
      const alambre = new THREE.Mesh(new THREE.BoxGeometry(largo, 0.32, 0.32), puas);
      alambre.position.set(cx, ALTO + 0.12, cz); alambre.rotation.y = ang; grupoCerca.add(alambre);
      for (let d = 0; d < largo; d += PASO) postes.push([ax + ((bx - ax) * d) / largo, az + ((bz - az) * d) / largo]);
    }
    postes.push(t[t.length - 1]);
  }
  const palos = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, ALTO + 0.3, 0.14), new THREE.MeshLambertMaterial({ color: 0x1d4630 }), postes.length);
  const m4 = new THREE.Matrix4();
  postes.forEach(([x, z], i) => palos.setMatrixAt(i, m4.makeTranslation(x, (ALTO + 0.3) / 2, z)));
  palos.castShadow = !liviano;
  grupoCerca.add(palos);
  escena.add(grupoCerca);
}

// ---------- pista atlética: cancha con marcos en el centro y portón de acceso desde la carretera (fotos)
if (datos.campus.porton_pista && lugares.get(N.pista)) {
  const blancoTubo = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  // eje largo y medio largo de la cancha, medidos en el óvalo de la pista (campus3d.py)
  const [pcx, pcz] = datos.campus.pista.centro, eje = datos.campus.pista.eje ?? -0.46, medio = datos.campus.pista.medio_cancha ?? 42;
  for (const lado of [-1, 1]) {   // marcos de fútbol en los extremos de la cancha
    const gx = pcx + Math.cos(eje) * medio * lado, gz = pcz - Math.sin(eje) * medio * lado;
    const marco = new THREE.Group();
    for (const dz of [-3.6, 3.6]) { const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.44, 6), blancoTubo); palo.position.set(0, 1.22, dz); marco.add(palo); }
    const travesano = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 7.4), blancoTubo); travesano.position.y = 2.44; marco.add(travesano);
    marco.position.set(gx, 0, gz); marco.rotation.y = eje; marco.castShadow = true;
    escena.add(marco);
  }
  // portón de dos hojas de tubo galvanizado, poste azul con panel solar y lámpara solar
  const { p, hacia_pista, semiancho = 3.8 } = datos.campus.porton_pista;
  const grupo = new THREE.Group(), hojaL = semiancho - 0.3;   // cada hoja cubre media abertura
  const acero = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.5, roughness: 0.4 });
  const azul = new THREE.MeshStandardMaterial({ color: 0x1e88d8, roughness: 0.6 });
  for (const lado of [-1, 1]) {
    const hoja = new THREE.Group();
    const barras = Math.round(hojaL / 0.33);
    for (let k = 0; k <= barras; k++) { const barra = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.06), acero); barra.position.set(lado * (0.25 + (k * (hojaL - 0.1)) / barras), 1.25, 0); hoja.add(barra); }
    for (const y of [0.2, 1.3, 2.35]) { const larguero = new THREE.Mesh(new THREE.BoxGeometry(hojaL, 0.08, 0.08), acero); larguero.position.set(lado * (0.2 + hojaL / 2), y, 0); hoja.add(larguero); }
    grupo.add(hoja);
  }
  for (const x of [-semiancho, semiancho]) { const pilar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.9, 0.2), acero); pilar.position.set(x, 1.45, 0); grupo.add(pilar); }
  const xPanel = semiancho + 2.2, xLampara = semiancho + 5.2;
  const postePanel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.2, 6), azul); postePanel.position.set(xPanel, 2.1, 1.5); grupo.add(postePanel);
  const caja = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.35), azul); caja.position.set(xPanel, 3.2, 1.3); grupo.add(caja);
  const panelSolar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.1), new THREE.MeshStandardMaterial({ color: 0x2b3a4a, metalness: 0.4, roughness: 0.3 }));
  panelSolar.position.set(xPanel, 4.3, 1.5); panelSolar.rotation.x = -0.25; grupo.add(panelSolar);
  const lampara = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7.5, 6), new THREE.MeshStandardMaterial({ color: 0x2f3337 })); lampara.position.set(xLampara, 3.75, 2); grupo.add(lampara);
  const panelLamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.7), panelSolar.material); panelLamp.position.set(xLampara, 7.6, 2); panelLamp.rotation.x = -0.3; grupo.add(panelLamp);
  grupo.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  grupo.position.set(p[0], 0, p[1]);
  grupo.rotation.y = hacia_pista;   // las hojas quedan atravesadas en el camino; +z local apunta a la pista
  grupo.userData = { id: N.pista, centro: new THREE.Vector3(p[0], 5, p[1]), mat: { pared: acero, techo: azul }, alto: 3 };
  grupo.traverse((o) => { o.userData.edificio = grupo; });
  escena.add(grupo);
  edificios.push(grupo);
}

// ---------- entrada por residencias (fotos): portón verde de dos hojas, marco de tubo con malla y
// refuerzos en X, columnas con baliza amarilla y faroles verdes de dos brazos a los lados de la calle
function portonVerde(conFaroles, anchoHoja = 4.2) {
  const grupo = new THREE.Group();
  const verde = new THREE.MeshStandardMaterial({ color: 0x1f5a3c, roughness: 0.6, metalness: 0.2 });
  const mallaPorton = new THREE.MeshLambertMaterial({ color: 0x24533a, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xf2b705, emissive: 0x3a2a00 });
  const ANCHO = anchoHoja, ALTO = 2.2;
  for (const lado of [-1, 1]) {
    const cx = lado * ANCHO / 2;
    for (const y of [0.15, ALTO]) { const b = new THREE.Mesh(new THREE.BoxGeometry(ANCHO, 0.1, 0.1), verde); b.position.set(cx, y, 0); grupo.add(b); }
    for (const x of [cx - ANCHO / 2 + 0.05, cx + ANCHO / 2 - 0.05]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, ALTO, 0.1), verde); b.position.set(x, ALTO / 2 + 0.1, 0); grupo.add(b); }
    const diag = Math.hypot(ANCHO, ALTO - 0.15);
    for (const sgn of [-1, 1]) { const x = new THREE.Mesh(new THREE.BoxGeometry(diag, 0.07, 0.07), verde); x.position.set(cx, ALTO / 2 + 0.08, 0); x.rotation.z = sgn * Math.atan2(ALTO - 0.15, ANCHO); grupo.add(x); }
    const malla = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO - 0.1, ALTO - 0.2), mallaPorton); malla.position.set(cx, ALTO / 2 + 0.1, 0); grupo.add(malla);
  }
  for (const x of [-ANCHO - 0.25, ANCHO + 0.25]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.8, 0.3), verde); col.position.set(x, 1.4, 0); grupo.add(col);
    const baliza = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.25, 8), amarillo); baliza.position.set(x, 2.95, 0); grupo.add(baliza);
  }
  if (conFaroles) for (const x of [-ANCHO - 3, ANCHO + 3]) {   // faroles verdes de dos brazos
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 8, 8), verde); poste.position.set(x, 4, 3); grupo.add(poste);
    const brazos = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.12), verde); brazos.position.set(x, 7.9, 3); grupo.add(brazos);
  }
  grupo.traverse((o) => { if (o.isMesh) o.castShadow = !liviano; });
  grupo.userData.verde = verde;
  return grupo;
}
if (datos.campus.porton_residencias && lugares.get(N.porton_residencias)) {
  const { p, hacia_dentro, semiancho } = datos.campus.porton_residencias;
  // las dos hojas cierran la calle de borde a borde
  const grupo = portonVerde(true, semiancho ? semiancho + 0.25 : 4.2), verde = grupo.userData.verde;
  grupo.position.set(p[0], 0, p[1]);
  grupo.rotation.y = hacia_dentro;
  grupo.userData = { id: N.porton_residencias, centro: new THREE.Vector3(p[0], 5, p[1]), mat: { pared: verde, techo: verde }, alto: 3 };
  grupo.traverse((o) => { o.userData.edificio = grupo; });
  escena.add(grupo);
  edificios.push(grupo);
}

// ---------- área de picnic y juegos frente al CIUB y las residencias (fotos): mesas de concreto azul
// con bancas, rancho con techo de palma, casita y tobogán infantiles, y dos palmeras de coco
function palmeraCoco(x, z, alto, giro) {
  const g = new THREE.Group();
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, alto, 7), new THREE.MeshLambertMaterial({ color: 0x8a7354 }));
  tronco.position.y = alto / 2; tronco.rotation.z = 0.06; g.add(tronco);
  const hoja = new THREE.MeshLambertMaterial({ color: 0x5f9447, side: THREE.DoubleSide, flatShading: true });
  for (let k = 0; k < 12; k++) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.6, 3, 1).translate(0, 2.3, 0), hoja);
    h.position.y = alto; h.rotation.set(0, (k / 12) * Math.PI * 2 + giro, 0); h.rotateZ(-Math.PI / 2 + 0.5 + (k % 2) * 0.25); h.scale.z = 0.3;
    g.add(h);
  }
  g.position.set(x, 0, z);
  g.traverse((o) => { if (o.isMesh) o.castShadow = !liviano; });
  return g;
}
// plaza de adoquín frente a la entrada (foto): adoquín gris claro en hilera trabada y bandas rojizas en diagonal,
// con una banda rojiza a lo largo del zacate del rótulo
if (datos.campus.plaza_entrada) {
  const { poligono, borde_zacate } = datos.campus.plaza_entrada, TESELA = 6;
  const tex = texturaDibujada(512, 512, (x, W, H) => {
    x.fillStyle = "#c9c4bb"; x.fillRect(0, 0, W, H);
    const pw = 17, ph = 8.5;
    for (let f = 0; f * ph < H; f++) for (let c = -1; c * pw < W; c++) {
      const v = 196 + ((f * 7 + c * 13) % 5) * 4;
      x.fillStyle = `rgb(${v},${v - 4},${v - 11})`; x.fillRect(c * pw + (f % 2) * pw / 2 + 0.8, f * ph + 0.8, pw - 1.6, ph - 1.6);
    }
    x.strokeStyle = "rgba(196,120,118,0.95)"; x.lineWidth = 30;
    for (const o of [-W, 0, W]) { x.beginPath(); x.moveTo(o, 0); x.lineTo(o + W, H); x.stroke(); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1 / TESELA, 1 / TESELA);
  const forma = new THREE.Shape(poligono.map(([x, z]) => new THREE.Vector2(x, -z)));
  // La plaza es un polígono de pocos triángulos y el terreno sube y baja bajo ella: si no se divide en piezas chicas, el
  // terreno asoma por el medio y solo se ven los extremos (el «parche gris»). Con piezas de ~1 m, «asentar» la dobla bien.
  const teselar = (g0, paso) => {
    const P = g0.attributes.position, U = g0.attributes.uv, I = g0.index, pos = [], uv = [], v = new THREE.Vector3(), w = new THREE.Vector3();
    const punto = (a, b, c, i, j, n) => {
      return [0, 1, 2].map((e) => {
        const f = e === 0 ? "getX" : e === 1 ? "getY" : "getZ";
        return P[f](a) + (P[f](b) - P[f](a)) * i / n + (P[f](c) - P[f](a)) * j / n;
      });
    };
    const uvPunto = (a, b, c, i, j, n) => [0, 1].map((e) => {
      const f = e === 0 ? "getX" : "getY";
      return U[f](a) + (U[f](b) - U[f](a)) * i / n + (U[f](c) - U[f](a)) * j / n;
    });
    for (let t = 0; t < I.count; t += 3) {
      const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
      v.fromBufferAttribute(P, a); w.fromBufferAttribute(P, b); const ab = v.distanceTo(w);
      v.fromBufferAttribute(P, c); const bc = v.distanceTo(w); w.fromBufferAttribute(P, a); const ca = v.distanceTo(w);
      const n = Math.max(1, Math.ceil(Math.max(ab, bc, ca) / paso));
      const emitir = (...vs) => { for (const [i, j] of vs) { pos.push(...punto(a, b, c, i, j, n)); uv.push(...uvPunto(a, b, c, i, j, n)); } };
      for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
        emitir([i, j], [i + 1, j], [i, j + 1]);
        if (i + j < n - 1) emitir([i + 1, j], [i + 1, j + 1], [i, j + 1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  const geo = teselar(new THREE.ShapeGeometry(forma), 1).rotateX(-Math.PI / 2).translate(0, 0.04, 0);
  const plaza = new THREE.Group();
  const piso = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  piso.receiveShadow = true; plaza.add(piso);
  const [[ax, az], [bx, bz]] = borde_zacate, L = Math.hypot(bx - ax, bz - az);
  const banda = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, 0.4, Math.ceil(L / 1.2), 1, 1), new THREE.MeshLambertMaterial({ color: 0xc47876 }));
  banda.position.set((ax + bx) / 2, 0.05, (az + bz) / 2); banda.rotation.y = Math.atan2(-(bz - az), bx - ax); banda.receiveShadow = true;
  plaza.add(banda);
  escena.add(plaza);
}
if (datos.campus.picnic) {
  const [cx, cz] = datos.campus.picnic.centro, r = datos.campus.picnic.radio;
  const zona = new THREE.Group();
  const celesteMesa = new THREE.MeshStandardMaterial({ color: 0x3d8fd6, roughness: 0.85 });
  const azar = (i) => { const v = Math.sin(i * 91.7) * 43758.5; return v - Math.floor(v); };
  const mesas = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const ang = i * 2.39996, d = r * (0.25 + 0.6 * Math.sqrt((i + 0.5) / 9));
    const m = new THREE.Group();
    const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.75, 8), celesteMesa); pata.position.y = 0.37; m.add(pata);
    const tablero = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 14), celesteMesa); tablero.position.y = 0.78; m.add(tablero);
    for (const lado of [-1, 1]) {
      const banca = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.38), celesteMesa); banca.position.set(0, 0.23, lado * 1.15); m.add(banca);
    }
    m.position.set(cx + Math.cos(ang) * d, 0, cz + Math.sin(ang) * d); m.rotation.y = azar(i) * 3;
    mesas.add(m);
  }
  zona.add(mesas);
  // rancho de palma
  const rancho = new THREE.Group();
  const madera = new THREE.MeshLambertMaterial({ color: 0x6b5236 });
  for (let k = 0; k < 6; k++) { const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), madera); poste.position.set(Math.cos(k * Math.PI / 3) * 2.6, 1.3, Math.sin(k * Math.PI / 3) * 2.6); rancho.add(poste); }
  const techoPalma = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a48, flatShading: true }));
  techoPalma.position.y = 3.3; rancho.add(techoPalma);
  rancho.position.set(cx + r * 0.45, 0, cz - r * 0.55);
  zona.add(rancho);
  // juegos infantiles
  const casita = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.2), new THREE.MeshLambertMaterial({ color: 0xc98b3f }));
  casita.position.set(cx + r * 0.8, 0.7, cz - r * 0.2); zona.add(casita);
  const techoCasita = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 4), new THREE.MeshLambertMaterial({ color: 0x4b8b5a }));
  techoCasita.position.set(casita.position.x, 1.7, casita.position.z); techoCasita.rotation.y = Math.PI / 4; zona.add(techoCasita);
  const tobogan = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 2.4), new THREE.MeshLambertMaterial({ color: 0xf2c230 }));
  tobogan.position.set(cx + r * 0.65, 0.6, cz - r * 0.05); tobogan.rotation.x = -0.45; zona.add(tobogan);
  zona.add(palmeraCoco(cx - r * 0.45, cz - r * 0.75, 7.5, 0.3), palmeraCoco(cx + r * 0.05, cz - r * 0.85, 6.8, 1.1));
  zona.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
  if (lugares.get(N.picnic)) {
    zona.userData = { id: N.picnic, centro: new THREE.Vector3(cx, 4, cz), mat: { pared: celesteMesa, techo: celesteMesa }, alto: 1 };
    zona.traverse((o) => { o.userData.edificio = zona; });
    edificios.push(zona);
  }
  escena.add(zona);
}

// ---------- puente de la calle interna sobre la quebrada (fotos): calzada asfaltada con defensas amarillas
// de viga ondulada, acera peatonal con baranda gris y pasamanos amarillo, y paso de cebra al norte
if (datos.campus.puente) {
  // el puente se arma por tramos a lo largo del eje de la calle, así sigue la curva y empata con el asfalto
  const { centro: [px, pz], eje } = datos.campus.puente;
  const puente = new THREE.Group();
  puente.userData.talud = 8;   // sobre la calle (en terraplén, ver relieve.py): el terreno empata con él sin lomo
  // la quebrada pasa abierta bajo el puente: se asienta a la altura de sus extremos y solo se empareja el terreno ahí
  puente.userData.extremos = [eje[0], eje[eje.length - 1]];
  puente.userData.ejeTablero = eje.slice(1, -1);   // tramos con tablero (los extremos solo empatan el asfalto)
  const concreto = new THREE.MeshStandardMaterial({ color: 0xc9c7c0, roughness: 0.9 });
  const asfalto = new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 0.95 });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5, metalness: 0.2 });
  const gris = new THREE.MeshStandardMaterial({ color: 0xb8bdc2, roughness: 0.4, metalness: 0.5 });
  const blanco = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const CALZADA = 5.8, ACERA = 1.8;
  const mallaPuente = new THREE.MeshLambertMaterial({ color: 0x24533a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const postePuente = new THREE.MeshLambertMaterial({ color: 0x1d4630 });
  const puasPuente = new THREE.MeshLambertMaterial({ color: 0xc3c7cb });
  // tramo (en z) entre los extremos de las dos mallas de la quebrada que llegan al costado este del puente
  const mallaUne = (() => {
    const zs = (datos.campus.cerca || []).flatMap((t) => [t[0], t[t.length - 1]])
      .filter(([x, z]) => Math.abs(x - (px + 5)) < 3 && Math.abs(z - pz) < 6).map(([, z]) => z);
    return zs.length >= 2 ? [Math.min(...zs), Math.max(...zs)] : null;
  })();
  // lado de la acera (anotaciones): solo del este, donde llega la acera de la calle que viene de la entrada por
  // residencias; del oeste no hay
  const lados = { este: [1], oeste: [-1], ambos: [-1, 1] }[datos.campus.puente.acera] || [-1];
  const caja = (w, h, l, mat, x, y, ang, cx, cz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    m.position.set(cx + Math.cos(ang) * x, y, cz - Math.sin(ang) * x); m.rotation.y = ang; puente.add(m); return m;
  };
  for (let i = 0; i < eje.length - 1; i++) {
    const [ax, az] = eje[i], [bx, bz] = eje[i + 1];
    const L = Math.hypot(bx - ax, bz - az) + 0.08, ang = Math.atan2(bx - ax, bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, borde = i === 0 || i === eje.length - 2;
    caja(CALZADA, 0.04, L, asfalto, 0, 0.07, ang, cx, cz);                    // calzada a ras de la calle
    if (borde) continue;                                                       // los extremos solo empatan el asfalto
    if (lados.length > 1) caja(CALZADA + 2 * ACERA + 0.6, 0.5, L, concreto, 0, -0.2, ang, cx, cz);   // tablero
    else caja(CALZADA + ACERA + 0.6, 0.5, L, concreto, lados[0] * ACERA / 2, -0.2, ang, cx, cz);
    for (const x of [CALZADA / 2 + 0.1, -CALZADA / 2 - 0.1]) {                 // defensas amarillas
      caja(0.12, 0.35, L, amarillo, x, 0.65, ang, cx, cz);
      caja(0.15, 0.75, 0.15, amarillo, x, 0.42, ang, ax, az);
    }
    for (const lado of lados) {
      caja(ACERA, 0.2, L, concreto, lado * (CALZADA + ACERA) / 2, 0.15, ang, cx, cz);   // acera
      const xb = lado * (CALZADA / 2 + ACERA + 0.1);                                  // baranda de la acera
      caja(0.07, 0.07, L, amarillo, xb, 0.75, ang, cx, cz);
      caja(0.07, 0.07, L, gris, xb, 1.2, ang, cx, cz);
      caja(0.06, 1.5, 0.06, gris, xb, 0.55, ang, ax, az);
      // (anotaciones) del lado de residencias el puente une las dos mallas de la quebrada con la misma malla
      // perimetral (panel verde, alambre de púas arriba y postes cada 3 m), por fuera de la baranda
      if (lado > 0 && mallaUne) {
        // el tramo se mide sobre la orilla del puente (corrida del eje), donde llegan las mallas
        const xm = lado * (CALZADA / 2 + ACERA + 0.35), dzm = -Math.sin(ang) * xm;
        const [z0, z1] = mallaUne, t0 = Math.max(0, (z0 - az - dzm) / (bz - az)), t1 = Math.min(1, (z1 - az - dzm) / (bz - az));
        if (t1 > t0) {
          const Lm = (t1 - t0) * (L - 0.08);
          const qx = ax + (bx - ax) * (t0 + t1) / 2, qz = az + (bz - az) * (t0 + t1) / 2;
          const m = caja(0.02, 2.2, Lm, mallaPuente, xm, 0.25 + 1.15, ang, qx, qz); m.castShadow = false;
          caja(0.32, 0.32, Lm, puasPuente, xm, 0.25 + 2.52, ang, qx, qz);
          for (let d = 0; d <= Lm; d += 3) {
            const f = t0 + (d / Lm) * (t1 - t0);
            caja(0.14, 2.7, 0.14, postePuente, xm, 0.25 + 1.35, ang, ax + (bx - ax) * f, az + (bz - az) * f);
          }
        }
      }
    }
  }
  // paso de cebra al norte del puente
  const [nx, nz] = eje[1], [mx, mz] = eje[0], angN = Math.atan2(nx - mx, nz - mz);
  for (let k = 0; k < 6; k++) caja(0.5, 0.04, 2.6, blanco, -CALZADA / 2 + 0.6 + k * 0.9, 0.1, angN, (nx + mx) / 2, (nz + mz) / 2);
  puente.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
  if (lugares.get(N.puente)) {
    Object.assign(puente.userData, { id: N.puente, centro: new THREE.Vector3(px, 3, pz), mat: { pared: amarillo, techo: amarillo }, alto: 1 });
    puente.traverse((o) => { o.userData.edificio = puente; });
    edificios.push(puente);
  }
  escena.add(puente);
}

// ---------- planta de tratamiento de aguas (fotos): dos tanques grises, estructura azul con plataforma
// y techo, casetas blancas con techo verde y borde azul, y malla ciclón alrededor
if (datos.campus.planta && lugares.get(N.planta)) {
  const { centro: [cx, cz], giro } = datos.campus.planta;
  const g = new THREE.Group();
  const grisTanque = new THREE.MeshStandardMaterial({ color: 0xb4b8bb, roughness: 0.6, metalness: 0.2 });
  const azul = new THREE.MeshStandardMaterial({ color: 0x1f5fd0, roughness: 0.5, metalness: 0.3 });
  const blancoP = new THREE.MeshStandardMaterial({ color: 0xf6f6f3, roughness: 0.85 });
  const techoVerde = new THREE.MeshStandardMaterial({ color: 0x4f9a55, roughness: 0.7 });
  const tanque = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 5, 24), grisTanque); tanque.position.set(1.5, 2.5, 0); g.add(tanque);
  const tanque2 = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 2.6, 24), grisTanque); tanque2.position.set(7.2, 1.3, 0.5); g.add(tanque2);
  // estructura azul: columnas, plataforma con baranda y techo inclinado
  for (const [x, z] of [[-4, -2.4], [-4, 2.4], [-0.6, -2.4], [-0.6, 2.4]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7.4, 0.2), azul); c.position.set(x, 3.7, z); g.add(c); }
  const plat = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.15, 5.2), azul); plat.position.set(-0.6, 5.2, 0); g.add(plat);
  const baranda = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.08, 0.08), azul); baranda.position.set(-0.6, 6.2, 2.6); g.add(baranda);
  const techo = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 5.6), azul); techo.position.set(-2.3, 7.6, 0); techo.rotation.z = 0.12; g.add(techo);
  // casetas
  for (const [x, z, w] of [[-9, 1, 3.4], [-5.5, 3.2, 4.4]]) {
    const caseta = new THREE.Mesh(new THREE.BoxGeometry(w, 2.6, 3), blancoP); caseta.position.set(x, 1.3, z); g.add(caseta);
    const t = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, 3) / 2 + 0.5, 0.8, 4), techoVerde); t.position.set(x, 3, z); t.rotation.y = Math.PI / 4; t.scale.set(w / 3, 1, 1); g.add(t);
    const puerta = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2, 0.05), azul); puerta.position.set(x, 1, z + 1.53); g.add(puerta);
  }
  // malla ciclón
  const malla = new THREE.MeshLambertMaterial({ color: 0xc9ccd0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  for (const [w, x, z, rot] of [[23, -1, 5.5, 0], [23, -1, -4.5, 0], [10, -12.5, 0.5, Math.PI / 2], [10, 10.5, 0.5, Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2), malla); m.position.set(x, 1.1, z); m.rotation.y = rot; g.add(m);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano && o.material !== malla; o.receiveShadow = true; } });
  g.position.set(cx, 0, cz);
  g.rotation.y = giro;
  g.userData = { id: N.planta, centro: new THREE.Vector3(cx, 8, cz), mat: { pared: blancoP, techo: techoVerde }, alto: 5 };
  g.traverse((o) => { o.userData.edificio = g; });
  escena.add(g);
  edificios.push(g);
}

// ---------- parqueo junto a la piscina (satélite y fotos): asfaltado, dos filas de espacios espalda con
// espalda, topes amarillos, alumbrado con postes verdes de brazo doble y algunos carros estacionados
if (datos.campus.parqueo) {
  const { centro: [cx, cz], largo, ancho, giro, divisor } = datos.campus.parqueo;
  const g = new THREE.Group();
  const verdePoste = new THREE.MeshStandardMaterial({ color: 0x2f6b45, roughness: 0.6 });
  const amarilloTope = new THREE.MeshStandardMaterial({ color: 0xe6b800, roughness: 0.7 });
  const luz = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  const colores = [0x1f2a44, 0xf0f0ee, 0xb9bcbf, 0x9b1b2a, 0x2a2d31, 0xf0f0ee, 0x1f2a44, 0xc7c9cc];
  const azar = (i) => { const v = Math.sin(i * 37.1) * 43758.5; return v - Math.floor(v); };
  const espacios = Math.floor((largo - 2) / 2.6);
  let k = 0;
  for (const fila of [-1, 1]) {   // fila norte (-1) y fila sur (+1) del divisor
    for (let i = 0; i < espacios; i++, k++) {
      const x = -largo / 2 + 1 + 2.6 * (i + 0.5), z = divisor + fila * 2.5;
      const tope = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.25), amarilloTope); tope.position.set(x, 0.08, divisor + fila * 0.6); g.add(tope);
      continue;   // sin carros (pedido de la Sede)
      const carro = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: colores[k % colores.length], roughness: 0.35, metalness: 0.4 });
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 4.3), mat); cuerpo.position.y = 0.55; carro.add(cuerpo);
      const cabina = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.3), new THREE.MeshStandardMaterial({ color: 0x27323c, roughness: 0.2, metalness: 0.5 })); cabina.position.set(0, 1.2, 0.2 * fila); carro.add(cabina);
      carro.position.set(x, 0, z); g.add(carro);
    }
  }
  // rayas blancas, todas iguales (anotaciones): las de las dos filas del centro, la línea del divisor y, a la par,
  // una fila de espacios a lo largo del borde sur. Ya no van pintadas en la textura del suelo.
  // (anotaciones) en el borde norte no hay fila de espacios, y las rayas de la mitad norte del centro son más largas
  const blancoRaya = new THREE.MeshLambertMaterial({ color: 0xececE8 });
  const { rayas_bordes: fondoBorde, discapacidad } = datos.campus.parqueo;
  const xsRaya = [];
  for (let i = 0; -largo / 2 + 1 + 2.6 * i < largo / 2 - 0.9 - 1e-6; i++) xsRaya.push(-largo / 2 + 1 + 2.6 * i);
  const raya = (x, z, ancho_, largo_) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ancho_, 0.02, largo_), blancoRaya); m.position.set(x, 0.03, z); m.receiveShadow = true; g.add(m);
  };
  const LARGO_NORTE = 6.5;
  for (const x of xsRaya) {   // filas del centro, espalda con espalda
    raya(x, divisor + 2.5, 0.15, 5);
    raya(x, divisor - LARGO_NORTE / 2, 0.15, LARGO_NORTE);
  }
  raya(0, divisor, largo - 2, 0.15);                    // línea del divisor
  if (fondoBorde) {
    for (const x of xsRaya) raya(x, ancho / 2 - 0.3 - fondoBorde / 2, 0.15, fondoBorde);
  }
  // (anotaciones) espacio para personas con discapacidad: el del extremo este de la mitad norte del centro, con el
  // símbolo internacional de accesibilidad pintado en el suelo (blanco sobre azul)
  if (discapacidad) {
    const lienzo = document.createElement("canvas"); lienzo.width = lienzo.height = 128;
    const c2 = lienzo.getContext("2d");
    c2.fillStyle = "#1f5fbf"; c2.fillRect(0, 0, 128, 128);
    c2.fillStyle = c2.strokeStyle = "#ffffff"; c2.lineCap = "round"; c2.lineWidth = 11;
    c2.beginPath(); c2.arc(60, 24, 10, 0, Math.PI * 2); c2.fill();                         // cabeza
    c2.beginPath(); c2.moveTo(56, 40); c2.lineTo(52, 74); c2.lineTo(84, 74); c2.lineTo(96, 102); c2.stroke();   // cuerpo y piernas
    c2.beginPath(); c2.moveTo(54, 54); c2.lineTo(78, 54); c2.stroke();                     // brazo
    c2.lineWidth = 8; c2.beginPath(); c2.arc(54, 82, 26, Math.PI * 0.62, Math.PI * 1.85); c2.stroke();   // rueda
    const textura = new THREE.CanvasTexture(lienzo); textura.anisotropy = 4;
    if ("colorSpace" in textura) textura.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshLambertMaterial({ map: textura }));
    const xEste = xsRaya[xsRaya.length - 1];
    logo.rotation.set(-Math.PI / 2, 0, Math.PI);   // acostado en el suelo, se lee desde el pasillo norte
    logo.position.set((xEste + largo / 2) / 2, 0.035, divisor - 3.0); logo.receiveShadow = true; g.add(logo);
    // (anotaciones) otro en el espacio del extremo este de la fila sur del centro, leído desde el pasillo sur
    const logo2 = new THREE.Mesh(logo.geometry, logo.material);
    logo2.rotation.set(-Math.PI / 2, 0, 0); logo2.position.set((xEste + largo / 2) / 2, 0.035, divisor + 2.7); logo2.receiveShadow = true; g.add(logo2);
  }
  // alumbrado: postes en el divisor y en el borde sur, cada uno con dos luminarias
  for (const [x, z] of [[-largo / 2 + 1.2, divisor], [largo / 2 - 1.2, divisor], [-largo / 2 + 1.2, ancho / 2 - 1], [largo / 2 - 1.2, ancho / 2 - 1]]) {
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 8.5, 8), verdePoste); poste.position.set(x, 4.25, z); g.add(poste);
    const brazo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.6), verdePoste); brazo.position.set(x, 8.4, z); g.add(brazo);
    for (const dz of [-1.3, 1.3]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), luz); l.position.set(x, 8.32, z + dz); g.add(l); }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = !liviano; });
  g.position.set(cx, 0, cz);
  g.rotation.y = -giro;   // x local = este de la piscina, z local = sur
  escena.add(g);
  if (lugares.get(N.parqueo_piscina)) {
    g.userData = { id: N.parqueo_piscina, centro: new THREE.Vector3(cx, 3, cz), mat: { pared: verdePoste, techo: amarilloTope }, alto: 1, menor: true };
    g.traverse((o) => { o.userData.edificio = g; });
    edificios.push(g);
  }
}

// ---------- lugares sin edificio que marcó la Sede (anotaciones y fotos): pasillos techados, casetas, parqueos,
// la alcantarilla de la quebrada, la explanada en lo alto, el puente peatonal y la entrada al jardín
{
  const azar = (i) => { const v = Math.sin(i * 53.3) * 43758.5; return v - Math.floor(v); };
  const caja = new THREE.BoxGeometry(1, 1, 1);
  const eu = new THREE.Euler(0, 0, 0, "YXZ");
  // muchas cajas iguales en una sola llamada de dibujo: [x, y, z, ancho, alto, largo, giro, inclinación, ladeo]
  function cajas(mat, lista) {
    const m = new THREE.InstancedMesh(caja, mat, Math.max(lista.length, 1)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    m.count = lista.length;
    lista.forEach(([x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0], i) => {
      q.setFromEuler(eu.set(rx, ry, rz)); m.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)));
    });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = !liviano; m.receiveShadow = true;
    return m;
  }
  function registrar(g, id, centro, mat, alto = 1) {
    g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.castShadow = !liviano && !o.material.transparent; o.receiveShadow = true; } });
    escena.add(g);
    if (id && lugares.get(id)) {
      g.userData = { ...g.userData, id, centro, mat, alto, menor: true };   // sin perder `lineal` y `franjas` (pasillos con número)
      g.traverse((o) => { o.userData.edificio = g; });
      edificios.push(g);
    }
  }
  const mate = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const concretoClaro = mate(0xc8c6bf, { roughness: 0.95 });
  const azulColumna = mate(0x4f7fb0, { roughness: 0.6 });
  const laminaVerde = mate(0x7fae9f, { roughness: 0.55, metalness: 0.25 });
  const amarilloGuia = mate(0xe8b42a);
  const celesteMuro = mate(0x9ccbe8, { roughness: 0.9 });
  const blanco = mate(0xf6f5f0, { roughness: 0.85 });
  const sinUso = () => new THREE.MeshStandardMaterial();   // para resaltar sin cambiar el color de nada
  // mural de colores (manchas y figuras inventadas: sugiere un mural, no copia ninguno)
  const texturaMural = texturaMuralEd;
  // techo a dos aguas de lámina sobre un tramo (de a hasta b), con caída de y0 a y1
  function tramoTecho(lista, a, b, y0, y1, ancho) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.12, ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2, nx = Math.cos(ang), nz = -Math.sin(ang);
    const pend = Math.atan2(y1 - y0, L), mitad = ancho / 2 + 0.45, cai = 0.26;
    for (const lado of [-1, 1]) {
      const d = (mitad / 2) * Math.cos(cai);
      lista.push([cx + nx * lado * d, (y0 + y1) / 2 + 2.75 + (mitad / 2) * Math.sin(cai), cz + nz * lado * d, mitad, 0.07, L / Math.cos(pend), ang, -pend, -lado * cai]);
    }
  }

  // pasillo techado (fotos): losa de concreto con guía táctil amarilla, columnas y cerchas azules, techo a dos
  // aguas de lámina verde agua y baranda azul del lado del zacate. Sin techo, es un sendero; si sube, va sobre
  // un muro celeste (las rampas a la explanada)
  function pasillo({ id, puntos, ancho, techo = true, en_calle = [], alturas = [], baranda = true, rasante_recta = false }) {
    const g = new THREE.Group(), pisos = [], guias = [], techos = [], columnas = [], barandas = [], muros = [];
    // sigue el terreno tramo a tramo (ver «asentar»); las franjas son los tramos de piso fuera de la calle
    const franjas = [];
    puntos.forEach((p, i) => { if (en_calle[i]) franjas.push([]); else (franjas.at(-1) || franjas[franjas.push([]) - 1]).push(p); });
    Object.assign(g.userData, { lineal: true, franjas: franjas.filter((f) => f.length > 1), ancho, rasanteRecta: rasante_recta });   // rasante_recta: id del lugar al que llega a nivel
    const y = (i) => alturas[i] || 0;
    for (let i = 0; i < puntos.length - 1; i++) {
      if (en_calle[i] || en_calle[i + 1]) continue;
      const [ax, az] = puntos[i], [bx, bz] = puntos[i + 1];
      const L = Math.hypot(bx - ax, bz - az) + 0.12, ang = Math.atan2(bx - ax, bz - az), pend = Math.atan2(y(i + 1) - y(i), L);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, ym = (y(i) + y(i + 1)) / 2, nx = Math.cos(ang), nz = -Math.sin(ang);
      pisos.push([cx, ym + 0.06, cz, ancho, 0.12, L, ang, -pend]);
      guias.push([cx, ym + 0.125, cz, 0.36, 0.02, L, ang, -pend]);
      if (ym > 0.25) for (const lado of [-1, 1]) muros.push([cx + nx * lado * (ancho / 2 - 0.1), ym / 2, cz + nz * lado * (ancho / 2 - 0.1), 0.2, ym, L, ang]);
      const lados = !baranda ? [] : techo ? [1] : [-1, 1];
      for (const lado of lados) barandas.push([cx + nx * lado * (ancho / 2 - 0.08), ym + 0.95, cz + nz * lado * (ancho / 2 - 0.08), 0.06, 0.06, L, ang, -pend]);
      if (techo) tramoTecho(techos, [ax, az], [bx, bz], y(i), y(i + 1), ancho);
    }
    if (techo) puntos.forEach(([x, z], i) => {
      if (en_calle[i]) return;
      const [ax, az] = puntos[Math.max(i - 1, 0)], [bx, bz] = puntos[Math.min(i + 1, puntos.length - 1)];
      const L = Math.hypot(bx - ax, bz - az) || 1, nx = (bz - az) / L, nz = -(bx - ax) / L;
      for (const lado of [-1, 1]) {
        columnas.push([x + nx * lado * (ancho / 2), y(i) + 1.37, z + nz * lado * (ancho / 2), 0.16, 2.74, 0.16]);
        columnas.push([x + nx * lado * (ancho / 2), y(i) + 0.15, z + nz * lado * (ancho / 2), 0.36, 0.3, 0.36]);   // base de concreto azul
      }
    });
    g.add(cajas(concretoClaro, pisos), cajas(amarilloGuia, guias), cajas(azulColumna, barandas));
    if (muros.length) g.add(cajas(celesteMuro, muros));
    if (techo) g.add(cajas(laminaVerde, techos), cajas(azulColumna, columnas));
    const [mx, mz] = puntos[Math.floor(puntos.length / 2)];
    registrar(g, id, new THREE.Vector3(mx, 3.5, mz), techo ? { pared: azulColumna, techo: laminaVerde } : { pared: sinUso(), techo: sinUso() }, techo ? 1 : 0);
  }

  // casetas y anexos, cada uno como en sus fotos
  function caseta({ id, p, giro, largo, ancho, alto, uso, elevada = 0 }) {
    const g = new THREE.Group();
    let pared = blanco, techoM = mate(0x66756b, { roughness: 0.7 });
    const bloque = (w, h, d, mat, x = 0, yy = h / 2, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, yy, z); g.add(m); return m; };
    const puerta = (x, z, mat, giroP = 0, yy = 0) => { const m = bloque(0.9, 2.05, 0.06, mat, x, yy + 1.03, z); m.rotation.y = giroP; };
    if (uso === "guarda") {   // gris claro con ventanales, losa blanca inclinada sobre dos columnas de acero inclinadas
      pared = mate(0xc9ccd0);
      bloque(largo, alto, ancho, pared);
      bloque(largo + 0.08, 1.05, ancho + 0.08, vidrio, 0, 1.6);
      techoM = mate(0xf4f5f6);
      const losa = bloque(largo + 2.2, 0.18, ancho + 1.6, techoM, 0.6, alto + 0.3); losa.rotation.z = 0.06;
      for (const z of [-ancho / 2 - 0.4, ancho / 2 + 0.4]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, alto + 0.4, 8), acero); c.position.set(largo / 2 + 1.2, (alto + 0.4) / 2, z); c.rotation.z = 0.25; g.add(c); }
      puerta(0, ancho / 2 + 0.05, vidrio);
    } else if (uso === "ala_moderna") {
      // Entrada y baños del Auditorio (fotos). El frente es la punta +x; el Auditorio queda hacia -z.
      //  · baños (+z): bloque blanco con banda alta de celosías grises y una tira de ventanas abatibles, bajo su propio
      //    techo plano blanco de vigas oscuras, volado y un poco subido hacia afuera;
      //  · el paso abierto entre los dos bloques, con la baranda de la rampa al fondo y los basureros de reciclaje;
      //  · el bloque de la entrada (-z): blanco, con la puerta doble de vidrio del Auditorio y la puerta oscura del
      //    cuarto IDF; encima, el muro de paneles grises que sube bajo el techo grande;
      //  · el techo grande: losa blanca con vigas oscuras por debajo que sube hacia el Auditorio (en mariposa con el de
      //    los baños), volada al frente sobre una columna en V de dos tubos grises sobre un dado de concreto;
      //  · adelante, plaza de concreto con guía amarilla, dos bancas celestes de concreto, una lámpara de poste y el
      //    parqueo de bicicletas de adoquín con tubos en U junto a la calle
      const fx = largo / 2;
      const zB0 = 0.6, zB1 = ancho / 2, zE0 = -ancho / 2, zE1 = -2.4;     // baños, entrada (en z); el paso entre ellos
      const oscuro = mate(0x3a4046, { roughness: 0.5 }), grisPanel = mate(0x9aa1a6, { roughness: 0.7 });
      const concretoP = mate(0xc9c5bc, { roughness: 0.95 }), amarilloG = mate(0xd6a92a, { roughness: 0.8 });
      const acG = mate(0x8c9196, { roughness: 0.45, metalness: 0.5 });
      const xB0 = -fx + 1, xB1 = fx - 1.5, hB = 3.3;
      // baños
      bloque(xB1 - xB0, hB, zB1 - zB0, pared, (xB0 + xB1) / 2, hB / 2, (zB0 + zB1) / 2);
      bloque(xB1 - xB0 + 0.06, 0.9, zB1 - zB0 + 0.06, grisPanel, (xB0 + xB1) / 2, hB - 0.45, (zB0 + zB1) / 2);
      for (let k = 0; k < 6; k++) bloque(0.04, 0.025, zB1 - zB0 - 0.3, oscuro, xB1 + 0.05, hB - 0.82 + k * 0.14, (zB0 + zB1) / 2);
      for (let k = 0; k < 6; k++) bloque(xB1 - xB0 - 0.3, 0.025, 0.04, oscuro, (xB0 + xB1) / 2, hB - 0.82 + k * 0.14, zB1 + 0.05);
      const nV = 9;
      for (let k = 0; k < nV; k++) {
        const z = zB0 + 0.4 + ((zB1 - zB0 - 0.8) * (k + 0.5)) / nV;
        const v = bloque(0.05, 0.28, (zB1 - zB0 - 0.8) / nV - 0.08, vidrio, xB1 + 0.06, 2.05, z); v.rotation.z = 0.35;
      }
      bloque(0.06, 0.04, zB1 - zB0 - 0.6, oscuro, xB1 + 0.05, 1.88, (zB0 + zB1) / 2);
      for (let k = 0; k < nV; k++) bloque((xB1 - xB0 - 0.8) / nV - 0.08, 0.28, 0.05, vidrio, xB0 + 0.4 + ((xB1 - xB0 - 0.8) * (k + 0.5)) / nV, 2.05, zB1 + 0.06);
      const techoBlanco = mate(0xf2f2ee);
      techoM = techoBlanco;
      { // techo de los baños: sube hacia afuera (+z)
        const t = new THREE.Group(), largoT = xB1 - xB0 + 2.6, anchoT = zB1 - zB0 + 1.8;
        const losaB = new THREE.Mesh(new THREE.BoxGeometry(largoT, 0.16, anchoT), techoBlanco); t.add(losaB);
        for (let x = -largoT / 2 + 0.4; x < largoT / 2; x += 1.2) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, anchoT - 0.1), oscuro); v.position.set(x, -0.16, 0); t.add(v); }
        const borde = new THREE.Mesh(new THREE.BoxGeometry(largoT, 0.3, 0.08), techoBlanco); borde.position.set(0, -0.05, anchoT / 2); t.add(borde);
        t.position.set((xB0 + xB1) / 2 + 0.9, hB + 0.55, (zB0 + zB1) / 2 + 0.6); t.rotation.x = -0.07; g.add(t);
        for (const x of [xB0 + 0.3, xB1 - 0.3]) bloque(0.12, 0.55, 0.12, oscuro, x, hB + 0.27, zB1 - 0.2);
      }
      // paso: piso, muro de contención al fondo con la baranda de la rampa y los basureros
      bloque(fx - xB0 + 0.5, 0.08, zB0 - zE1, concretoP, (xB0 + fx) / 2, 0.04, (zB0 + zE1) / 2);
      bloque(0.4, 2.4, zB0 - zE1 + 1, mate(0xb9b6ae, { roughness: 1 }), xB0 - 1.2, 1.2, (zB0 + zE1) / 2);
      for (const y of [0.5, 0.9]) bloque(fx - xB0 - 2.5, 0.05, 0.05, acG, (xB0 + fx - 2.5) / 2, y, zE1 + 0.25);
      for (let x = xB0 + 0.3; x < fx - 2.5; x += 1.5) bloque(0.05, 0.9, 0.05, acG, x, 0.45, zE1 + 0.25);
      [0x2a6fc0, 0x55595d, 0x26292c].forEach((c_, k) => {
        bloque(0.55, 0.85, 0.5, mate(c_), fx - 3.0, 0.43, zE1 + 0.75 + k * 0.6);
      });
      bloque(0.05, 0.4, 1.8, mate(0x3f7fc0), fx - 2.72, 1.3, zE1 + 1.35);
      // bloque de la entrada
      const xE1 = fx - 0.8;
      bloque(xE1 - xB0, 3.1, zE1 - zE0, pared, (xB0 + xE1) / 2, 1.55, (zE0 + zE1) / 2);
      bloque(xE1 - xB0 + 0.3, 2.3, 0.2, grisPanel, (xB0 + xE1) / 2, 4.2, zE1 + 0.3);   // paneles grises que suben
      bloque(0.2, 2.3, zE1 - zE0, grisPanel, xE1 - 0.2, 4.2, (zE0 + zE1) / 2);
      for (const [y, x] of [[1.6, -1.5], [2.5, -1.5], [1.6, 0.6], [2.5, 0.6]]) bloque(0.9, 0.55, 0.05, vidrio, x, y, zE1 + 0.03);   // ventanitas al paso
      bloque(0.3, 3.1, 1.9, pared, xE1 + 0.15, 1.55, zE1 - 1.25);                       // marco hundido de la puerta
      bloque(0.06, 2.35, 1.6, vidrio, xE1 - 0.15, 1.2, zE1 - 1.25);
      bloque(0.08, 2.4, 0.06, oscuro, xE1 - 0.12, 1.2, zE1 - 1.25);
      bloque(0.05, 0.3, 0.9, mate(0x1f4f9a), xE1 + 0.32, 2.75, zE1 - 1.25);              // rótulo «Auditorio»
      bloque(0.06, 2.2, 1.0, oscuro, xE1 + 0.03, 1.1, zE1 - 3.0);                        // puerta del cuarto IDF
      bloque(0.05, 0.25, 0.5, mate(0x1f4f9a), xE1 + 0.07, 1.75, zE1 - 3.0);
      // techo grande: sube hacia el Auditorio (-z); volado al frente
      const yLo = 4.7, yHi = 6.4, xT0 = xB0 - 1.0, xT1 = fx + 4.2, zT0 = zB0 + 0.4, zT1 = zE0 - 0.8;
      const pend = Math.atan2(yHi - yLo, zT0 - zT1), Lz = Math.hypot(zT0 - zT1, yHi - yLo);
      const yEn = (z) => yLo + ((zT0 - z) / (zT0 - zT1)) * (yHi - yLo);
      { const t = new THREE.Group();
        const losaG = new THREE.Mesh(new THREE.BoxGeometry(xT1 - xT0, 0.2, Lz), techoBlanco); t.add(losaG);
        for (let x = xT0 + 0.5; x < xT1; x += 1.3) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, Lz - 0.1), oscuro); v.position.set(x - (xT0 + xT1) / 2, -0.2, 0); t.add(v); }
        for (const zz of [-Lz / 2 + 0.3, 0, Lz / 2 - 0.3]) { const v = new THREE.Mesh(new THREE.BoxGeometry(xT1 - xT0, 0.26, 0.16), oscuro); v.position.set(0, -0.3, zz); t.add(v); }
        const canto = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, Lz), techoBlanco); canto.position.set((xT1 - xT0) / 2, -0.05, 0); t.add(canto);
        t.position.set((xT0 + xT1) / 2, (yLo + yHi) / 2, (zT0 + zT1) / 2); t.rotation.x = pend; g.add(t);
        for (const x of [xT1 - 0.3, (xT0 + xT1) / 2]) {   // reflectores en el canto
          const r = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.35), mate(0x2a2d30)); r.position.set(x, yEn(zT1 + 0.4) - 0.05, zT1 + 0.4); g.add(r);
        }
      }
      // columna en V: dos tubos grises desde un dado de concreto al frente del paso
      const xV = fx + 1.6, zV = (zB0 + zE1) / 2;
      bloque(0.9, 0.45, 0.9, mate(0xd4d1ca), xV, 0.22, zV);
      for (const zTop of [zV + 1.3, zV - 1.7]) {
        const yTop = yEn(zTop) - 0.35, dz = zTop - zV, Lc = Math.hypot(dz, yTop - 0.45);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, Lc, 12), acG);
        c.position.set(xV, 0.45 + (yTop - 0.45) / 2, zV + dz / 2); c.rotation.x = Math.atan2(dz, yTop - 0.45); g.add(c);
      }
      // plaza de concreto con guía táctil amarilla, bancas celestes y lámpara
      bloque(6.5, 0.07, zB1 - zE0 + 1, concretoP, fx + 3.25, 0.035, (zB1 + zE0) / 2 - 0.5);
      bloque(6.5, 0.02, 0.3, amarilloG, fx + 3.25, 0.08, zV);
      bloque(0.3, 0.02, zB1 - zE0, amarilloG, fx + 5.8, 0.08, (zB1 + zE0) / 2);
      bloque(1.6, 0.02, 0.3, amarilloG, fx + 0.8, 0.08, zE1 - 1.25);
      // (anotaciones) sin bancas ni lámpara frente al ala; el parqueo de bicicletas va más afuera, en el zacate junto
      // a la calle, frente a los baños
      const xBici = fx + 15.0, zBici = zB0 + 1.2;
      bloque(2.6, 0.12, 4.4, mate(0x8e5a4c, { roughness: 0.95 }), xBici, 0.06, zBici);
      bloque(0.15, 0.35, 4.5, mate(0xb8b5ad), xBici - 1.35, 0.17, zBici);
      const inox = mate(0xd9dde1, { metalness: 0.7, roughness: 0.25 });
      for (let k = 0; k < 4; k++) {
        const u = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 14, Math.PI), inox);
        u.position.set(xBici - 0.3, 0.12, zBici - 1.5 + k * 1.0); u.rotation.y = Math.PI / 2; g.add(u);
      }
    } else if (uso === "torre") {   // caseta de arriba: dos niveles, cuartos eléctricos abajo, escalera metálica azul
      const azulEsc = mate(0x2f5fb0, { roughness: 0.5, metalness: 0.3 });
      bloque(largo, elevada, ancho, pared, 0, elevada / 2);
      for (const z of [-ancho / 4, ancho / 4]) puerta(largo / 2 + 0.05, z, azulEsc, Math.PI / 2);   // cuartos eléctricos
      bloque(largo, alto, ancho, pared, 0, elevada + alto / 2);
      bloque(largo + 0.08, 0.9, ancho + 0.08, vidrio, 0, elevada + alto * 0.62);
      techoM = mate(0xe6e8ea);
      bloque(largo + 1.4, 0.18, ancho + 1.4, techoM, 0, elevada + alto + 0.1);
      // (anotaciones) la escalera corre pegada a la cara que no mira al pabellón 1: sube a lo largo de la pared
      // hasta la puerta de arriba, con su techito de lámina gris
      const n = Math.round(elevada / 0.2), run = elevada * 1.5, ze = -ancho / 2 - 0.6, xTop = largo / 2 - 0.4;
      for (let i = 0; i < n; i++) bloque(run / n + 0.05, 0.06, 1.0, azulEsc, xTop - run + (run / n) * (i + 0.5), (elevada * (i + 1)) / n, ze);
      bloque(1.0, 0.06, 1.0, azulEsc, xTop + 0.5, elevada, ze);   // descanso frente a la puerta
      bloque(Math.hypot(run, elevada), 0.05, 0.05, azulEsc, xTop - run / 2, elevada / 2 + 0.9, ze - 0.5).rotation.z = Math.atan2(elevada, run);
      const t = bloque(run + 1.4, 0.06, 1.6, mate(0x4a5056), xTop - run / 2 + 0.3, elevada + 2.4, ze); t.rotation.x = -0.25;
      puerta(largo / 2 - 0.45, -ancho / 2 - 0.05, azulEsc, 0, elevada);
    } else if (uso === "banos_crema") {
      // baño de Docencia (fotos, nov. 2026): blanco, techo verde a una agua con borde blanco; da a Docencia (+z) por
      // un pasillo angosto de piso de cerámica blanca brillante, techado, abierto en las dos puntas hasta el zacate.
      // En el baño, puertas corredizas de vidrio esmerilado con marco de aluminio y el rótulo de BAÑOS (una abierta, con
      // el azulejo azul adentro); contra la pared de Docencia, los casilleros de correo con afiches, un armario blanco
      // de metal, el rótulo amarillo de piso mojado y matas en macetas. En la punta de afuera, una pila de acero sobre
      // ménsulas con un galón y una enredadera
      pared = mate(0xf4f2e6);
      bloque(largo, alto, ancho, pared);
      techoM = mate(0x2f6b45);
      const t = bloque(largo + 1.2, 0.12, ancho + 1.4, techoM, 0, alto + 0.25); t.rotation.x = 0.12;
      bloque(largo + 1.25, 0.25, 0.08, blanco, 0, alto + 0.05, ancho / 2 + 0.7);
      const zf = ancho / 2, zD = 6.5;   // frente del baño y pared de Docencia (cara noroeste)
      const ceramica = mate(0xeef0ef, { roughness: 0.12, metalness: 0.15 }), alu = mate(0xbfc4c8, { roughness: 0.35, metalness: 0.6 });
      const esmerilado = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.9 });
      // (anotaciones) el piso sigue más allá de las puntas del baño hasta empatar con el corredor de Docencia
      const anchoPiso = largo + 4.4;
      g.userData.nivelDe = 4;   // a la altura de Docencia: si no, al emparejar su huella el zacate tapa el corredor de Docencia
      bloque(anchoPiso, 0.18, zD - zf + 0.2, ceramica, 0, 0.09, (zf + zD) / 2 - 0.1);                       // piso del pasillo
      for (let k = 1; k < 6; k++) bloque(anchoPiso, 0.005, 0.02, mate(0xc9ccca), 0, 0.185, zf + ((zD - zf) * k) / 6);   // juntas
      bloque(largo + 0.6, 0.08, zD - zf - 1.2, mate(0x9fd8c0, { roughness: 0.6 }), 0, alto + 0.35, zf + (zD - zf - 1.2) / 2);   // techo verde menta
      bloque(largo + 0.6, 0.06, zD - zf - 1.2, mate(0xf2f3f1, { roughness: 0.2, metalness: 0.2 }), 0, alto + 0.27, zf + (zD - zf - 1.2) / 2);
      // puertas corredizas de vidrio esmerilado, una abierta
      for (const [x, abierta] of [[-1.3, true], [0.2, false], [1.7, false]]) {
        bloque(1.3, 2.3, 0.06, alu, x, 1.33, zf + 0.04);
        bloque(1.16, 2.16, 0.04, abierta ? mate(0x2a5aa8, { roughness: 0.3 }) : esmerilado, x, 1.33, zf + 0.07);
        if (abierta) bloque(1.16, 2.16, 0.04, esmerilado, x + 0.6, 1.33, zf + 0.12);
        bloque(0.04, 0.5, 0.05, alu, x + (abierta ? 0.1 : 0.45), 1.2, zf + 0.16);
      }
      const rot = (w, h, dibujar) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; dibujar(cv.getContext("2d"), w, h); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: tx }); };
      const banos = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42), rot(64, 96, (x, w, h) => { x.fillStyle = "#f4f6f4"; x.fillRect(0, 0, w, h); x.fillStyle = "#1f4f9a"; x.font = "700 13px Arial"; x.textAlign = "center"; x.fillText("BAÑOS", w / 2, 18); x.fillStyle = "#333"; for (let k = 0; k < 3; k++) x.fillRect(8 + k * 17, 30, 14, 20); x.fillStyle = "#3f8f3a"; x.fillRect(8, 60, 48, 28); }));
      banos.position.set(-0.55, 2.05, zf + 0.1); g.add(banos);
      // contra la pared de Docencia: casilleros de correo con afiches, armario blanco, rótulo de piso mojado y matas
      const beige = mate(0xd6d2c3, { roughness: 0.6, metalness: 0.25 });
      for (const x of [-1.6, -0.75]) {
        bloque(0.8, 1.85, 0.42, beige, x, 1.05, zD - 0.25);
        for (let f = 0; f < 6; f++) for (let c = 0; c < 3; c++) bloque(0.22, 0.24, 0.02, mate(0xc3bfb0), x - 0.26 + c * 0.26, 0.4 + f * 0.27, zD - 0.47);
        for (const yy of [0.18, 0.12]) bloque(0.04, 0.45, 0.04, mate(0xa8a8a2), x + (yy > 0.15 ? -0.36 : 0.36), 0.22, zD - 0.3);
      }
      const afiche = (x, y, color, texto) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), rot(64, 84, (c, w, h) => { c.fillStyle = color; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = "700 9px Arial"; c.textAlign = "center"; c.fillText(texto, w / 2, 16); c.fillStyle = "#111"; c.fillRect(w * 0.55, h * 0.55, 22, 22); })); m.position.set(x, y, zD - 0.475); m.rotation.y = Math.PI; g.add(m); };
      afiche(-1.6, 1.55, "#3d8fd0", "PARTICIPÁ"); afiche(-1.6, 0.75, "#4f7fbf", "LO QUE TE PASA");
      bloque(0.7, 2.0, 0.45, mate(0xece9df, { roughness: 0.5, metalness: 0.2 }), 1.9, 1.15, zD - 0.3);   // armario blanco
      for (const dx of [-0.3, 0.3]) bloque(0.04, 0.3, 0.04, mate(0x8a6a4a), 1.9 + dx, 0.15, zD - 0.3);
      const aviso = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 4), mate(0xf2c400, { roughness: 0.5 })); aviso.position.set(-2.3, 0.53, zD - 0.7); aviso.rotation.y = Math.PI / 4; aviso.scale.z = 0.4; g.add(aviso);
      for (const [x, z] of [[-0.2, zD - 0.35], [0.9, zf + 0.35]]) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 10), mate(0xc0612f)); pot.position.set(x, 0.33, z); g.add(pot);
        for (let k = 0; k < 6; k++) { const h = bloque(0.05, 0.6, 0.02, mate(0x3f7a3a), x, 0.75, z); h.rotation.set((k % 3 - 1) * 0.4, k, (k % 2 ? 1 : -1) * 0.35); }
      }
      // pila de acero en la punta de afuera (-x), con su galón y la enredadera
      const xS = -largo / 2 - 0.3;
      bloque(1.3, 0.18, ancho + 0.3, ceramica, -largo / 2 - 0.65, 0.09, (zf - ancho / 2 - 0.3) / 2);   // (anotaciones) piso bajo la pila
      bloque(0.55, 0.06, 1.0, alu, xS, 0.92, -0.2); bloque(0.45, 0.2, 0.45, alu, xS, 0.8, 0.05);
      for (const dz of [-0.6, 0.25]) { const m = bloque(0.04, 0.55, 0.04, mate(0x7a7f84), xS + 0.05, 0.68, dz); m.rotation.z = 0.6; }
      bloque(0.04, 0.3, 0.04, alu, xS + 0.2, 1.1, 0.05);
      bloque(0.2, 0.3, 0.2, mate(0xf4f4f0, { roughness: 0.4 }), xS, 0.33, 0.55);
      for (let k = 0; k < 5; k++) { const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), mate(0x3f8a3a, { flatShading: true })); h.position.set(xS - 0.05, 0.25 + (k % 3) * 0.25, -1.0 - (k % 2) * 0.35 - Math.floor(k / 3) * 0.3); g.add(h); }
    } else if (uso === "banos_mural") {   // baño del pabellón 7: dos aguas, alero celeste, celosías y mural
      bloque(largo, alto, ancho, mate(0xdfeaf4));
      bloque(largo + 0.08, 0.5, ancho + 0.08, celosia, 0, alto - 0.4);
      // (anotaciones) el mural va en la punta oeste, la que da al pasillo techado
      const mural = new THREE.Mesh(new THREE.PlaneGeometry(ancho * 0.85, alto * 0.6), new THREE.MeshBasicMaterial({ map: texturaMural(11, "#cfe3f5") }));
      mural.position.set(-largo / 2 - 0.05, alto * 0.42, 0); mural.rotation.y = -Math.PI / 2; g.add(mural);
      techoM = mate(0x8f9c98, { metalness: 0.25 });
      for (const lado of [-1, 1]) { const t = bloque(largo + 1.2, 0.08, ancho / 2 + 1, techoM, 0, alto + 0.45, lado * (ancho / 4 + 0.3)); t.rotation.x = lado * 0.22; }
      bloque(largo + 1.25, 0.3, 0.1, mate(0xa9d4ef), 0, alto + 0.05, ancho / 2 + 0.95);
    } else {
      bloque(largo, alto, ancho, pared);
      bloque(largo + 1.2, 0.16, ancho + 1.2, techoM, 0, alto + 0.08);
    }
    g.position.set(p[0], 0, p[1]); g.rotation.y = -giro;
    registrar(g, id, new THREE.Vector3(p[0], alto + elevada + 2, p[1]), { pared, techo: techoM }, alto);
  }

  // parqueo asfaltado (asfalto y rayas en la textura): topes amarillos, alumbrado verde y, si lleva, carport
  // de lámina verde a una agua sobre columnas azules con base amarilla. Sin carros.
  function parqueo({ id, centro: [cx, cz], largo, ancho, giro, filas, techado, techado_desde = 0, postes = true, espacio: E = 2.6 }) {
    const g = new THREE.Group();
    const tope = mate(0xe6b800, { roughness: 0.7 }), verdePoste = mate(0x2f6b45, { roughness: 0.6 });
    for (const { z: zv, fondo, n } of filas) {
      const z = -zv, lado = Math.sign(z) || 1;   // la fila mide z hacia la izquierda del giro; en la maqueta es -z
      for (let i = 0; i < n; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.25), tope); t.position.set((-n / 2 + i + 0.5) * E, 0.08, z + lado * (fondo / 2 - 0.6)); g.add(t);
      }
      if (techado) {
        const k = Math.min(techado, n - techado_desde), x0 = (-n / 2 + techado_desde) * E, L = k * E;
        const t = new THREE.Mesh(new THREE.BoxGeometry(L + 0.6, 0.08, fondo + 1), mate(0x4e8a62, { roughness: 0.55, metalness: 0.25 }));
        t.position.set(x0 + L / 2, 2.75, z); t.rotation.x = lado * 0.07; g.add(t);
        const losa = new THREE.Mesh(new THREE.BoxGeometry(L, 0.18, fondo), concretoClaro); losa.position.set(x0 + L / 2, 0.09, z); g.add(losa);
        for (let i = 0; i <= k; i++) for (const dz of [-1, 1]) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.16), azulColumna); c.position.set(x0 + i * E, 1.35, z + dz * (fondo / 2)); g.add(c);
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), tope); b.position.set(x0 + i * E, 0.25, z + dz * (fondo / 2)); g.add(b);
        }
      }
    }
    if (postes) for (const x of postes === "lejos" ? [largo / 2 - 0.8] : [-largo / 2 + 0.8, largo / 2 - 0.8]) {   // "lejos": solo el de la punta +x
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8), verdePoste); poste.position.set(x, 3.75, -ancho / 2 + 0.6); g.add(poste);
      const lampara = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.9), new THREE.MeshBasicMaterial({ color: 0xfff3c4 })); lampara.position.set(x, 7.4, -ancho / 2 + 1.1); g.add(lampara);
    }
    g.position.set(cx, 0, cz); g.rotation.y = -giro;
    registrar(g, id, new THREE.Vector3(cx, 3, cz), { pared: verdePoste, techo: tope });
  }

  // escalera de concreto con pasamanos gris; la larga entre el 1 y el 2 va techada
  function escalera({ p, giro, largo, ancho, alto, techado, pasamanos }) {
    const g = new THREE.Group(), h = alto * EXAGERAR, n = Math.max(3, Math.round(h / 0.17));
    for (let i = 0; i < n; i++) {
      const paso = new THREE.Mesh(new THREE.BoxGeometry(largo / n + 0.02, (h * (i + 1)) / n, ancho), concretoClaro);
      paso.position.set(-largo / 2 + (largo / n) * (i + 0.5), (h * (i + 1)) / n / 2, 0); g.add(paso);
    }
    const tubo = mate(0xaab0b5, { roughness: 0.5, metalness: 0.4 }), pend = Math.atan2(h, largo);
    if (pasamanos === "u") {   // (foto) una sola baranda azul en U, en medio, desde arriba de la escalera
      const azulB = mate(0x8fb8dc, { roughness: 0.5, metalness: 0.3 });
      for (const dz of [-0.05, 0.05]) for (const x of [largo / 2 - 0.15, largo / 2 - 0.15 - 0.45]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), azulB); c.position.set(x, h + 0.5, dz); g.add(c); }
      const arco = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.04, 6, 12, Math.PI), azulB); arco.position.set(largo / 2 - 0.375, h + 1.0, 0); g.add(arco);
      const trav = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), azulB); trav.rotation.z = Math.PI / 2; trav.position.set(largo / 2 - 0.375, h + 0.55, 0); g.add(trav);
    } else for (const lado of [-1, 1]) {
      const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, Math.hypot(largo, h), 6), tubo);
      pm.rotation.z = Math.PI / 2 - pend; pm.position.set(0, h / 2 + 0.9, lado * (ancho / 2 - 0.1)); g.add(pm);
      for (const t of [-0.45, 0, 0.45]) { const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), tubo); poste.position.set(t * largo, h * (0.5 + t) + 0.45, lado * (ancho / 2 - 0.1)); g.add(poste); }
    }
    if (techado) {
      const techos = [], columnas = [];
      // en el marco local la escalera sube por x: el techo va de 0 (abajo) a h (arriba, del lado del 1)
      tramoTecho(techos, [-largo / 2, 0], [largo / 2, 0], 0, h, ancho);
      g.add(cajas(laminaVerde, techos));
      for (const t of [-0.5, 0, 0.5]) for (const lado of [-1, 1]) columnas.push([t * largo, h * (0.5 + t) + 1.37, lado * (ancho / 2 + 0.05), 0.16, 2.74, 0.16]);
      g.add(cajas(azulColumna, columnas));
    }
    g.position.set(p[0], 0, p[1]); g.rotation.y = -giro;
    registrar(g, null);
  }

  // rampa (Ley 7600): losa inclinada entre muretes celestes con pasamanos, techada como los pasillos
  function rampa({ desde, hasta, ancho, alto, base = 0, techado }) {
    const g = new THREE.Group(), h = alto * EXAGERAR, y0 = base * EXAGERAR;
    const dx = hasta[0] - desde[0], dz = hasta[1] - desde[1], L = Math.hypot(dx, dz), pend = Math.atan2(h, L);
    const losaR = new THREE.Mesh(new THREE.BoxGeometry(ancho, 0.2, Math.hypot(L, h)), concretoClaro);
    losaR.position.set(0, y0 + h / 2, L / 2); losaR.rotation.x = -pend; g.add(losaR);
    for (const lado of [-1, 1]) {
      const muro = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, L), celesteMuro);
      muro.scale.y = y0 + h / 2 + 0.5; muro.position.set(lado * (ancho / 2 + 0.1), (y0 + h / 2 + 0.5) / 2, L / 2); g.add(muro);
      const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, Math.hypot(L, h), 6), mate(0xaab0b5, { metalness: 0.4 }));
      pm.rotation.x = Math.PI / 2 - pend; pm.position.set(lado * (ancho / 2 - 0.05), y0 + h / 2 + 0.9, L / 2); g.add(pm);
    }
    if (techado) {
      const techos = [], columnas = [];
      tramoTecho(techos, [0, 0], [0, L], y0, y0 + h, ancho);
      g.add(cajas(laminaVerde, techos));
      for (let t = 0; t <= 1.001; t += 0.25) for (const lado of [-1, 1]) columnas.push([lado * (ancho / 2 + 0.25), y0 + h * t + 1.37, L * t, 0.16, 2.74, 0.16]);
      g.add(cajas(mate(0xc3d6e3), columnas));
    }
    g.position.set(desde[0], 0, desde[1]); g.rotation.y = Math.atan2(dx, dz);
    registrar(g, null);
  }
  function descanso({ p, giro, largo, ancho, alto }) {
    const g = new THREE.Group(), h = alto * EXAGERAR;
    const b = new THREE.Mesh(new THREE.BoxGeometry(largo, h, ancho), celesteMuro); b.position.y = h / 2; g.add(b);
    const t = new THREE.Mesh(new THREE.BoxGeometry(largo, 0.2, ancho), concretoClaro); t.position.y = h + 0.1; g.add(t);
    g.position.set(p[0], 0, p[1]); g.rotation.y = -giro;
    registrar(g, null);
  }

  // losa plana a ras del suelo (descanso de concreto lavado, camino de lastre): sigue el terreno
  function losa({ p, giro, largo, ancho, color }) {
    const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(largo, 0.1, ancho), mate(new THREE.Color(color).getHex(), { roughness: 1 }));
    m.position.y = 0.05; g.add(m); g.position.set(p[0], 0, p[1]); g.rotation.y = -giro; registrar(g, null);
  }
  // muro bajo de piedra bola con lastre al pie (fotos, junto al pasillo de la soda): sigue el terreno tramo a tramo
  function muroPiedra({ puntos }) {
    const g = new THREE.Group(), piedras = [], lastre = [];
    for (let i = 0; i < puntos.length - 1; i++) {
      const [ax, az] = puntos[i], [bx, bz] = puntos[i + 1], L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
      const nx = Math.cos(ang), nz = -Math.sin(ang);
      piedras.push([(ax + bx) / 2, 0.3, (az + bz) / 2, 0.45, 0.6, L + 0.1, ang]);
      lastre.push([(ax + bx) / 2 - nx * 0.7, 0.04, (az + bz) / 2 - nz * 0.7, 1.0, 0.08, L + 0.1, ang]);
    }
    const tex = texturaDibujada(128, 32, (x, w, h) => { x.fillStyle = "#8d877c"; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 70; k++) { x.fillStyle = ["#a59f94", "#77716a", "#b8b1a4", "#6b665f"][k % 4]; x.beginPath(); x.ellipse((k * 37) % w, (k * 13) % h, 5, 3.5, 0, 0, 7); x.fill(); } });
    tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(4, 1);
    g.add(cajas(new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), piedras), cajas(mate(0x9a8f80, { roughness: 1 }), lastre));
    Object.assign(g.userData, { lineal: true, franjas: [] });
    registrar(g, null);
  }
  // mesas redondas de concreto con bancas curvas, como las de todo el campus (fotos)
  function mesas({ puntos }) {
    const g = new THREE.Group(), azulMesa = mate(0x8fb4cf, { roughness: 0.9 });
    puntos.forEach(([x, z], i) => {
      const m = new THREE.Group();
      const placa = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.08, 6), concretoClaro); placa.position.y = 0.04; m.add(placa);
      const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.75, 8), azulMesa); pata.position.y = 0.37; m.add(pata);
      const tablero = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 14), azulMesa); tablero.position.y = 0.78; m.add(tablero);
      for (let k = 0; k < 3; k++) {
        const banca = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.4), azulMesa), a = (k / 3) * Math.PI * 2;
        banca.position.set(Math.cos(a) * 1.25, 0.23, Math.sin(a) * 1.25); banca.rotation.y = -a + Math.PI / 2; m.add(banca);
      }
      m.position.set(x, 0, z); m.rotation.y = azar(i + 3) * 3; g.add(m);
    });
    registrar(g, null);
  }

  // higuerón: varios troncos y raíces, copa muy ancha y abierta hecha de varias masas
  function higueron(x, y0, z, escala) {
    const g = new THREE.Group(), corteza = new THREE.MeshLambertMaterial({ color: 0x7a6a58 });
    const hoja = [0x3f7d34, 0x4f8f3a, 0x35702e].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    const alto = 6 * escala;
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05, r = 0.25 * escala;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * escala, 0.38 * escala, alto, 7), corteza);
      t.position.set(x + Math.cos(a) * r, y0 + alto / 2, z + Math.sin(a) * r); t.rotation.set(Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12); g.add(t);
      const raiz = new THREE.Mesh(new THREE.ConeGeometry(0.5 * escala, 1.2 * escala, 5), corteza);
      raiz.position.set(x + Math.cos(a) * r * 3, y0 + 0.5 * escala, z + Math.sin(a) * r * 3); g.add(raiz);
    }
    const copas = [[0, 0, 0, 1], [0.55, -0.1, 0.2, 0.75], [-0.5, -0.12, 0.25, 0.72], [0.1, -0.15, -0.6, 0.7], [-0.2, -0.05, 0.6, 0.68], [0.6, -0.2, -0.45, 0.6], [-0.6, -0.2, -0.4, 0.62]];
    copas.forEach(([dx, dy, dz, r], k) => {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hoja[k % 3]);
      const R = 5.2 * escala * r;
      c.scale.set(R, R * 0.42, R);
      c.position.set(x + dx * 5.6 * escala, y0 + alto + 1.2 * escala + dy * 4 * escala, z + dz * 5.6 * escala); g.add(c);
    });
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
    return g;
  }
  function arbolGrande({ p, escala }) { escena.add(higueron(p[0], 0, p[1], escala)); }

  // congos (fotos de la Sede): monos aulladores de manto (Alouatta palliata). Pelaje negro con el manto rojizo
  // en el costado, cara negra desnuda con barba bajo la quijada y una cola larga y gruesa. Van un poco exagerados
  // (como los edificios) para que se vean en la maqueta. Hay tres posturas: caminando en cuatro patas sobre la copa,
  // sentado encorvado y una madre con su cría en la espalda. Se mueven poco: cabeza, cola, respiración, y uno
  // camina despacio de un lado a otro (ver animarCongos). No se funden con el resto: se tocan aparte.
  function congoModelo(pose) {
    const ES = 2.2;   // exageración: todo el mono se arma en metros reales y al final se escala
    const pelo = mate(0x17120f, { roughness: 1 }), manto = mate(0x7b4523, { roughness: 1 }), piel = mate(0x2b2522, { roughness: 0.8 });
    const ojo = new THREE.MeshBasicMaterial({ color: 0x1a0d06 });
    const m = new THREE.Group(), cuerpo = new THREE.Group(), cabeza = new THREE.Group(), cola = new THREE.Group();
    m.add(cuerpo); cuerpo.add(cabeza); cuerpo.add(cola);
    const malla = (geo, mat, x, y, z, padre = cuerpo) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); padre.add(o); return o; };
    const hueso = (a, b, r, mat, padre = cuerpo) => {   // extremidad de a a b (cápsula)
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
      const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(d.length() - 2 * r, 0.01), 3, 6), mat);
      o.position.copy(va).add(vb).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); padre.add(o); return o;
    };
    // cabeza: cráneo, hocico, barba (garganta abultada), orejas pequeñas y ojos
    const craneo = malla(new THREE.SphereGeometry(0.13, 10, 8), pelo, 0, 0, 0, cabeza); craneo.scale.set(1, 0.95, 1.05);
    const hocico = malla(new THREE.SphereGeometry(0.08, 8, 6), piel, 0, -0.04, 0.11, cabeza); hocico.scale.set(1, 0.85, 1);
    const barba = malla(new THREE.SphereGeometry(0.1, 8, 6), pelo, 0, -0.11, 0.05, cabeza); barba.scale.set(0.9, 1.1, 0.9);
    for (const lado of [-1, 1]) {
      malla(new THREE.SphereGeometry(0.035, 6, 4), pelo, lado * 0.12, 0.02, -0.01, cabeza);
      malla(new THREE.SphereGeometry(0.016, 6, 4), ojo, lado * 0.045, 0.02, 0.135, cabeza);
    }
    let colaPuntos;
    if (pose === "sentado") {   // encorvado, con los brazos al frente y la cola enroscada en la rama
      const torso = malla(new THREE.SphereGeometry(0.22, 12, 10), pelo, 0, 0.3, 0); torso.scale.set(0.95, 1.25, 0.9); torso.rotation.x = 0.35;
      for (const lado of [-1, 1]) { const f = malla(new THREE.SphereGeometry(0.2, 10, 8), manto, lado * 0.1, 0.28, -0.04); f.scale.set(0.5, 0.95, 0.75); f.rotation.x = 0.35; }
      cabeza.position.set(0, 0.6, 0.12);
      for (const lado of [-1, 1]) {
        hueso([lado * 0.15, 0.42, 0.06], [lado * 0.11, 0.06, 0.2], 0.045, pelo);       // brazo hacia la rama
        hueso([lado * 0.12, 0.14, 0.02], [lado * 0.14, 0.06, 0.22], 0.06, pelo);       // muslo doblado
        hueso([lado * 0.14, 0.06, 0.22], [lado * 0.12, 0.0, 0.05], 0.045, pelo);       // pierna
      }
      colaPuntos = [[0, 0.1, -0.18], [0, -0.1, -0.3], [0, -0.35, -0.28], [0, -0.55, -0.12], [0.06, -0.62, 0.06], [0.1, -0.55, 0.14]];
    } else {   // en cuatro patas, el cuerpo horizontal, como en la foto de la madre
      const torso = malla(new THREE.SphereGeometry(0.2, 12, 10), pelo, 0, 0.42, 0); torso.scale.set(0.9, 0.95, 1.65);
      for (const lado of [-1, 1]) { const f = malla(new THREE.SphereGeometry(0.2, 10, 8), manto, lado * 0.075, 0.41, -0.04); f.scale.set(0.55, 0.8, 1.3); }
      malla(new THREE.SphereGeometry(0.17, 10, 8), pelo, 0, 0.47, 0.22);   // hombros (negros, sobre el manto)
      cabeza.position.set(0, 0.55, 0.42);
      for (const lado of [-1, 1]) {
        hueso([lado * 0.12, 0.42, 0.22], [lado * 0.13, 0.0, 0.3], 0.045, pelo);        // brazos
        hueso([lado * 0.12, 0.38, -0.2], [lado * 0.14, 0.2, -0.08], 0.06, pelo);       // muslos
        hueso([lado * 0.14, 0.2, -0.08], [lado * 0.13, 0.0, -0.24], 0.045, pelo);      // piernas
      }
      colaPuntos = [[0, 0.42, -0.32], [0, 0.4, -0.55], [0, 0.18, -0.72], [0, -0.15, -0.74], [0, -0.42, -0.62], [0.05, -0.55, -0.45]];
      if (pose === "madre") {   // cría aferrada al lomo
        const cria = new THREE.Group(); cuerpo.add(cria);
        const cc = malla(new THREE.SphereGeometry(0.09, 10, 8), pelo, 0, 0.66, -0.04, cria); cc.scale.set(1, 0.8, 1.5);
        malla(new THREE.SphereGeometry(0.065, 8, 6), pelo, 0, 0.7, 0.13, cria);
        malla(new THREE.SphereGeometry(0.035, 6, 4), piel, 0, 0.68, 0.18, cria);
        cria.userData.cria = true;
      }
    }
    // cola: tubo que sale de la base de la espalda y cuelga con la punta enroscada (el giro es en su base)
    const base = new THREE.Vector3(...colaPuntos[0]);
    cola.position.copy(base);
    const curva = new THREE.CatmullRomCurve3(colaPuntos.map(([x, y, z]) => new THREE.Vector3(x, y, z).sub(base)));
    cola.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 18, 0.045, 6), pelo));
    m.scale.setScalar(ES);
    return { m, cuerpo, cabeza, cola };
  }
  function congos({ p, escala }) {
    escena.add(higueron(p[0], 0, p[1], escala));
    const g = new THREE.Group();
    // las mismas copas que higueron(): [dx, dy, dz, radio]; cada mono va sobre la superficie de una de ellas
    const copasH = [[0, 0, 0, 1], [0.55, -0.1, 0.2, 0.75], [-0.5, -0.12, 0.25, 0.72], [0.1, -0.15, -0.6, 0.7], [-0.2, -0.05, 0.6, 0.68]];
    const sobreCopa = (k, fx, fz) => {   // punto de la superficie superior de la copa k, a una fracción del radio
      const [dx, dy, dz, r] = copasH[k], R = 5.2 * escala * r, f = Math.min(Math.hypot(fx, fz), 0.9);
      return new THREE.Vector3(p[0] + dx * 5.6 * escala + fx * R, 6 * escala + 1.2 * escala + dy * 4 * escala + R * 0.42 * Math.sqrt(1 - f * f) - 0.15, p[1] + dz * 5.6 * escala + fz * R);
    };
    const manada = [
      { pose: "caminando", k: 0, fx: -0.15, fz: 0.1, giro: 0.4, camina: true },
      { pose: "madre", k: 1, fx: 0.15, fz: -0.1, giro: 2.2 },
      { pose: "sentado", k: 0, fx: 0.35, fz: -0.25, giro: 1.1 },
      { pose: "sentado", k: 2, fx: -0.2, fz: 0.15, giro: -0.6 },
      { pose: "sentado", k: 3, fx: 0.1, fz: -0.2, giro: 3.0 },
      { pose: "caminando", k: 4, fx: 0.1, fz: 0.2, giro: -2.4 },
    ];
    congosVivos.length = 0;
    manada.forEach((d, i) => {
      const c = congoModelo(d.pose);
      c.base = sobreCopa(d.k, d.fx, d.fz); c.giro = d.giro; c.fase = i * 1.7; c.camina = !!d.camina;
      c.m.position.copy(c.base); c.m.rotation.y = d.giro;
      g.add(c.m); congosVivos.push(c);
    });
    // zona de toque más grande que los monos (invisible), para que sea fácil darles en el teléfono
    const copa = 6 * escala + 1.2 * escala;
    const toque = new THREE.Mesh(new THREE.SphereGeometry(5.2 * escala, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    toque.scale.y = 0.55; toque.position.set(p[0], copa + 1.2 * escala, p[1]); g.add(toque);
    // sin sombra: las sombras se calculan una sola vez y no seguirían a los monos cuando se mueven
    g.traverse((o) => { o.userData.noFundir = true; if (o.isMesh) o.castShadow = false; });
    escena.add(g);
    grupoCongos = g;
    centroCongos.set(p[0], copa, p[1]);
  }

  // explanada (fotos): una gran planicie en lo alto, con taludes de zacate, bancas de concreto celeste en el borde
  // y un higuerón enorme (unas tres veces más grande que los árboles comunes)
  function explanada({ id, contorno, centro, alto, arbol }) {
    const g = new THREE.Group();
    const arriba = new THREE.MeshLambertMaterial({ color: 0xa4ce7e });
    // la planicie y sus taludes son parte del relieve (plataforma en relieve.py); aquí solo bancas y el higuerón
    contorno.forEach(([x, z], i) => {
      if (i % 2) return;
      const dx = centro[0] - x, dz = centro[1] - z, d = Math.hypot(dx, dz) || 1;
      const banca = new THREE.Mesh(new THREE.BoxGeometry(2, 0.45, 0.5), mate(0x8fb4cf, { roughness: 0.9 }));
      banca.position.set(x + (dx / d) * 3, alto + 0.23, z + (dz / d) * 3); banca.rotation.y = Math.atan2(dx, dz); g.add(banca);
    });
    if (arbol) g.add(higueron(arbol[0], alto, arbol[1], 3));
    // el número va a un costado del higuerón (encima tapaba el tronco)
    let ax = centro[0], az = centro[1];
    if (arbol) { const dx = centro[0] - arbol[0], dz = centro[1] - arbol[1], d = Math.hypot(dx, dz) || 1; ax = arbol[0] + (dx / d) * 16; az = arbol[1] + (dz / d) * 16; }
    registrar(g, id, new THREE.Vector3(ax, alto + 4, az), { pared: sinUso(), techo: arriba }, 0);
  }

  // paso de la quebrada (28): la calle pasa sobre un tubo con cabezales de concreto, y encima la cruza una
  // plataforma de concreto rayado de lado a lado, con guía táctil, que une los dos pasillos techados
  function alcantarilla({ id, p, giro, ancho, cabezales = true }) {
    const g = new THREE.Group(), concreto = mate(0xbfbdb5, { roughness: 0.95 });
    const boca = new THREE.MeshBasicMaterial({ color: 0x1d2326 });
    for (const lado of cabezales ? [-1, 1] : []) {   // sin cabezales: paso de concreto sobre la calle, sin quebrada   // local x: de lado a lado de la calle; local z: a lo largo de la calle
      const x = lado * (ancho / 2 + 0.9);
      const cabezal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 4.2), concreto); cabezal.position.set(x, 0.15, 0); g.add(cabezal);
      const ojo = new THREE.Mesh(new THREE.CircleGeometry(0.75, 18), boca); ojo.position.set(x + lado * 0.26, 0.1, 0); ojo.rotation.y = lado * Math.PI / 2; g.add(ojo);
      const baranda = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 4.2), azulColumna); baranda.position.set(x, 1.1, 0); g.add(baranda);
    }
    const plataforma = new THREE.Mesh(new THREE.BoxGeometry(ancho + 0.6, 0.14, 3.2), mate(0xd3d1ca, { roughness: 0.95 }));
    plataforma.position.y = 0.09; g.add(plataforma);
    const rayas = [];
    for (let z = -1.4; z <= 1.41; z += 0.28) if (Math.abs(z) > 0.3) rayas.push([0, 0.165, z, ancho + 0.6, 0.02, 0.07]);
    g.add(cajas(mate(0x9d9b94), rayas));
    const guia = new THREE.Mesh(new THREE.BoxGeometry(ancho + 0.6, 0.03, 0.4), amarilloGuia); guia.position.y = 0.175; g.add(guia);
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro;
    g.userData.talud = 12;
    registrar(g, id, new THREE.Vector3(p[0], 3, p[1]), { pared: concreto, techo: concreto });
  }

  // puente peatonal sobre la ruta 32 (fotos): tablero de concreto sobre columnas cilíndricas, baranda azul y
  // sin techo; en cada extremo, rampas en dos tramos que corren junto a la carretera, fuera de la cerca
  function puentePeatonal({ id, p, giro, semiancho }) {
    const g = new THREE.Group(), azulB = mate(0x1f4fc4, { roughness: 0.5, metalness: 0.3 });
    const H = 5.6, ANCHO = 2.2, LUZ = 2 * (semiancho + 1.8), L = 17;   // el asfalto pintado mide ~1 m más que semiancho
    const losas = [], barandas = [], columnas = [];
    const columna = (x, z, h) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 12), concretoClaro); c.position.set(x, h / 2, z); g.add(c); };
    losas.push([0, H, 0, LUZ + 1.8, 0.35, ANCHO]);
    for (const z of [-ANCHO / 2, ANCHO / 2]) { barandas.push([0, H + 1.1, z, LUZ + 1.8, 0.07, 0.07]); barandas.push([0, H + 0.6, z, LUZ + 1.8, 0.05, 0.05]); }
    for (let x = -LUZ / 2; x <= LUZ / 2 + 0.01; x += LUZ / 6) for (const z of [-ANCHO / 2, ANCHO / 2]) barandas.push([x, H + 0.6, z, 0.05, 1.1, 0.05]);
    for (const lado of [-1, 1]) {
      const x0 = lado * (LUZ / 2), x1 = x0 + lado * 1.85;
      columna(x0, 0, H); columna(x1, -1.2 - L, H / 2);
      // tramo 1: del tablero baja a lo largo de la carretera hasta el descanso; tramo 2: vuelve, más afuera, al suelo
      const pend = Math.atan2(H / 2, L);
      losas.push([x0, H * 0.75, -1.2 - L / 2, 1.7, 0.25, Math.hypot(L, H / 2), 0, -pend]);
      losas.push([(x0 + x1) / 2, H / 2, -1.6 - L, 3.6, 0.25, 1.8]);
      losas.push([x1, H * 0.25, -1.2 - L / 2, 1.7, 0.25, Math.hypot(L, H / 2), 0, pend]);
      for (const [x, yc, s] of [[x0, H * 0.75, -1], [x1, H * 0.25, 1]]) {
        const borde = x + lado * 0.85;
        barandas.push([borde, yc + 1.0, -1.2 - L / 2, 0.07, 0.07, Math.hypot(L, H / 2), 0, s * pend]);
        columna(x, -1.2 - L / 2, yc);
      }
    }
    g.add(cajas(concretoClaro, losas), cajas(azulB, barandas));
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro;   // x local: de lado a lado de la carretera
    registrar(g, id, new THREE.Vector3(p[0], H + 4, p[1]), { pared: concretoClaro, techo: azulB }, H);
  }

  // entrada al Jardín Etnobotánico (fotos): el sendero (en el suelo) sube por el zacate y se mete al bosque
  function jardin({ id, desde, hasta }) {
    const g = new THREE.Group();
    const dx = hasta[0] - desde[0], dz = hasta[1] - desde[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const tonos = [0x3f7d34, 0x5f9e43, 0x2f6b2c, 0x4f8f3a, 0x355f2a];
    for (let i = 0; i < 34; i++) {   // vegetación densa a los lados del final del sendero
      const lado = i % 2 ? 1 : -1, a = azar(i), d = 2 + azar(i + 40) * 14, r = 0.8 + azar(i + 80) * 1.8;
      const px = hasta[0] + ux * d * (a - 0.2) - uz * lado * (2.5 + a * 6), pz = hasta[1] + uz * d * (a - 0.2) + ux * lado * (2.5 + a * 6);
      const mata = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshLambertMaterial({ color: tonos[i % tonos.length], flatShading: true }));
      mata.position.set(px, r * 0.8, pz); g.add(mata);
    }
    registrar(g, id, new THREE.Vector3(hasta[0], 4, hasta[1]), { pared: sinUso(), techo: sinUso() }, 0);
  }

  // bancas de concreto celeste (plaza del Auditorio)
  function bancas({ puntos, giro }) {
    const g = new THREE.Group(), mat = mate(0x9cc4df, { roughness: 0.9 });
    for (const [x, z] of puntos) {
      const b = new THREE.Group();
      const asiento = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.55), mat); asiento.position.y = 0.45; b.add(asiento);
      for (const dx of [-1.05, 1.05]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.5), mat); pata.position.set(dx, 0.22, 0); b.add(pata); }
      b.position.set(x, 0, z); b.rotation.y = -giro + Math.PI / 2; g.add(b);
    }
    registrar(g, null);
  }

  // pluma de acceso vehicular, roja y blanca
  function pluma({ p, giro, largo }) {
    const g = new THREE.Group(), rojo = mate(0xd23a2c, { roughness: 0.5 });
    const caja_ = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), rojo); caja_.position.y = 0.55; g.add(caja_);
    for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, largo / 6), k % 2 ? blanco : rojo); b.position.set(0, 0.95, 0.2 + (largo / 6) * (k + 0.5)); g.add(b); }
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro;
    registrar(g, null);
  }

  // comedor abierto junto a la soda: losa, columnas azules, techo a dos aguas y mesas
  // comedor de la soda (fotos, nov. 2026). Nave abierta con techo a dos aguas de lámina gris sobre columnas y cerchas
  // azules y, del lado de la soda, una franja techada con un alero blanco que sale de la pared de la soda (x < -largo/2,
  // hasta «pared»). En la franja, mesas azules con sillas verdes pegadas a la pared; en la nave, un murete de concreto
  // con remate azul, más mesas azules con sillas verdes y unas plegables blancas con sillas negras. Entre las dos
  // cubiertas, los bajantes blancos en Y sobre una rejilla; en la punta norte, un toldo en arco de policarbonato con
  // la fila de basureros, una caja roja de refrescos y un abanico de pie
  function comedor({ p, giro, largo, ancho, alto, pared = largo / 2 }) {
    const g = new THREE.Group(), techos = [], columnas = [];
    const X0 = -pared + 0.15, X1 = largo / 2;
    const caja_ = (w, h, d, m, x, y, z, ry = 0) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); c.position.set(x, y, z); c.rotation.y = ry; g.add(c); return c; };
    caja_(X1 - X0 + 0.4, 0.25, ancho + 1, concretoClaro, (X0 + X1) / 2, 0.12, 0);              // losa hasta la pared de la soda
    for (let i = 0; i <= 4; i++) for (const x of [-largo / 2 + 0.2, largo / 2 - 0.2]) columnas.push([x, alto / 2, -ancho / 2 + (ancho * i) / 4, 0.2, alto, 0.2]);
    tramoTecho(techos, [0, -ancho / 2 - 0.6], [0, ancho / 2 + 0.6], alto - 2.75, alto - 2.75, largo + 0.4);
    g.add(cajas(mate(0xa9aeb2, { metalness: 0.35 }), techos), cajas(azulColumna, columnas));
    // franja techada junto a la soda: lámina gris que baja de la pared, con cielo blanco y canoa blanca
    const ancF = -largo / 2 - X0 + 0.3, xF = (X0 - largo / 2) / 2, caida = Math.atan2(0.45, ancF);
    const lam = caja_(ancF + 0.4, 0.08, ancho + 0.8, mate(0xb6babd, { metalness: 0.3 }), xF, alto + 0.35, 0); lam.rotation.z = caida;
    const cielo = caja_(ancF + 0.3, 0.04, ancho + 0.7, mate(0xf1f1ee), xF, alto + 0.24, 0); cielo.rotation.z = caida;
    caja_(0.3, 0.3, ancho + 0.8, mate(0xf4f4f1), -largo / 2 + 0.05, alto + 0.05, 0);              // canoa
    // bajantes en Y, en la columna del medio, sobre una rejilla verde
    const blancoT = mate(0xf4f4f1, { roughness: 0.5 });
    const tubo = (x0, y0, z0, x1, y1, z1) => {
      const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, a.distanceTo(b), 8), blancoT);
      t.position.copy(a).add(b).multiplyScalar(0.5); t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(t);
    };
    const xB = -largo / 2 - 0.35;
    tubo(xB, alto, -0.9, xB, 1.2, 0); tubo(xB, alto, 0.9, xB, 1.2, 0); tubo(xB, 1.2, 0, xB, 0.3, 0.1);
    caja_(0.9, 0.04, 0.9, mate(0x3f7d4a), xB, 0.27, 0.1);
    // murete de la nave, del lado de la franja, con remate azul (con paso en los dos extremos)
    const gris = mate(0xa4a29b, { roughness: 1 }), azulR = mate(0x5f88a8, { roughness: 0.6 });
    caja_(0.25, 0.95, ancho - 6, gris, -largo / 2 + 0.6, 0.72, 0.5); caja_(0.35, 0.08, ancho - 6, azulR, -largo / 2 + 0.6, 1.24, 0.5);
    caja_(1.8, 0.95, 0.25, gris, -largo / 2 + 1.5, 0.72, -ancho / 2 + 3.5, 0.5);
    // mesa azul con sillas verdes pegadas al marco gris (cuatro puestos)
    const azulM = mate(0x2f6fd6, { roughness: 0.2, metalness: 0.1 }), verde = mate(0x2fbf55, { roughness: 0.5 }), grisM = mate(0x6c7176, { metalness: 0.5 });
    const mesaAzul = (x, z, ry = 0) => {
      const m = new THREE.Group();
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 1.2), azulM); t.position.y = 0.76; m.add(t);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.08), grisM); base.position.y = 0.3; m.add(base);
      for (const sx of [-0.62, 0.62]) for (const sz of [-0.32, 0.32]) {
        const as = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), verde); as.position.set(sx, 0.46, sz); m.add(as);
        const re = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.4), verde); re.position.set(sx + Math.sign(sx) * 0.2, 0.72, sz); m.add(re);
        const pa = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), grisM); pa.position.set(sx, 0.23, sz); m.add(pa);
      }
      const pie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), grisM); pie.position.y = 0.39; m.add(pie);
      m.position.set(x, 0.25, z); m.rotation.y = ry; g.add(m);
    };
    for (let k = 0; k < 4; k++) mesaAzul(xF - 0.1, -ancho / 2 + 2.5 + k * 3.4, Math.PI / 2);     // en la franja, junto a la pared
    for (const x of [-1.6, 1.8]) for (let k = 0; k < 3; k++) mesaAzul(x, -ancho / 2 + 6 + k * 3.4);
    // plegables blancas con sillas negras, en la punta norte
    const blancaP = mate(0xeeeeea), negra = mate(0x26292c, { roughness: 0.5 });
    for (const [x, z] of [[-1.2, -ancho / 2 + 2.2], [2.2, -ancho / 2 + 2.6]]) {
      caja_(1.8, 0.05, 0.75, blancaP, x, 1.0, z);
      for (const dx of [-0.75, 0.75]) for (const dz of [-0.33, 0.33]) caja_(0.03, 0.74, 0.03, grisM, x + dx, 0.62, z + dz);
      for (const dx of [-0.5, 0.5]) for (const s of [-1, 1]) {
        caja_(0.42, 0.04, 0.42, negra, x + dx, 0.7, z + s * 0.65); caja_(0.42, 0.45, 0.04, negra, x + dx, 0.95, z + s * 0.86);
      }
    }
    // toldo en arco de policarbonato con costillas azules, en la punta norte de la franja
    const zA = -ancho / 2 - 0.2, largoA = 3.2, R = Math.max(1.6, ancF / 2 + 0.3);
    const geoA = new THREE.CylinderGeometry(R, R, largoA, 18, 1, true, Math.PI / 2, Math.PI); geoA.rotateX(Math.PI / 2);   // medio tubo con la cara curva arriba, a lo largo de z
    const arco = new THREE.Mesh(geoA, new THREE.MeshStandardMaterial({ color: 0xe8ece4, roughness: 0.4, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
    arco.position.set(xF, alto - 0.4, zA - largoA / 2); arco.scale.y = 0.5; g.add(arco);
    for (let k = 0; k <= 3; k++) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(R, 0.04, 5, 18, Math.PI), azulColumna);
      c.position.set(xF, alto - 0.4, zA - (largoA * k) / 3); c.scale.set(1, 0.5, 1); g.add(c);
    }
    for (const x of [xF - R, xF + R]) caja_(0.12, alto - 0.4, 0.12, azulColumna, x, (alto - 0.4) / 2, zA - largoA);
    caja_(2 * R + 0.4, 0.25, largoA, concretoClaro, xF, 0.12, zA - largoA / 2);   // piso bajo el toldo
    [0x2f62c4, 0x2a2d30, 0x2a2d30].forEach((col, k) => caja_(0.5, 0.85, 0.5, mate(col, { roughness: 0.5 }), xF - R + 0.4, 0.68, zA - 0.6 - k * 0.6));
    caja_(0.06, 1.0, 1.9, grisM, xF - R + 0.12, 0.75, zA - 1.2);
    caja_(0.55, 0.55, 0.4, mate(0xc8202a, { roughness: 0.6 }), xF - R + 0.45, 0.53, zA - 2.4);
    const abanico = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), mate(0x2c2f33)); abanico.rotation.x = Math.PI / 2; abanico.position.set(-largo / 2 + 1.0, 1.7, -0.8); g.add(abanico);
    caja_(0.04, 1.5, 0.04, mate(0x2c2f33), -largo / 2 + 1.0, 0.95, -0.8);
    g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
    g.position.set(p[0], 0, p[1]); g.rotation.y = -giro;
    registrar(g, null);
  }
  // mesas de concreto entre el pasillo de la soda y el edificio 2 (foto): mesa redonda y bancas curvas a los lados,
  // del mismo concreto gris azulado; caben en la franja de zacate (x a lo largo de la franja)
  function pollitos({ puntos, giro = 0 }) {
    const g = new THREE.Group(), conc = mate(0x9aa7ad, { roughness: 0.95 });
    for (const [x, z] of puntos) {
      const m = new THREE.Group();
      const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.72, 10), conc); pata.position.y = 0.36; m.add(pata);
      const tab = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.09, 18), conc); tab.position.y = 0.76; m.add(tab);
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.16, 4, 10, 1.4), conc); b.rotation.x = Math.PI / 2; b.rotation.z = (s > 0 ? 0 : Math.PI) - 0.7;
        b.position.y = 0.44; b.scale.z = 0.3; m.add(b);
        for (const a of [-0.45, 0.45]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.25), conc); p.position.set(s * Math.cos(a) * 1.05, 0.21, Math.sin(a) * 1.05); m.add(p); }
      }
      m.position.set(x, 0, z); m.rotation.y = giro; m.traverse((o) => { o.castShadow = !liviano; }); g.add(m);
    }
    g.userData.talud = 1;   // sin lomo alrededor: el grupo es largo y con talud ancho subía el bajo de la soda
    registrar(g, null);
  }
  // entrada a Registro, Becas y demás (foto, nov. 2026): paso abierto bajo el edificio 2 con cielo blanco y la franja
  // verde encima; adentro, la sala de espera (sillas negras en fila, pizarra de avisos) y al fondo el zacate. Del
  // pasillo 10 llega una acera con guía amarilla bajo un techito plano de lámina sobre postes azules, con baranda a la
  // izquierda; a la derecha, un muñeco de nieve y una lengua de suegra. x a lo largo de la pared; hacia afuera, -z
  function entradaRegistro({ p, giro, largo }) {
    const g = new THREE.Group(), azulP = mate(0x4f86b8, { roughness: 0.5 }), grisB = mate(0x6c7176, { metalness: 0.5 });
    const caja_ = (w, h, d, m, x, y, o) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); c.position.set(x, y, -o); g.add(c); return c; };
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 340;
    const x = cv.getContext("2d"), W = 512, H = 340, f = [196, 120, 316, 236];   // abertura del fondo
    x.fillStyle = "#f3f3f0"; x.fillRect(0, 0, W, H * 0.5);                                   // cielo
    x.fillStyle = "#b9b8b2"; x.fillRect(0, H * 0.5, W, H * 0.5);                             // piso
    x.fillStyle = "#e9e7e0"; x.beginPath(); x.moveTo(0, 0); x.lineTo(f[0], f[1]); x.lineTo(f[0], f[3]); x.lineTo(0, H); x.fill();   // pared izquierda
    x.fillStyle = "#9d9b95"; x.beginPath(); x.moveTo(W, 0); x.lineTo(f[2], f[1]); x.lineTo(f[2], f[3]); x.lineTo(W, H); x.fill();   // concreto derecha
    x.fillStyle = "#f7f7f4"; x.beginPath(); x.moveTo(0, 0); x.lineTo(W, 0); x.lineTo(f[2], f[1]); x.lineTo(f[0], f[1]); x.fill();
    x.fillStyle = "#8a8983"; x.beginPath(); x.moveTo(0, H); x.lineTo(W, H); x.lineTo(f[2], f[3]); x.lineTo(f[0], f[3]); x.fill();
    const fondo = x.createLinearGradient(0, f[1], 0, f[3]); fondo.addColorStop(0, "#9fd27a"); fondo.addColorStop(1, "#4f8f3a");
    x.fillStyle = fondo; x.fillRect(f[0], f[1], f[2] - f[0], f[3] - f[1]);
    x.fillStyle = "#2f6b2f"; for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(f[0] + 20 + k * 24, f[3] - 30 - (k % 2) * 14, 16, 0, 7); x.fill(); }
    x.fillStyle = "#1e2124"; for (let k = 0; k < 6; k++) x.fillRect(f[0] + 8 + k * 19, f[3] - 22, 15, 20);   // sillas en fila
    for (let k = 0; k < 4; k++) x.fillRect(250 + k * 16, f[3] - 6, 13, 18);
    x.fillStyle = "#fff"; x.fillRect(40, 140, 100, 70); x.strokeStyle = "#5a4a3a"; x.lineWidth = 4; x.strokeRect(40, 140, 100, 70);   // pizarra
    x.fillStyle = "#3a6fb5"; x.fillRect(50, 150, 30, 20); x.fillStyle = "#6c3a8f"; x.fillRect(100, 160, 30, 30);
    x.fillStyle = "#1e2124"; for (let k = 0; k < 3; k++) x.fillRect(10 + k * 34, 230, 26, 40);                   // sillas de oficina
    x.fillStyle = "#cfd8dc"; for (let k = 0; k < 4; k++) x.fillRect(80 + k * 100, 22 + k * 6, 16, 6);           // luces del cielo
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const paso = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.9), new THREE.MeshBasicMaterial({ map: tex }));
    paso.position.set(0, 1.45, -0.07); paso.rotation.y = Math.PI; g.add(paso);
    // acera con guía desde el corredor del edificio hasta el pasillo
    const o0 = 2.5, o1 = largo, oc = (o0 + o1) / 2, L = o1 - o0;
    caja_(3.0, 0.12, L, concretoClaro, 0, 0.06, oc); caja_(0.36, 0.02, L + 2.6, amarilloGuia, 0, 0.13, oc - 1.3);
    // techito plano de lámina sobre postes azules, con vigas azules
    caja_(3.6, 0.06, L + 0.6, mate(0xc4c8cb, { metalness: 0.35 }), 0, 3.05, oc);
    for (const xx of [-1.65, 1.65]) { caja_(0.1, 0.16, L + 0.6, azulP, xx, 2.95, oc); for (const o of [o0 + 0.3, o1 - 0.2]) caja_(0.16, 2.95, 0.16, azulP, xx, 1.47, o); }
    for (const o of [o0 + 0.3, oc, o1 - 0.2]) caja_(3.4, 0.12, 0.1, azulP, 0, 2.88, o);
    // baranda gris a la izquierda (vista al entrar)
    caja_(0.05, 0.05, L, grisB, 1.45, 0.95, oc); caja_(0.05, 0.05, L, grisB, 1.45, 0.6, oc);
    for (let k = 0; k <= 3; k++) caja_(0.05, 0.95, 0.05, grisB, 1.45, 0.47, o0 + (L * k) / 3);
    // muñeco de nieve recortado y lengua de suegra, a la derecha
    const nieve = document.createElement("canvas"); nieve.width = 64; nieve.height = 128;
    const n = nieve.getContext("2d");
    n.fillStyle = "#fff"; n.beginPath(); n.arc(32, 92, 26, 0, 7); n.arc(32, 46, 18, 0, 7); n.fill();
    n.fillStyle = "#c62828"; n.fillRect(16, 58, 34, 7); n.fillStyle = "#111"; n.fillRect(20, 6, 24, 22); n.fillRect(14, 26, 36, 4);
    const tn = new THREE.CanvasTexture(nieve); tn.colorSpace = THREE.SRGBColorSpace;
    const mn = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.1), new THREE.MeshBasicMaterial({ map: tn, transparent: true, side: THREE.DoubleSide }));
    mn.position.set(-2.0, 0.7, -(o0 + 0.6)); mn.rotation.y = Math.PI; g.add(mn);
    caja_(0.5, 0.12, 0.5, mate(0x4a3a30), -2.0, 0.06, o0 + 0.6);
    caja_(0.3, 0.35, 0.3, mate(0xf2f2ee), -2.5, 0.18, o0 + 0.4);
    for (let k = 0; k < 6; k++) { const h = caja_(0.07, 0.8, 0.02, mate(0x4f7a3a), -2.5, 0.75, o0 + 0.4); h.rotation.set((k % 3 - 1) * 0.25, k, (k % 2 ? 1 : -1) * 0.2); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro; registrar(g, null);
  }
  // busto (foto): cabeza y hombros oscuros sobre un pedestal de concreto con la placa negra al frente
  function busto({ p, giro = 0 }) {
    const g = new THREE.Group(), conc = mate(0xb3b3ad, { roughness: 1 }), bronce = mate(0x3c3a37, { roughness: 0.45, metalness: 0.5 });
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.25, 0.6), conc); ped.position.y = 0.62; g.add(ped);
    const tapa = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.7), conc); tapa.position.y = 1.29; g.add(tapa);
    const placa = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.03), mate(0x1f2224, { roughness: 0.3 })); placa.position.set(0, 0.75, 0.31); g.add(placa);
    for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4 - (k % 3) * 0.06, 0.02, 0.01), mate(0xcfd2d4)); l.position.set(0, 1.02 - k * 0.07, 0.33); g.add(l); }
    const hombros = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronce); hombros.scale.set(1.15, 0.8, 0.6); hombros.position.y = 1.33; g.add(hombros);
    const cuello = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 8), bronce); cuello.position.y = 1.62; g.add(cuello);
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), bronce); cabeza.scale.set(0.9, 1.15, 1); cabeza.position.y = 1.8; g.add(cabeza);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro; registrar(g, null);
  }
  // tanque de agua azul sobre una torre de tubo verde
  function tanque({ p }) {
    const g = new THREE.Group(), verde = mate(0x4f7d3a), patas = [];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) patas.push([x * 1.1, 2.2, z * 1.1, 0.12, 4.4, 0.12]);
    patas.push([0, 4.45, 0, 2.6, 0.1, 2.6]);
    g.add(cajas(verde, patas));
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.7, 18), mate(0x1f6fd0, { roughness: 0.5 })); t.position.y = 5.35; g.add(t);
    g.position.set(p[0], 0, p[1]);
    registrar(g, null);
  }

  // acera sin techo (anotaciones): losa de concreto con guía táctil amarilla, sin barandas
  function acera({ puntos: crudos, ancho }) {
    // tramos de 3 m como mucho, para que la acera siga el terreno (cada losa se inclina entre sus dos puntas)
    const puntos = [crudos[0]];
    for (let i = 1; i < crudos.length; i++) {
      const [ax, az] = crudos[i - 1], [bx, bz] = crudos[i], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
      for (let k = 1; k <= n; k++) puntos.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
    }
    const losas = [], guias = [];
    for (let i = 0; i < puntos.length - 1; i++) {
      const [ax, az] = puntos[i], [bx, bz] = puntos[i + 1];
      const L = Math.hypot(bx - ax, bz - az) + ancho * 0.5, ang = Math.atan2(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2;
      losas.push([cx, 0.06, cz, ancho, 0.12, L, ang]);
      guias.push([cx, 0.125, cz, 0.36, 0.02, L, ang]);
    }
    const g = new THREE.Group(); g.add(cajas(concretoClaro, losas), cajas(amarilloGuia, guias));
    Object.assign(g.userData, { lineal: true, franjas: [puntos], ancho });
    registrar(g, null);
  }
  // paso de cebra (anotaciones): franjas blancas a lo largo de la calle, una tras otra de lado a lado
  function cebra({ franjas, giro, ancho = 3 }) {
    const g = new THREE.Group(); g.add(cajas(blanco, franjas.map(([x, z]) => [x, 0.1, z, ancho, 0.04, 0.5, giro]))); registrar(g, null);
  }
  // parqueo techado (fotos): techo de lámina de una sola agua con canoa blanca y borde verde, sobre una viga de
  // celosía de acero gris oscuro que se apoya en dos columnas en V; debajo, los espacios con su tope de concreto
  function carport({ p, giro, largo, fondo, espacios = 3 }) {
    const g = new THREE.Group();
    const acero = mate(0x3d4247, { roughness: 0.5, metalness: 0.5 }), lamina = mate(0xc9ccd0, { roughness: 0.6, metalness: 0.3 });
    const canoa = mate(0xe6e6e1, { roughness: 0.7 }), verdeBorde = mate(0x2f6b4f, { roughness: 0.6 });
    const H = 3.6, caida = 0.5;   // altura de la viga y caída del techo hacia atrás
    const pieza = (w, h, d, mat, x, y, z, rz = 0, rx = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); g.add(m); return m;
    };
    // techo inclinado (sube hacia la calle, +z local) con canoa al frente y borde verde arriba
    const pend = Math.atan2(caida, fondo);
    pieza(largo + 1.6, 0.1, fondo + 1.2, lamina, 0, H + 0.45, 0, 0, -pend);
    pieza(largo + 1.6, 0.55, 0.14, canoa, 0, H + 0.45 + caida / 2 + 0.1, (fondo + 1.2) / 2);
    pieza(largo + 1.6, 0.1, 0.18, verdeBorde, 0, H + 0.45 + caida / 2 + 0.42, (fondo + 1.2) / 2);
    for (let k = -2; k <= 2; k++) pieza(largo + 1.4, 0.12, 0.1, acero, 0, H + 0.3 + (k * caida) / 5, (k * (fondo + 1)) / 5);   // largueros
    // viga de celosía a lo largo, a media profundidad
    pieza(largo + 1.2, 0.14, 0.14, acero, 0, H + 0.25, 0);
    pieza(largo + 1.2, 0.14, 0.14, acero, 0, H - 0.55, 0);
    const n = 10, paso = (largo + 1.2) / n;
    for (let i = 0; i < n; i++) pieza(0.08, Math.hypot(paso, 0.8), 0.08, acero, -(largo + 1.2) / 2 + paso * (i + 0.5), H - 0.15, 0, (i % 2 ? 1 : -1) * Math.atan2(paso, 0.8));
    // dos columnas en V, una en cada extremo
    for (const lado of [-1, 1]) {
      const xb = lado * (largo / 2 - 1.2);
      pieza(0.5, 0.35, 0.5, concretoClaro, xb, 0.17, 0);
      for (const abre of [-1, 1]) {
        const dx = abre * 1.1, L = Math.hypot(dx, H - 0.55);
        pieza(0.18, L, 0.18, acero, xb + dx / 2, (H - 0.55) / 2 + 0.3, 0, -Math.atan2(dx, H - 0.55));
      }
    }
    // topes de concreto al fondo de cada espacio
    for (let i = 0; i < espacios; i++) pieza(1.6, 0.15, 0.25, concretoClaro, (-espacios / 2 + i + 0.5) * (largo / espacios), 0.08, -fondo / 2 + 0.8);
    g.position.set(p[0], 0, p[1]); g.rotation.y = -giro;
    registrar(g, null);
  }
  // ruedas de tren (fotos): monumento de juegos de ruedas oxidados, apilados en cuatro hileras con el eje hacia el
  // frente, una rueda grande de rayos parada adelante y un carretón pequeño en el zacate, frente al parqueo
  function ruedasTren({ p, giro }) {
    const g = new THREE.Group();
    const oxido = mate(0x5b4434, { roughness: 0.95, metalness: 0.15 }), oscuro = mate(0x3b3029, { roughness: 0.95, metalness: 0.2 });
    const musgo = mate(0x58573d, { roughness: 1 });
    const rueda = new THREE.CylinderGeometry(0.45, 0.45, 0.14, 18), pestana = new THREE.CylinderGeometry(0.5, 0.5, 0.04, 18);
    const eje = new THREE.CylinderGeometry(0.08, 0.08, 1.7, 8), cubo = new THREE.CylinderGeometry(0.16, 0.16, 0.2, 10);
    // juego de ruedas: dos ruedas unidas por el eje, con el eje a lo largo de z local (se ve la cara de la rueda)
    const juego = (x, y, z, tono) => {
      for (const lado of [-1, 1]) {
        const r = new THREE.Mesh(rueda, tono); r.rotation.x = Math.PI / 2; r.position.set(x, y, z + lado * 0.75); g.add(r);
        const f = new THREE.Mesh(pestana, oscuro); f.rotation.x = Math.PI / 2; f.position.set(x, y, z + lado * 0.66); g.add(f);
        const c = new THREE.Mesh(cubo, oscuro); c.rotation.x = Math.PI / 2; c.position.set(x, y, z + lado * 0.88); g.add(c);
      }
      const e = new THREE.Mesh(eje, oscuro); e.rotation.x = Math.PI / 2; e.position.set(x, y, z); g.add(e);
    };
    // hileras de abajo hacia arriba (más angostas arriba), algunas con musgo
    const hileras = [[8, 0.45], [8, 1.28], [7, 2.11], [6, 2.94]];
    hileras.forEach(([n, y], h) => {
      for (let i = 0; i < n; i++) juego((i - (n - 1) / 2) * 0.95, y, 0, (i + h) % 4 === 0 ? musgo : oxido);
    });
    // carretones de base: largueros bajo la hilera de abajo
    for (const x of [-2.2, 2.2]) for (const z of [-0.75, 0.75]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.16), oscuro); l.position.set(x, 0.32, z + Math.sign(z) * 0.32); g.add(l);
    }
    // rueda grande de rayos, parada adelante, al centro
    const R = 1.2, zR = 1.25;
    const aro = new THREE.Mesh(new THREE.TorusGeometry(R, 0.1, 8, 32), oxido); aro.position.set(0, R + 0.02, zR); g.add(aro);
    const llanta = new THREE.Mesh(new THREE.TorusGeometry(R - 0.12, 0.05, 6, 32), oscuro); llanta.position.set(0, R + 0.02, zR); g.add(llanta);
    const centro = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 14), oscuro); centro.rotation.x = Math.PI / 2; centro.position.set(0, R + 0.02, zR); g.add(centro);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, rayo = new THREE.Mesh(new THREE.BoxGeometry(0.08, R - 0.2, 0.06), oxido);
      rayo.position.set(Math.sin(a) * (R / 2), R + 0.02 + Math.cos(a) * (R / 2), zR); rayo.rotation.z = -a; g.add(rayo);
    }
    // carretón pequeño adelante: dos juegos de ruedas con su bastidor
    const zC = 3.0, xC = -0.6;
    for (const dx of [-0.75, 0.75]) juego(xC + dx, 0.45, zC, musgo);
    const bastidor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 0.9), oscuro); bastidor.position.set(xC, 0.6, zC); g.add(bastidor);
    const caja_ = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), oxido); caja_.position.set(xC, 0.95, zC); g.add(caja_);
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro;
    registrar(g, null);
  }
  // pasarela entre dos edificios (anotaciones): en el primer piso un pasillo de concreto y en el segundo una losa
  // sobre columnas, techada; las dos con baranda de tubos a cada lado
  // Va escalada en alto como los edificios (EXAGERAR), así el piso de arriba empata con el pasillo del edificio y
  // el techo queda a la altura del techo de los dos edificios
  function pasarela({ a, b, ancho = 3, piso = 4.2, alto = 8.4, nivel_de: nivelDe, abrir_oeste: abrirOeste = null }) {
    const g = new THREE.Group();
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const gris = mate(0xa9a7a1, { roughness: 0.95 }), losaP = mate(0xd9d8d3, { roughness: 0.9 }), techoP = mate(0xd6dadd, { roughness: 0.7 });
    const pieza = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
    for (const [y, grueso, mat] of [[0.3, 0.3, gris], [piso, 0.35, losaP]]) {
      pieza(L, grueso, ancho, mat, 0, y - grueso / 2, 0);
      for (const lado of [-1, 1]) {
        // (anotaciones) del lado oeste se abre donde llegan las rampas (abrir_oeste: [desde, hasta] en m desde a)
        const tramosB = lado > 0 && abrirOeste ? [[0, abrirOeste[0]], [abrirOeste[1], L]] : [[0, L]];
        for (const [d0, d1] of tramosB) {
          if (d1 - d0 < 0.4) continue;
          const br = baranda(d1 - d0 - 0.2); br.position.set(-L / 2 + (d0 + d1) / 2, y, lado * (ancho / 2 - 0.08)); g.add(br);
        }
      }
    }
    const H = alto;
    for (const x of [-L / 2 + 0.3, 0, L / 2 - 0.3]) for (const lado of [-1, 1]) pieza(0.22, H, 0.22, tuboBaranda, x, H / 2, lado * (ancho / 2 + 0.15));
    for (const lado of [-1, 1]) pieza(L, 0.25, 0.18, tuboBaranda, 0, H - 0.1, lado * (ancho / 2 + 0.15));   // vigas
    pieza(L + 0.4, 0.5, ancho + 1.0, techoP, 0, H + 0.25, 0);                                                 // techo
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
    g.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2); g.rotation.y = ang; g.scale.y = EXAGERAR;
    registrar(g, null);
    if (nivelDe) g.userData.nivelDe = nivelDe;
  }
  // Punto Verde UCR (foto, pasillo de Docencia): marco de tubo gris con patas en T y un riel arriba del que cuelgan
  // los tres basureros (azul de envases, y negros de papel y cartón y de ordinarios); encima, en dos postes, el
  // rótulo con la franja verde «Punto Verde UCR». Va en el piso del pasillo: x a lo largo de la fila, frente a +z
  function puntoVerde({ p, giro = 0 }) {
    const g = new THREE.Group();
    const gris = mate(0x5f6469, { metalness: 0.4, roughness: 0.5 });
    const caja = (w, h, d, m, x, y, z) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); c.position.set(x, y, z); g.add(c); return c; };
    const Y = 0.13;   // sobre la losa del pasillo
    [[0x1f62c4, 0x2a6fd0, -0.6], [0x2e3134, 0x3a3e42, 0], [0x24272a, 0x34383c, 0.6]].forEach(([cuerpo, tapa, x]) => {
      caja(0.5, 0.78, 0.46, mate(cuerpo, { roughness: 0.55 }), x, Y + 0.24 + 0.39, 0.02);
      caja(0.54, 0.07, 0.52, mate(tapa, { roughness: 0.5 }), x, Y + 1.06, 0.02);
    });
    caja(1.9, 0.05, 0.56, gris, 0, Y + 1.0, 0.02);                       // riel de donde cuelgan
    for (const x of [-0.95, 0.95]) {
      caja(0.05, 1.0, 0.05, gris, x, Y + 0.5, 0.02);                     // patas
      caja(0.06, 0.05, 0.7, gris, x, Y + 0.03, 0.02);                    // pie en T
      caja(0.05, 0.85, 0.05, gris, x, Y + 1.45, -0.18);                  // postes del rótulo
    }
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
    const x = cv.getContext("2d");
    x.fillStyle = "#2f6f7a"; x.fillRect(0, 0, 512, 128);
    x.fillStyle = "#7cc142"; x.fillRect(0, 0, 512, 22);
    x.fillStyle = "#fff"; x.font = "700 15px Arial, sans-serif"; x.textAlign = "center"; x.fillText("PUNTO VERDE UCR", 256, 16);
    [["#2a8fd6", "ENVASES"], ["#7b8086", "PAPEL Y CARTÓN"], ["#2a2d30", "ORDINARIOS"]].forEach(([c, t], k) => {
      x.fillStyle = c; x.fillRect(4 + k * 168, 26, 164, 98);
      x.fillStyle = "#fff"; x.font = "700 19px Arial, sans-serif"; x.fillText(t, 86 + k * 168, 66);
    });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const rotulo = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.04), [gris, gris, gris, gris, new THREE.MeshBasicMaterial({ map: tex }), gris]);
    rotulo.position.set(0, Y + 1.65, -0.16); g.add(rotulo);
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro; g.userData.sobrePasillo = true; registrar(g, null);
  }
  // parqueo de motos (foto, junto al pasillo 7 frente a Docencia): motos de frente al pasillo sobre el asfalto, rayas
  // amarillas, el rótulo azul en su poste, un hito naranja y la marca azul del espacio accesible. x a lo largo del
  // pasillo, el pasillo queda hacia -z
  function motos({ p, giro = 0, largo = 8, n = 4 }) {
    const g = new THREE.Group();
    const amarillo = mate(0xe0b52a, { roughness: 0.8 }), negro = mate(0x1c1e20, { roughness: 0.5 });
    const caja = (w, h, d, m, x, y, z) => { const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); c.position.set(x, y, z); g.add(c); return c; };
    for (let k = 0; k <= n; k++) caja(0.1, 0.02, 2.4, amarillo, -largo / 2 + (largo * k) / n, 0.03, 0);   // rayas
    caja(largo, 0.02, 0.1, amarillo, 0, 0.03, 1.2);
    caja(1.4, 0.02, 2.2, mate(0x3f8fd6, { roughness: 0.9 }), -largo / 2 - 0.9, 0.025, 0);              // espacio accesible
    const tonos = [[0x9b1c24, 0x1c1e20], [0x1c1e20, 0x2a2d30], [0x1c1e20, 0xd8d8d6], [0x22252a, 0x1f4fa8]];
    for (let k = 0; k < n; k++) {
      const [c1, c2] = tonos[k % tonos.length], m = new THREE.Group(), x0 = -largo / 2 + (largo * (k + 0.5)) / n + (k % 2 ? 0.2 : -0.2);
      for (const z of [-0.68, 0.68]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14), negro); r.rotation.z = Math.PI / 2; r.position.set(0, 0.32, z); m.add(r); }
      const tanque = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.6), mate(c1, { roughness: 0.35, metalness: 0.3 })); tanque.position.set(0, 0.82, -0.2); m.add(tanque);
      const motor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.6), mate(0x3a3d40, { metalness: 0.5, roughness: 0.4 })); motor.position.set(0, 0.5, 0); m.add(motor);
      const asiento = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.6), negro); asiento.position.set(0, 0.86, 0.32); m.add(asiento);
      const cola = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.35), mate(c2, { roughness: 0.4 })); cola.position.set(0, 0.85, 0.72); cola.rotation.x = -0.25; m.add(cola);
      const horquilla = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), mate(0xb9bec2, { metalness: 0.6 })); horquilla.position.set(0, 0.68, -0.6); horquilla.rotation.x = -0.35; m.add(horquilla);
      const manubrio = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.04), negro); manubrio.position.set(0, 1.08, -0.5); m.add(manubrio);
      const faro = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.08), mate(c1, { roughness: 0.4 })); faro.position.set(0, 0.95, -0.72); m.add(faro);
      if (k < 2) { const casco = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), negro); casco.position.set(0.12, 1.12, -0.48); m.add(casco); }
      m.position.set(x0, 0, 0); m.rotation.z = (k % 2 ? 1 : -1) * 0.12;   // apoyadas en el parador
      g.add(m);
    }
    // rótulo azul en su poste, junto a la orilla del pasillo, y el hito naranja con base negra
    const poste = caja(0.06, 2.3, 0.06, mate(0x8c9196, { metalness: 0.5 }), -largo / 2 + largo * 0.5 - 0.35, 1.15, -1.3);
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 192;
    const x = cv.getContext("2d"); x.fillStyle = "#1f5aa8"; x.fillRect(0, 0, 128, 192); x.strokeStyle = "#fff"; x.lineWidth = 6; x.strokeRect(6, 6, 116, 180);
    x.fillStyle = "#fff"; x.font = "700 22px Arial, sans-serif"; x.textAlign = "center"; x.fillText("PARQUEO", 64, 80); x.fillText("MOTOS", 64, 112);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const rotulo = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    rotulo.position.set(poste.position.x, 2.0, -1.26); g.add(rotulo);
    const naranja = mate(0xe8542a, { roughness: 0.6 });
    const hito = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.0, 10), naranja); hito.position.set(-largo / 2 - 0.9, 0.55, 0.3); g.add(hito);
    caja(0.4, 0.05, 0.4, negro, -largo / 2 - 0.9, 0.03, 0.3);
    for (const y of [0.75, 0.9]) caja(0.13, 0.05, 0.13, mate(0xf2f2f0), -largo / 2 - 0.9, y, 0.3);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro; registrar(g, null);
  }
  // parqueo de bicicletas (anotaciones y foto): losa de adoquín rojizo con tubos en U de acero inoxidable en fila
  function bicicletas({ p, largo, ancho, giro = 0, n = 5 }) {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(ancho, 0.08, largo), mate(0x8e5a4c, { roughness: 0.95 })); pad.position.y = 0.04; g.add(pad);
    const inox = mate(0xd9dde1, { metalness: 0.7, roughness: 0.25 });
    for (let k = 0; k < n; k++) {
      const z = -largo / 2 + (largo * (k + 0.5)) / n;
      const u = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 14, Math.PI), inox); u.position.set(0, 0.08, z); g.add(u);
      for (const xx of [-0.42, 0.42]) { const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 6), inox); pie.position.set(xx, 0.04, z); g.add(pie); }
    }
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro; registrar(g, null);
  }
  // rampa para personas con discapacidad (fotos, edificio 26): dos tramos paralelos pegados a la pared, el de afuera
  // sube del suelo hasta un descanso en el otro extremo y el de adentro vuelve hasta el segundo piso, donde empata con
  // la pasarela. Losa de concreto con guía táctil amarilla, barandas de tubo gris a los dos lados y columnas grises;
  // debajo, piedra bola. Va escalada en alto como los edificios y asentada a la altura del edificio (nivel_de)
  function rampaDoble({ x_este: xE, x_oeste: xW, z_pared: zp, hacia = -1, ancho = 1.5, piso = 4.2, nivel_de: nivelDe }) {
    const g = new THREE.Group();
    const concreto = mate(0xb7b4ad, { roughness: 0.95 }), gris = mate(0x6f7a85, { roughness: 0.45, metalness: 0.5 });
    const amarillo = mate(0xe0b52a, { roughness: 0.7 }), piedra = mate(0x8b877f, { roughness: 1 });
    const Z = (v) => zp + hacia * v;   // v: distancia desde la pared
    const DESC = 2.0;                  // largo del descanso
    const vIn = 0.15 + ancho / 2, vOut = 0.15 + ancho + 0.6 + ancho / 2, yD = piso / 2, y0 = 0.15;
    const caja = (w, h, d, mat, x, y, z, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.z = rz; g.add(m); return m; };
    // tramo inclinado a lo largo de x, de (xa, ya) a (xb, yb), a distancia v de la pared
    const tramo = (v, xa, ya, xb, yb) => {
      const L = Math.hypot(xb - xa, yb - ya), rz = Math.atan2(yb - ya, xb - xa), xm = (xa + xb) / 2, ym = (ya + yb) / 2;
      caja(L, 0.18, ancho, concreto, xm, ym - 0.09, Z(v), rz);
      caja(L, 0.02, 0.3, amarillo, xm, ym + 0.01, Z(v), rz);                               // guía táctil
      caja(L, 0.25, 0.14, gris, xm, ym - 0.3, Z(v + ancho / 2 - 0.1), rz);                   // viga de acero
      for (const lado of [-1, 1]) {
        const br = baranda(L - 0.1); br.position.set(xm, ym, Z(v + lado * (ancho / 2 - 0.05))); br.rotation.set(0, 0, rz);
        if (hacia < 0) br.rotation.y = 0; g.add(br);
      }
    };
    // de afuera: sube del suelo (este) al descanso (oeste); de adentro: del descanso al segundo piso (este)
    tramo(vOut, xE, y0, xW, yD);
    tramo(vIn, xW, yD, xE, piso);
    // (anotaciones) entrada y salida junto al edificio 26: abajo un descanso a ras del suelo al pie del tramo de afuera,
    // arriba un descanso que llega hasta la pasarela del segundo piso; los dos con baranda a los lados
    const LL = 1.8;
    caja(LL, 0.15, ancho + 0.1, concreto, xE + LL / 2, y0 - 0.07, Z(vOut));
    caja(LL, 0.02, 0.3, amarillo, xE + LL / 2, y0 + 0.01, Z(vOut));
    caja(LL, 0.2, ancho + 0.1, concreto, xE + LL / 2, piso - 0.1, Z(vIn));
    caja(LL, 0.02, 0.3, amarillo, xE + LL / 2, piso + 0.01, Z(vIn));
    for (const [v, y] of [[vOut, y0], [vIn, piso]]) for (const lado of [-1, 1]) {
      if (y === piso && lado < 0) continue;   // del lado de la pared, arriba, se entra al edificio por la pasarela
      const br = baranda(LL - 0.1); br.position.set(xE + LL / 2, y, Z(v + lado * (ancho / 2 - 0.05))); g.add(br);
    }
    for (const v of [vIn - ancho / 2 + 0.3, vIn + ancho / 2 - 0.2]) {   // columnas bajo el descanso de arriba
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, piso - 0.2, 10), gris); c.position.set(xE + LL - 0.2, (piso - 0.2) / 2, Z(v)); g.add(c);
    }
    // descanso al oeste, de lado a lado de los dos tramos, con baranda por fuera
    const xD = xW - DESC / 2, vMax = vOut + ancho / 2;
    caja(DESC, 0.2, vMax, concreto, xD, yD - 0.1, Z(vMax / 2));
    const b1 = baranda(vMax); b1.position.set(xW - DESC, yD, Z(vMax / 2)); b1.rotation.y = Math.PI / 2; g.add(b1);
    const b2 = baranda(DESC); b2.position.set(xD, yD, Z(vMax)); g.add(b2);
    // columnas grises bajo la orilla de afuera y bajo el descanso
    for (let x = xW - DESC + 0.2; x <= xE - 1.5; x += 3) {
      const t = (x - xW) / (xE - xW), hAf = x < xW ? yD : yD + (y0 - yD) * t;
      for (const v of x < xW ? [0.3, vMax - 0.2] : [vMax - 0.2]) {
        const h = Math.max(0.2, (x < xW ? yD : v > vIn + ancho / 2 ? hAf : yD) - 0.3);
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h, 10), gris); c.position.set(x, h / 2, Z(v)); g.add(c);
      }
    }
    // piedra bola bajo la rampa
    let semilla = 3; const azar = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647; };
    for (let k = 0; k < 40; k++) {
      const pd = new THREE.Mesh(new THREE.SphereGeometry(0.16 + azar() * 0.1, 6, 4), piedra);
      pd.position.set(xW - DESC + azar() * (xE - xW + DESC), 0.06, Z(0.2 + azar() * (vMax - 0.4))); pd.scale.y = 0.6; g.add(pd);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
    g.scale.y = EXAGERAR;
    registrar(g, null);
    if (nivelDe) g.userData.nivelDe = nivelDe;
  }
  // portón peatonal (anotaciones): dos hojas angostas como las del portón grande, al final de la cerca
  function portonPeatonal({ p, giro, ancho = 1.4 }) {
    const g = portonVerde(false, ancho / 2); g.position.set(p[0], 0, p[1]); g.rotation.y = giro; escena.add(g);
  }
  // pared de concreto (anotaciones): la que sostiene un portón; larga en x antes de girar
  function muro({ p, giro = 0, largo, alto, grueso }) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(largo, alto, grueso), mate(0xe9e7e0, { roughness: 0.9 }));
    m.position.y = alto / 2;
    const g = new THREE.Group(); g.add(m); g.position.set(p[0], 0, p[1]); g.rotation.y = giro;
    registrar(g, null);
  }
  for (const el of datos.campus.elementos || []) {
    const hacer = { muro, pasillo, caseta, parqueo, bancas, escalera, rampa, descanso, mesas, explanada, alcantarilla, jardin, pluma, comedor, tanque,
      acera, cebra, porton_peatonal: portonPeatonal, puente_peatonal: puentePeatonal, arbol_grande: arbolGrande,
      ruedas_tren: ruedasTren, congos, carport, pasarela, bicicletas, rampa_doble: rampaDoble, punto_verde: puntoVerde, motos, pollitos, busto, entrada_registro: entradaRegistro, losa, muro_piedra: muroPiedra }[el.tipo];
    if (hacer) hacer(el);
    else if (el.tipo === "porton") {   // acceso cerrado con portón (sin faroles)
      const g = portonVerde(false, el.hoja || 4.2); g.position.set(el.p[0], 0, el.p[1]); g.rotation.y = el.giro; escena.add(g);
    }
  }
}

// ---------- árboles y palmeras (instancias: cientos de árboles en pocas llamadas de dibujo)
{
  const lista = [...datos.campus.arboles, ...entorno.arboles];
  const redondos = lista.filter((a) => !a.palma), palmas = lista.filter((a) => a.palma);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), esc = new THREE.Vector3(), color = new THREE.Color();
  const tronco = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const tonos = [0x4f8f3a, 0x5f9e43, 0x3f7d34, 0x6aa84f, 0x467f36];
  const azar = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

  const copas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), redondos.length);
  const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.6, 1, 6), tronco, redondos.length + palmas.length);
  redondos.forEach((a, i) => {
    const r = Math.max(a.r, 2.2), h = r * 0.9;
    m4.compose(pos.set(a.p[0], h / 2, a.p[1]), q.identity(), esc.set(1, h, 1)); troncos.setMatrixAt(i, m4);
    q.setFromEuler(new THREE.Euler(0, azar(i) * 6.28, 0));
    m4.compose(pos.set(a.p[0], h + r * 0.75, a.p[1]), q, esc.set(r, r * 0.8, r)); copas.setMatrixAt(i, m4);
    copas.setColorAt(i, color.setHex(a.tono || tonos[Math.floor(azar(i + 7) * tonos.length)]));
  });
  const HOJAS = 8;
  const hojas = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 1.25, 3, 1).translate(0, 0.62, 0),
    new THREE.MeshLambertMaterial({ color: 0x5b9a3c, side: THREE.DoubleSide, flatShading: true }), palmas.length * HOJAS);
  const ayuda = new THREE.Object3D();
  palmas.forEach((a, i) => {
    const r = Math.max(a.r, 2.2), h = r * 2.2;
    m4.compose(pos.set(a.p[0], h / 2, a.p[1]), q.identity(), esc.set(0.75, h, 0.75)); troncos.setMatrixAt(redondos.length + i, m4);
    for (let k = 0; k < HOJAS; k++) {
      ayuda.position.set(a.p[0], h, a.p[1]);
      ayuda.rotation.set(0, (k / HOJAS) * Math.PI * 2 + i, 0);
      ayuda.rotateZ(-Math.PI / 2 + 0.45);
      ayuda.scale.set(r, r, r * 0.25);
      ayuda.updateMatrix();
      hojas.setMatrixAt(i * HOJAS + k, ayuda.matrix);
    }
  });
  for (const m of [copas, troncos, hojas]) { m.castShadow = !liviano; m.instanceMatrix.needsUpdate = true; escena.add(m); }
  if (copas.instanceColor) copas.instanceColor.needsUpdate = true;
}

// ---------- asentar sobre el relieve
// Todo se armó sobre un suelo plano (y = 0). Tres casos:
//  · un lugar con altura (edificio, piscina, puente, caseta, parqueo) que mide menos de UNIDAD en planta se sube
//    entero a la altura del terreno en su centro, sin deformarlo, y el terreno se empareja debajo de su huella
//    (lo que toca el suelo), con un talud corto alrededor: así no asoma zacate ni queda nada volando;
//  · lo lineal (pasillos, aceras, cercas: userData.lineal) y lo plano a ras del suelo (losas, cebras, rayas)
//    sigue el terreno tramo a tramo: cada pieza se inclina con la pendiente y las mallas se doblan;
//  · las instancias sueltas (árboles) se suben una por una.
// Todo se calcula con las posiciones de antes de subir; al final se rehace el suelo con el terreno emparejado.
{
  const UNIDAD = 75, TALUD = 6, AREA_MIN = 20;
  escena.updateMatrixWorld(true);
  const caja = new THREE.Box3(), centro = new THREE.Vector3(), tam = new THREE.Vector3(), m3 = new THREE.Matrix3();
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const local = (matrizMundo, h) => new THREE.Vector3(0, h, 0).applyMatrix3(m3.setFromMatrix4(matrizMundo).invert());
  const alSuelo = (o) => { caja.setFromObject(o); return !caja.isEmpty() && caja.max.y - caja.min.y < 0.8 && caja.min.y < 0.6; };

  // huella de un lugar: envolvente convexa (en planta) de las piezas que tocan el suelo
  const envolvente = (pts) => {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const abajo = [], arriba = [];
    for (const v of pts) { while (abajo.length > 1 && cruz(abajo.at(-2), abajo.at(-1), v) <= 0) abajo.pop(); abajo.push(v); }
    for (const v of pts.slice().reverse()) { while (arriba.length > 1 && cruz(arriba.at(-2), arriba.at(-1), v) <= 0) arriba.pop(); arriba.push(v); }
    return abajo.slice(0, -1).concat(arriba.slice(0, -1));
  };
  const huella = (o) => {
    const pts = [], b = new THREE.Box3();
    o.traverse((x) => {
      if (!x.isMesh || !x.visible) return;
      b.setFromObject(x);
      if (b.isEmpty() || b.min.y > 0.6) return;
      const pos = x.geometry?.attributes?.position;
      if (o.userData.huellaExacta && pos && !x.isInstancedMesh && pos.count < 4000) {   // edificio girado: sus vértices, no la caja alineada a los ejes
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(x.matrixWorld); pts.push([v.x, v.z]); }
        return;
      }
      for (const [px, pz] of [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z]]) pts.push([px, pz]);
    });
    if (pts.length < 3) return null;
    const h = envolvente(pts);
    let area = 0;
    for (let i = 0; i < h.length; i++) { const a = h[i], b2 = h[(i + 1) % h.length]; area += a[0] * b2[1] - b2[0] * a[1]; }
    return Math.abs(area) / 2 >= AREA_MIN ? h : null;
  };
  // empareja la malla de alturas dentro de una huella (convexa, antihoraria) y con un talud alrededor
  const aplanar = (hull, nivel, TALUD) => {
    const r = relieve;
    if (!r) return;
    const xs = hull.map((v) => v[0]), zs = hull.map((v) => v[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - TALUD - r.x) / r.paso)), i1 = Math.min(r.nx - 1, Math.ceil((Math.max(...xs) + TALUD - r.x) / r.paso));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - TALUD - r.z) / r.paso)), j1 = Math.min(r.nz - 1, Math.ceil((Math.max(...zs) + TALUD - r.z) / r.paso));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = r.x + i * r.paso, z = r.z + j * r.paso;
      let dentro = true, d = Infinity;
      for (let k = 0; k < hull.length; k++) {
        const [ax, az] = hull[k], [bx, bz] = hull[(k + 1) % hull.length], ex = bx - ax, ez = bz - az;
        if (ex * (z - az) - ez * (x - ax) < 0) dentro = false;
        const t2 = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
        d = Math.min(d, Math.hypot(x - ax - t2 * ex, z - az - t2 * ez));
      }
      if (dentro) d = 0;
      d = Math.max(0, d - 1.5);   // la malla es de 2 m: la orilla de la huella queda a nivel
      if (d >= TALUD) continue;
      let w = 1 - d / TALUD; w = w * w * (3 - 2 * w);
      const k = j * r.nx + i;
      r.h[k] = r.h[k] * (1 - w) + nivel * w;
    }
  };
  const doblar = (o, altura = alturaEn) => {
    const geo = o.geometry.clone(), pos = geo.attributes.position, mw = o.matrixWorld, inversa = mw.clone().invert(), d = new THREE.Vector3();
    m3.setFromMatrix4(inversa);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mw);
      d.set(0, altura(p.x, p.z), 0).applyMatrix3(m3);
      pos.setXYZ(i, pos.getX(i) + d.x, pos.getY(i) + d.y, pos.getZ(i) + d.z);
    }
    if (geo.attributes.normal) geo.computeVertexNormals();
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    o.geometry = geo;
  };
  // instancias: se suben a la altura de su centro; las cajas largas (losas, guías, techos y barandas de un pasillo)
  // se inclinan además a lo largo, con la pendiente, para que un tramo empate con el siguiente
  const u = new THREE.Vector3(), w = new THREE.Vector3(), qt = new THREE.Quaternion(), ARRIBA = new THREE.Vector3(0, 1, 0);
  const instancias = (o, inclinarTodo, alturaEn_ = alturaEn) => {
    const alturaEn = alturaEn_;
    const par = o.geometry.parameters || {}, esCaja = o.geometry.type === "BoxGeometry";
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4); m4.decompose(p, q, s);
      centro.copy(p).applyMatrix4(o.matrixWorld);
      let h = alturaEn(centro.x, centro.z);
      const enX = esCaja && s.x * par.width >= s.z * par.depth, L = esCaja ? (enX ? s.x * par.width : s.z * par.depth) / 2 : 0;
      if (esCaja && L > 0.5 && (inclinarTodo || (s.y * par.height < 0.8 && centro.y < 0.6))) {
        u.set(enX ? 1 : 0, 0, enX ? 0 : 1).applyQuaternion(q).transformDirection(o.matrixWorld).setY(0).normalize();
        const hA = alturaEn(centro.x - u.x * L, centro.z - u.z * L), hB = alturaEn(centro.x + u.x * L, centro.z + u.z * L);
        h = (hA + hB) / 2;
        w.crossVectors(u, ARRIBA).applyMatrix3(m3.setFromMatrix4(o.matrixWorld).invert()).normalize();
        q.premultiply(qt.setFromAxisAngle(w, Math.atan2(hB - hA, 2 * L)));
      }
      p.add(local(o.matrixWorld, h));
      o.setMatrixAt(i, m4.compose(p, q, s));
    }
    o.instanceMatrix.needsUpdate = true;
    o.computeBoundingBox(); o.computeBoundingSphere();
  };

  // 1. clasificar (con el terreno del plano)
  const enteros = [], aDoblar = [], sueltas = [], lineales = [];
  const piezasPlanas = (o) => o.traverse((x) => { if (x.isInstancedMesh) sueltas.push(x); else if (x.isMesh) aDoblar.push(x); });
  const clasificar = (o) => {
    if (o.isLight) return;
    if (o.userData.lineal) { lineales.push(o); return; }
    if (o.isInstancedMesh) { sueltas.push(o); return; }
    caja.setFromObject(o);
    if (caja.isEmpty()) return;
    caja.getSize(tam); caja.getCenter(centro);
    if (tam.y < 0.8 && caja.min.y < 0.6) { piezasPlanas(o); return; }   // a ras del suelo: se dobla
    if (o.userData.extremos) {   // puente: altura de los extremos; el terreno se empareja solo en los estribos
      const [a, b] = o.userData.extremos, hA = alturaEn(a[0], a[1]), hB = alturaEn(b[0], b[1]);
      const estribo = ([x, z]) => [[x - 4, z - 4], [x + 4, z - 4], [x + 4, z + 4], [x - 4, z + 4]];
      enteros.push({ o, h: (hA + hB) / 2, huella: null, estribos: [envolvente(estribo(a)), envolvente(estribo(b))] });
      return;
    }
    if (Math.max(tam.x, tam.z) <= UNIDAD) { enteros.push({ o, h: alturaEn(centro.x, centro.z), huella: huella(o) }); return; }
    if (o.children.length) { [...o.children].forEach(clasificar); return; }
    if (o.isMesh) aDoblar.push(o);
  };
  escena.children.slice(inicioCampus).forEach(clasificar);
  // 2. emparejar el terreno bajo los lugares que se suben enteros
  // lo que va unido a un lugar (pasarelas) se sube a la misma altura que él, para que los pisos empaten
  for (const e of enteros) if (e.o.userData.nivelDe) {
    const ref = enteros.find((q) => q.o.userData.id === e.o.userData.nivelDe);
    if (ref) e.h = ref.h;
  }
  for (const e of enteros) if (e.huella) aplanar(e.huella, e.h, e.o.userData.talud || TALUD);
  for (const e of enteros) for (const q of e.estribos || []) aplanar(q, e.h, 4);
  // 2b. bajo aceras y pisos de pasillo el terreno toma la rasante del camino: la altura del terreno en sus puntos,
  // suavizada; así no asoma el zacate sobre el camino ni una losa se clava en una zanja
  const nivelarFranja = (pts, ancho, recta = false) => {
    const r = relieve;
    if (!r || pts.length < 2) return;
    let y = pts.map(([x, z]) => alturaEn(x, z));
    if (recta) {   // rampa pareja de punta a punta: llega justo al nivel del piso donde termina (Docencia)
      const finos = [pts[0]];   // puntos cada medio metro, para que el tramo llano del final quede llano
      for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
        for (let k = 1; k <= n; k++) finos.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]); }
      pts = finos;
      const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const fin = enteros.find((q) => q.o.userData.id === recta);   // el lugar donde llega (su nivel de piso)
      // el piso del pasillo (0,12 sobre la rasante, que va 0,03 abajo) queda al ras del corredor (≈ 0,1 sobre el nivel); llano los últimos 2 m
      const a = y[0], b = fin ? fin.h + 0.01 : y.at(-1), Lr = Math.max(1, L.at(-1) - 2); y = L.map((d) => a + (b - a) * Math.min(1, d / Lr));
    } else for (let pasada = 0; pasada < 3; pasada++) y = y.map((v, i) => (i === 0 || i === y.length - 1 ? v : (y[i - 1] + 2 * v + y[i + 1]) / 4));
    const nucleo = ancho / 2 + 0.9, borde = nucleo + 2.5;
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - borde - r.x) / r.paso)), i1 = Math.min(r.nx - 1, Math.ceil((Math.max(ax, bx) + borde - r.x) / r.paso));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - borde - r.z) / r.paso)), j1 = Math.min(r.nz - 1, Math.ceil((Math.max(az, bz) + borde - r.z) / r.paso));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = r.x + i * r.paso, z = r.z + j * r.paso, t2 = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
        const d = Math.hypot(x - ax - t2 * ex, z - az - t2 * ez);
        if (d > borde) continue;
        const rasante = y[k] + (y[k + 1] - y[k]) * t2 - 0.03, c = j * r.nx + i;
        let w = d <= nucleo ? 1 : 1 - (d - nucleo) / (borde - nucleo); w = w * w * (3 - 2 * w);
        r.h[c] = r.h[c] * (1 - w) + rasante * w;
        if (d <= ancho / 2 + 0.5) (r.bajo ||= new Uint8Array(r.nx * r.nz))[c] = 1;   // bajo el piso (ver levantarSuelo)
      }
    }
  };
  for (const g of lineales) for (const f of g.userData.franjas || []) nivelarFranja(f, g.userData.ancho || 2, g.userData.rasanteRecta);
  // lo que va sobre el piso de un pasillo (Punto Verde) toma la altura del terreno ya emparejado bajo el pasillo
  for (const e of enteros) if (e.o.userData.sobrePasillo) e.h = alturaEn(e.o.position.x, e.o.position.z);
  // 3. subir
  for (const e of enteros) e.o.position.add(local(e.o.parent.matrixWorld, e.h));
  for (const o of aDoblar) doblar(o);
  for (const o of sueltas) instancias(o, false);
  // lo lineal que llega al puente (las mallas de la quebrada, la acera de la calle) sube al nivel del tablero, para
  // que empate con la malla y la acera del puente en vez de bajar a la orilla del cauce
  const tableros = enteros.filter((e) => e.o.userData.extremos && e.o.userData.ejeTablero).map((e) => ({ h: e.h, eje: e.o.userData.ejeTablero }));
  const distSeg = (x, z, [ax, az], [bx, bz]) => {
    const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  const alturaLineal = (x, z) => {
    let h = alturaEn(x, z);
    for (const t of tableros) for (let i = 0; i < t.eje.length - 1; i++) {
      if (distSeg(x, z, t.eje[i], t.eje[i + 1]) < 5.6) { h = Math.max(h, t.h + 0.1); break; }
    }
    return h;
  };
  for (const g of lineales) g.traverse((x) => { if (x.isInstancedMesh) instancias(x, true, alturaLineal); else if (x.isMesh) doblar(x, alturaLineal); });
  levantarSuelo();
  // anclas de los números y de los congos: a la altura del terreno de su lugar
  const anclas = new Set();
  escena.traverse((o) => { const c = o.userData.centro; if (c && c.isVector3) anclas.add(c); });
  for (const c of anclas) c.y += alturaEn(c.x, c.z);
  centroCongos.y += alturaEn(centroCongos.x, centroCongos.z);
}

// ---------- fundir piezas
// La maqueta tiene unas 1200 piezas y cada una es una llamada de dibujo por cuadro; un celular sufre con más de unos
// cientos. Como nada se mueve después de armarla, las piezas de un mismo lugar que comparten material se funden en una
// sola. Cada lugar sigue siendo su propio grupo, así que se puede tocar y resaltar igual que antes.
{
  escena.updateMatrixWorld(true);
  const dueno = new Map();
  for (const g of edificios) g.traverse((o) => { if (o.isMesh) dueno.set(o, g); });
  const lotes = new Map();
  escena.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent || !o.visible || o.userData.noFundir) return;
    const atributos = Object.entries(o.geometry.attributes);
    if (atributos.some(([, a]) => a.isInterleavedBufferAttribute) || Object.keys(o.geometry.morphAttributes).length) return;
    if (o.matrixWorld.determinant() < 0) return;   // una pieza reflejada quedaría con las caras al revés
    const g = dueno.get(o) || null;
    const firma = atributos.map(([k, a]) => k + a.itemSize).sort().join(",");
    const clave = [g ? g.id : "-", o.material.id, o.castShadow, o.receiveShadow, o.renderOrder, firma].join("|");
    if (!lotes.has(clave)) lotes.set(clave, { g, o, piezas: [] });
    lotes.get(clave).piezas.push(o);
  });
  const m = new THREE.Matrix4(), inversa = new THREE.Matrix4();
  for (const { g, o: modelo, piezas } of lotes.values()) {
    if (piezas.length < 2) continue;
    const padre = g || escena;
    inversa.copy(padre.matrixWorld).invert();
    const geos = piezas.map((o) => o.geometry.clone().applyMatrix4(m.multiplyMatrices(inversa, o.matrixWorld)));
    const nombres = Object.keys(geos[0].attributes);
    const vertices = geos.reduce((s, x) => s + x.attributes.position.count, 0);
    const caras = geos.reduce((s, x) => s + (x.index ? x.index.count : x.attributes.position.count), 0);
    const unida = new THREE.BufferGeometry();
    for (const k of nombres) {
      const tam = geos[0].attributes[k].itemSize, arr = new Float32Array(vertices * tam);
      let pos = 0;
      for (const x of geos) { const a = x.attributes[k]; for (let i = 0; i < a.count; i++) for (let c = 0; c < tam; c++) arr[pos++] = a.getComponent(i, c); }
      unida.setAttribute(k, new THREE.BufferAttribute(arr, tam));
    }
    const indice = vertices > 65535 ? new Uint32Array(caras) : new Uint16Array(caras);
    let pi = 0, base = 0;
    for (const x of geos) {
      const n = x.attributes.position.count;
      if (x.index) for (let i = 0; i < x.index.count; i++) indice[pi++] = x.index.getX(i) + base;
      else for (let i = 0; i < n; i++) indice[pi++] = i + base;
      base += n;
      x.dispose();
    }
    unida.setIndex(new THREE.BufferAttribute(indice, 1));
    const malla = new THREE.Mesh(unida, modelo.material);
    Object.assign(malla, { castShadow: modelo.castShadow, receiveShadow: modelo.receiveShadow, renderOrder: modelo.renderOrder });
    if (g) malla.userData.edificio = g;
    padre.add(malla);
    for (const o of piezas) o.removeFromParent();
  }
}

// ---------- cámara y controles
const controles = new OrbitControls(camara, lienzo);
controles.enableDamping = !sinMovimiento;
controles.dampingFactor = 0.08;
controles.maxPolarAngle = 1.3;
controles.minDistance = 45;
controles.maxDistance = 900;
controles.screenSpacePanning = false;
// Vista general desde el sureste, más lejos en pantallas verticales para que quepa el campus
const vistaGeneral = { objetivo: new THREE.Vector3(-15, 0, 18), posicion: new THREE.Vector3() };
function calcularVistaGeneral() {
  const aspecto = Math.max(lienzo.clientWidth, 1) / Math.max(lienzo.clientHeight, 1);
  // En pantalla vertical el campus (más ancho que largo) se mira desde el este y con lente más abierta,
  // así cabe entero; la brújula indica dónde queda el norte.
  const vertical = aspecto < 1;
  camara.fov = vertical ? 52 : 38;
  camara.updateProjectionMatrix();
  const lejos = vertical ? Math.max(1, Math.pow(0.62 / aspecto, 0.5)) : aspecto < 1.6 ? Math.pow(1.6 / aspecto, 0.6) : 1;
  const desde = vertical ? new THREE.Vector3(360, 430, 76) : new THREE.Vector3(-80, 240, 370);
  vistaGeneral.objetivo.set(-15, 0, vertical ? 2 : 18);
  // en la portada arranca con la cámara del lado del lugar elegido (la entrada), mirándolo de frente
  const frente = PORTADA && datos.campus.edificios.find((e) => e.id === FRENTE_PORTADA);
  if (frente) {
    const dx = frente.centro[0] - vistaGeneral.objetivo.x, dz = frente.centro[1] - vistaGeneral.objetivo.z;
    const r = Math.hypot(desde.x, desde.z) / Math.max(Math.hypot(dx, dz), 1);
    desde.set(dx * r, desde.y, dz * r);
  }
  vistaGeneral.posicion.copy(desde).multiplyScalar(lejos).add(vistaGeneral.objetivo);
}
calcularVistaGeneral();
camara.position.copy(vistaGeneral.posicion);
controles.target.copy(vistaGeneral.objetivo);
controles.addEventListener("change", pedirDibujo);
if (PORTADA) {
  controles.autoRotate = !sinMovimiento && location.hash !== "#captura-portada";
  controles.autoRotateSpeed = 0.5;   // una vuelta cada dos minutos
  controles.enableZoom = false; controles.enablePan = false;
  controles.minPolarAngle = controles.maxPolarAngle = 0.98;   // solo gira alrededor, sin inclinarse
}
// visita guiada (recorrido-visita.js): en cada lugar, ya llegada la cámara, gira despacio alrededor
let visitaGira = false;
if (!PORTADA) {
  controles.autoRotateSpeed = 0.8;   // unos 75 s por vuelta
  raiz.addEventListener("visita-giro", (e) => {
    visitaGira = !!e.detail && !sinMovimiento;
    // en pausa se detiene en seco: un paso sin amortiguación consume la inercia que quedaba del giro
    if (!visitaGira) { controles.autoRotate = false; controles.enableDamping = false; controles.update(); controles.enableDamping = !sinMovimiento; }
    pedirDibujo();
  });
}

// ---------- marcas numeradas (botones HTML encima del lienzo)
// Cada número tiene un ancla 3D fija (sobre el punto más alto de su lugar) que se calcula una sola vez. En cada
// fotograma solo se proyecta esa ancla: los números nunca se corren. Cuáles se ven depende de dos cosas:
//  · el zoom (prioridad 1, 2 o 3 según la distancia de la cámara, con histéresis), y
//  · si se tapan: cuando la cámara se detiene, el de menor prioridad se oculta con un fundido.
raiz.style.setProperty("--fundido-marcas", `${sinMovimiento ? 0 : MARCAS.fundidoMs}ms`);
const marcas = new Map();   // id → { b, g, ancla, prioridad, tapada, visible, x, y, fuera }
for (const g of edificios) {
  const l = lugares.get(g.userData.id);
  if (!l) continue;
  const b = document.createElement("button");
  b.type = "button";
  b.className = (g.userData.menor ? "mapa3d__marca mapa3d__marca--menor" : "mapa3d__marca") + ` mapa3d__marca--oculta mapa3d__chip--z${l.zona || 0}`;
  b.textContent = l.id;
  b.setAttribute("aria-label", `${l.id}. ${l.nombre}`);
  b.addEventListener("click", () => elegir(l.id, true));
  capaMarcas.appendChild(b);
  const ancla = g.userData.centro.clone(); ancla.y += MARCAS.alturaAncla;
  marcas.set(l.id, { id: l.id, b, g, ancla, prioridad: prioridadDe(l.id), tapada: true, visible: false, x: 0, y: 0, fuera: true });
}
const v = new THREE.Vector3();
const TAN_REF = Math.tan(THREE.MathUtils.degToRad(19));
let nivelZoom = 1;
function actualizarNivel() {
  // distancia equivalente con un lente de 38°, para que el umbral valga igual en PC (38°) y en celular (52°)
  const d = camara.position.distanceTo(controles.target) * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2)) / TAN_REF;
  const { medio, cerca } = MARCAS.zoom, h = MARCAS.histeresis;
  let n = nivelZoom;
  if (d > medio * (1 + h)) n = 1;
  else if (n < 2 && d < medio * (1 - h)) n = 2;
  if (n === 3 && d > cerca * (1 + h)) n = 2;
  else if (n === 2 && d < cerca * (1 - h)) n = 3;
  nivelZoom = n;
}
// los que entran por zoom esperan a que la cámara se detenga (se calcula si tapan a otro) y aparecen con fundido
// con una zona elegida en los botones de zona, todos sus números se ven, sin importar la prioridad
let zonaActiva = null;
function elegible(m) { return m.g === elegido || m.prioridad <= nivelZoom || (zonaActiva !== null && lugares.get(m.id)?.zona === zonaActiva); }
function moverMarcas() {
  const w = lienzo.clientWidth, h = lienzo.clientHeight;
  actualizarNivel();
  for (const m of marcas.values()) {
    v.copy(m.ancla).project(camara);
    m.fuera = v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05;
    m.x = ((v.x + 1) / 2) * w; m.y = ((1 - v.y) / 2) * h;
    if (!elegible(m)) m.tapada = true;
    const visible = !m.fuera && elegible(m) && !m.tapada;
    if (visible !== m.visible) { m.visible = visible; m.b.classList.toggle("mapa3d__marca--oculta", !visible); }
    if (!m.fuera) m.b.style.transform = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
  }
}
// Con la cámara quieta: de más a menos importante, cada número se muestra solo si no tapa a uno ya puesto
function resolverEncimados() {
  const puestos = [], sep = MARCAS.separacion;
  const lista = [...marcas.values()].filter((m) => !m.fuera && elegible(m))
    .sort((a, b) => (b.g === elegido) - (a.g === elegido) || compararRango(a.id, b.id));
  for (const m of marcas.values()) m.tapada = true;
  for (const m of lista) {
    if (puestos.some((p) => Math.abs(p.x - m.x) < sep && Math.abs(p.y - m.y) < sep)) continue;
    m.tapada = false; puestos.push(m);
  }
  moverMarcas();
}
// Con la cámara quieta se programa una sola espera: los congos redibujan cada 40 ms y, si cada cuadro la
// reiniciara, la espera nunca se cumpliría y los números no aparecerían cerca de ellos (zonas 1 y 2).
let esperaQuieta = null;
function camaraQuieta() {
  if (esperaQuieta !== null) return;
  esperaQuieta = setTimeout(() => { esperaQuieta = null; resolverEncimados(); }, MARCAS.esperaMs);
}
function camaraEnMovimiento() { clearTimeout(esperaQuieta); esperaQuieta = null; }

// ---------- elegir un edificio: lo resalta, muestra la ficha y acerca la cámara
let elegido = null;
// al soltar un lugar, techo y paredes vuelven a su color (no todos son blancos: portones, parqueos…)
function soltar(g) {
  for (const m of [g.userData.mat.techo, g.userData.mat.pared]) if (m.userData.original !== undefined) m.color.setHex(m.userData.original);
}
function elegir(id, volar) {
  if (elegido) soltar(elegido);
  marcas.forEach((m, k) => m.b.setAttribute("aria-pressed", String(k === id)));
  const g = edificios.find((x) => x.userData.id === id);
  const l = lugares.get(id);
  if (!g || !l) return;
  // un lugar de otra zona suelta el botón de zona (si no, «Zona 4» seguía marcada con un lugar de la zona 2)
  if (zonaActiva !== null && l.zona !== zonaActiva) marcarZona(null);
  elegido = g;
  const mElegida = marcas.get(id);
  if (mElegida) mElegida.tapada = false;
  const { techo, pared } = g.userData.mat;
  for (const m of [techo, pared]) if (m.userData.original === undefined) m.userData.original = m.color.getHex();
  techo.color.setHex(g.userData.alto < 1 ? techo.userData.original : colores.elegido);
  pared.color.setHex(colores.paredElegida);
  rellenarFicha(l);
  raiz.dispatchEvent(new CustomEvent("lugar-elegido", { detail: { id } }));   // narración (recorrido-audio.js)
  if (volar) {
    const c = g.userData.centro;
    const dir = camara.position.clone().sub(controles.target).normalize();
    const suelo0 = alturaEn(c.x, c.z);
    const objetivo = new THREE.Vector3(c.x, suelo0, c.z);
    // En PC la ficha ocupa la izquierda de la maqueta: el lugar se centra en lo que queda libre a la derecha,
    // si no, quedaba a medias debajo de la ficha (p. ej. la Entrada principal).
    const rf = ficha.getBoundingClientRect(), rl = lienzo.getBoundingClientRect();
    const tapa = ficha.hidden ? 0 : rf.right - rl.left;
    if (tapa > 0 && rl.width - tapa >= 300 && rf.height > rl.height * 0.4) {
      const metrosPorPx = (2 * 120 * Math.tan(THREE.MathUtils.degToRad(camara.fov / 2))) / rl.height;
      const derecha = new THREE.Vector3().crossVectors(camara.up, dir).normalize();   // derecha de la pantalla
      objetivo.addScaledVector(derecha, -(tapa / 2) * metrosPorPx);
    }
    viajar(objetivo, objetivo.clone().addScaledVector(dir, 120));
  }
  pedirDibujo();
}
function cerrarFicha() {
  if (elegido) soltar(elegido);
  elegido = null;
  ficha.hidden = true;
  marcas.forEach((m) => m.b.setAttribute("aria-pressed", "false"));
  document.querySelectorAll("[data-lugar]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  pedirDibujo();
}
ficha.querySelector(".mapa3d__ficha-cerrar").addEventListener("click", cerrarFicha);


document.querySelectorAll("[data-lugar]").forEach((b) => b.addEventListener("click", () => {
  elegir(Number(b.dataset.lugar), true);
  lienzo.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "center" });
}));
const brujula = raiz.querySelector(".mapa3d__brujula");
function acercar(factor) {
  const dir = camara.position.clone().sub(controles.target);
  const d = THREE.MathUtils.clamp(dir.length() * factor, controles.minDistance, controles.maxDistance);
  viajar(controles.target.clone(), controles.target.clone().add(dir.setLength(d)));
}
raiz.querySelector("[data-acercar]").addEventListener("click", () => acercar(0.7));
raiz.querySelector("[data-alejar]").addEventListener("click", () => acercar(1.4));
const botonesZona = raiz.querySelectorAll("[data-zona]");
const marcarZona = (z) => { zonaActiva = z; botonesZona.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.zona) === z))); pedirDibujo(); };
raiz.querySelector("[data-vista-general]").addEventListener("click", () => { cerrarFicha(); marcarZona(null); calcularVistaGeneral(); viajar(vistaGeneral.objetivo, vistaGeneral.posicion); });
// botones de zona: la cámara se acerca hasta que caben todos los lugares de esa zona, sin cambiar el ángulo de vista
function enfocarZona(z) {
  const puntos = [...marcas.values()].filter((m) => lugares.get(m.id)?.zona === z).map((m) => m.g.userData.centro);
  if (!puntos.length) return;
  cerrarFicha();
  const caja = new THREE.Box3().setFromPoints(puntos), centro = caja.getCenter(new THREE.Vector3());
  centro.y = 0;
  const radio = Math.max(caja.getSize(new THREE.Vector3()).length() / 2, 35);
  const fov = THREE.MathUtils.degToRad(camara.fov), angulo = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camara.aspect));
  const distancia = THREE.MathUtils.clamp((radio * 1.1) / Math.sin(angulo / 2), controles.minDistance, controles.maxDistance);
  const dir = camara.position.clone().sub(controles.target).normalize();
  viajar(centro, centro.clone().addScaledVector(dir, distancia));
  marcarZona(z);
}
botonesZona.forEach((b) => b.addEventListener("click", () => enfocarZona(Number(b.dataset.zona))));

// ---------- pantalla completa: la maqueta, con sus números, botones y ficha, ocupa toda la pantalla. Donde el
// navegador no lo permite (el iPhone), se expande a toda la ventana; Esc o el mismo botón la devuelven.
if (!PORTADA) {
  const escenaNodo = raiz.querySelector(".mapa3d__escena"), botonPantalla = raiz.querySelector("[data-pantalla]");
  const nativa = () => document.fullscreenElement || document.webkitFullscreenElement;
  const marcarPantalla = () => {
    const activa = !!nativa() || raiz.classList.contains("mapa3d--pantalla-css");
    raiz.classList.toggle("mapa3d--pantalla", activa);
    botonPantalla.setAttribute("aria-pressed", String(activa));
    botonPantalla.setAttribute("aria-label", activa ? "Salir de pantalla completa" : "Ver la maqueta en pantalla completa");
    pedirDibujo();
  };
  const salirCss = () => { raiz.classList.remove("mapa3d--pantalla-css"); document.documentElement.classList.remove("sin-desplazar"); marcarPantalla(); };
  botonPantalla.addEventListener("click", async () => {
    if (nativa()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (raiz.classList.contains("mapa3d--pantalla-css")) { salirCss(); return; }
    const pedir = escenaNodo.requestFullscreen || escenaNodo.webkitRequestFullscreen;
    try {
      if (!pedir) throw new Error("sin pantalla completa");
      await pedir.call(escenaNodo);
    } catch {
      raiz.classList.add("mapa3d--pantalla-css"); document.documentElement.classList.add("sin-desplazar"); marcarPantalla();
    }
  });
  document.addEventListener("fullscreenchange", marcarPantalla);
  document.addEventListener("webkitfullscreenchange", marcarPantalla);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && raiz.classList.contains("mapa3d--pantalla-css")) salirCss(); });
}

// tocar un edificio en el lienzo (sin confundirlo con arrastrar para girar)
const rayo = new THREE.Raycaster(), puntero = new THREE.Vector2();
let inicio = null;
lienzo.addEventListener("pointerdown", (e) => { inicio = [e.clientX, e.clientY]; });
lienzo.addEventListener("pointerup", (e) => {
  if (!inicio || Math.hypot(e.clientX - inicio[0], e.clientY - inicio[1]) > 6) return;
  const r = lienzo.getBoundingClientRect();
  puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rayo.setFromCamera(puntero, camara);
  if (!PORTADA && grupoCongos && rayo.intersectObject(grupoCongos, true).length) { tocarCongos(); return; }
  const golpe = rayo.intersectObjects(edificios, true)[0];
  if (PORTADA) { location.href = raiz.dataset.raiz + "recorrido.html" + (golpe ? `#lugar-${golpe.object.userData.edificio.userData.id}` : ""); return; }
  if (golpe) elegir(golpe.object.userData.edificio.userData.id, false);
});

// Movimiento leve de los congos: solo si la copa está a la vista y a menos de ~260 m (de lejos no se nota y se
// ahorra batería), y nunca con «reducir movimiento»
const vista = new THREE.Frustum(), mvp = new THREE.Matrix4(), esferaCongos = new THREE.Sphere(new THREE.Vector3(), 14);
function animarCongos(ahora) {
  if (!congosVivos.length || sinMovimiento || document.hidden || (PORTADA && !enPantalla)) return false;
  esferaCongos.center.copy(centroCongos);
  vista.setFromProjectionMatrix(mvp.multiplyMatrices(camara.projectionMatrix, camara.matrixWorldInverse));
  if (!vista.intersectsSphere(esferaCongos) || camara.position.distanceTo(centroCongos) > 260) return false;
  const s = ahora / 1000;
  for (const c of congosVivos) {
    c.cabeza.rotation.y = 0.45 * Math.sin(s * 0.5 + c.fase);
    c.cabeza.rotation.x = 0.12 * Math.sin(s * 0.37 + c.fase * 2);
    c.cola.rotation.x = 0.15 * Math.sin(s * 0.8 + c.fase);
    c.cola.rotation.z = 0.12 * Math.sin(s * 0.55 + c.fase);
    c.cuerpo.scale.y = 1 + 0.015 * Math.sin(s * 2.2 + c.fase);   // respiración
    if (c.camina) {   // camina despacio un par de metros de ida y vuelta, mirando hacia donde va
      const k = Math.sin(s * 0.22 + c.fase), dir = Math.cos(s * 0.22 + c.fase) >= 0 ? 0 : Math.PI;
      c.m.position.set(c.base.x + Math.sin(c.giro) * k * 1.4, c.base.y + Math.abs(Math.sin(s * 3)) * 0.04, c.base.z + Math.cos(c.giro) * k * 1.4);
      c.m.rotation.y = c.giro + dir;
    }
  }
  return true;
}

// ---------- congos: un toque suena el aullido (solo la parte de los congos); dos toques seguidos abren los videos
let aullido = null, ultimoToqueCongos = 0;
const visorVideo = document.querySelector(".visor-video");
function tocarCongos() {
  const ahora = performance.now();
  if (ahora - ultimoToqueCongos < CONGOS.dobleToqueMs) {   // segundo toque: videos
    ultimoToqueCongos = 0;
    aullido?.pause();
    abrirVideos();
    return;
  }
  ultimoToqueCongos = ahora;
  aullido ??= new Audio(raiz.dataset.raiz + CONGOS.audio);
  aullido.currentTime = 0;
  aullido.play().catch(() => {});
}
function abrirVideos() {
  if (!visorVideo) return;
  const lista = visorVideo.querySelector(".visor-video__lista");
  lista.replaceChildren(...CONGOS.videos.map((v) => {
    const fig = document.createElement("figure"), vid = document.createElement("video");
    Object.assign(vid, { src: raiz.dataset.raiz + v.src, poster: raiz.dataset.raiz + v.poster, controls: true, playsInline: true, preload: "metadata" });
    vid.setAttribute("aria-label", v.titulo);
    fig.append(vid);
    return fig;
  }));
  visorVideo.showModal();
  lista.querySelector("video")?.play().catch(() => {});
}
visorVideo?.querySelector(".visor-video__cerrar").addEventListener("click", () => visorVideo.close());
visorVideo?.addEventListener("click", (e) => { if (e.target === visorVideo) visorVideo.close(); });
visorVideo?.addEventListener("close", () => visorVideo.querySelectorAll("video").forEach((v) => v.pause()));

// ---------- animación de cámara
let viaje = null;
function viajar(objetivo, posicion) {
  if (sinMovimiento) { controles.target.copy(objetivo); camara.position.copy(posicion); controles.update(); pedirDibujo(); return; }
  viaje = { t0: performance.now(), de: [controles.target.clone(), camara.position.clone()], a: [objetivo.clone(), posicion.clone()] };
  pedirDibujo();
}

// ---------- dibujo a pedido
let pendiente = false;
function pedirDibujo() { if (!pendiente) { pendiente = true; requestAnimationFrame(dibujar); } }
function ajustar() {
  const w = lienzo.clientWidth, h = lienzo.clientHeight;
  if (lienzo.width !== Math.round(w * renderer.getPixelRatio()) || lienzo.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    // en la portada de PC el campus se corre a la derecha, para dejar libre el texto de la izquierda
    // portada en PC: el campus se corre a la derecha, porque a la izquierda va el texto
    if (PORTADA && w > 760) camara.setViewOffset(w, h, -Math.round(w * 0.2), 0, w, h); else camara.clearViewOffset();
    camara.updateProjectionMatrix();
  }
}
// en la portada solo se dibuja mientras se ve: al bajar por la página o cambiar de pestaña no gasta batería
let enPantalla = true;
if (PORTADA) {
  new IntersectionObserver(([e]) => { enPantalla = e.isIntersecting; if (enPantalla) { ultimoCuadro = 0; pedirDibujo(); } }).observe(lienzo);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { ultimoCuadro = 0; pedirDibujo(); } });
}
// La portada gira despacio: 24 cuadros por segundo se ven fluidos y son menos de la mitad del trabajo que 60.
// El giro se mide en segundos reales, así dura dos minutos aunque la pantalla vaya a 30, 60 o 120 cuadros.
const INTERVALO_PORTADA = 1000 / 24;
let ultimoCuadro = 0, rendido = false;
const muestras = [];
// si la portada va muy lenta (menos de 10 cuadros por segundo), suelta el 3D y deja las vistas de respaldo
function rendirse(motivo) {
  if (rendido) return;
  rendido = true;
  console.info(`Maqueta 3D de la portada: se pasa a las vistas de respaldo (${motivo})`);
  raiz.classList.add("mapa3d--sin-3d");
  raiz.closest(".portada__foto")?.classList.remove("portada__foto--en-vivo");   // la imagen fija vuelve de inmediato
  renderer.dispose(); renderer.forceContextLoss();
  import("./portada-giro.js");
}
function dibujar(ahora) {
  pendiente = false;
  if (rendido) return;
  let paso = null;
  if (PORTADA) {
    if (ultimoCuadro && ahora - ultimoCuadro < INTERVALO_PORTADA - 4) { pedirDibujo(); return; }
    if (ultimoCuadro) {
      paso = Math.min((ahora - ultimoCuadro) / 1000, 0.5);
      // se mide la fluidez en los primeros cuadros con la portada a la vista (sin contar los 8 primeros, que compilan)
      if (exigente && muestras.length < 48 && enPantalla && !document.hidden) {
        muestras.push(ahora - ultimoCuadro);
        if (muestras.length === 48) {
          // promedio y no mediana: un teléfono a tirones (la mayoría rápidos y algunos muy lentos) también se ve mal
          const medio = muestras.slice(8).reduce((s, x) => s + x, 0) / 40;
          if (medio > 100) { rendirse(`${Math.round(1000 / medio)} cuadros por segundo`); return; }
        }
      }
    }
    ultimoCuadro = ahora;
  }
  ajustar();
  let seguir = false;
  if (viaje) {
    const k = Math.min((ahora - viaje.t0) / 900, 1), s = k * k * (3 - 2 * k);
    controles.target.lerpVectors(viaje.de[0], viaje.a[0], s);
    camara.position.lerpVectors(viaje.de[1], viaje.a[1], s);
    if (k >= 1) viaje = null; else seguir = true;
  }
  if (!PORTADA) controles.autoRotate = visitaGira && !viaje;
  if (controles.update(paso)) seguir = true;   // con amortiguación, sigue hasta detenerse
  const d = camara.position.distanceTo(controles.target);
  escena.fog.near = d * 1.2; escena.fog.far = d * 3;
  renderer.render(escena, camara);
  moverMarcas();   // en el mismo fotograma que el dibujo: los números no se atrasan respecto a la escena
  if (seguir) camaraEnMovimiento(); else camaraQuieta();
  brujula.style.transform = `rotate(${THREE.MathUtils.radToDeg(controles.getAzimuthalAngle())}deg)`;
  const congosEnMovimiento = animarCongos(ahora);
  if (seguir && (!PORTADA || (enPantalla && !document.hidden))) pedirDibujo();
  else if (congosEnMovimiento) setTimeout(pedirDibujo, 40);   // los congos se mueven a ~25 cuadros por segundo
}
new ResizeObserver(pedirDibujo).observe(lienzo);
if (PORTADA && raiz.closest(".portada__foto")?.dataset.giro) rendirse("llegó tarde");
if (!rendido) {
  raiz.classList.add("mapa3d--listo");
  // en la portada, con la maqueta ya en pantalla se apaga la imagen fija de abajo (si no, se ve por el cielo)
  raiz.closest(".portada__foto")?.classList.add("portada__foto--en-vivo");
  pedirDibujo();
}

// Para herramientas/giro.py: con #captura-giro la página expone la cámara para dibujar las vistas de la maqueta giratoria
// desde la portada: #lugar-N abre el recorrido con ese lugar elegido
const pedido = !PORTADA && location.hash.match(/^#lugar-(\d+)$/);
if (pedido) elegir(Number(pedido[1]), true);
if (location.hash === "#captura-giro" || location.hash === "#captura-portada") {
  window.__giro = { camara, controles, renderer, escena, edificios, dibujarYa() { ajustar(); controles.update(); renderer.render(escena, camara); } };
}
}
