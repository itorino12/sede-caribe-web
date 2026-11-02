// Maqueta 3D del campus (three.js). Los datos salen del croquis oficial y de la pestaña «lugares».
// Se dibuja solo cuando algo cambia (girar, acercar, elegir un edificio), para no gastar batería.
import * as THREE from "./vendor/three.module.min.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { ficha, sinMovimiento, rellenarFicha } from "./recorrido-ficha.js";

const raiz = document.querySelector("[data-recorrido]");
const lienzo = raiz.querySelector(".mapa3d__lienzo");
const capaMarcas = raiz.querySelector(".mapa3d__marcas");
const datos = JSON.parse(document.getElementById("datos-campus").textContent);
const lugares = new Map(datos.lugares.map((l) => [l.id, l]));

// ---------- escena
// Se intenta con calidad alta y, si el teléfono no lo permite, con opciones más livianas.
// Si no hay 3D, queda la imagen fija de la maqueta y la lista de lugares.
// En teléfonos la maqueta va en modo liviano: sin suavizado de bordes, menos resolución y sombras más
// simples. Algunos chips (por ejemplo PowerVR) pierden el contexto gráfico con la versión completa.
const liviano = matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 820;
function crearRenderer() {
  for (const opciones of [...(liviano ? [] : [{ antialias: true, alpha: true }]), { antialias: false, alpha: true, powerPreference: "low-power" }, { antialias: false, alpha: false, powerPreference: "low-power", precision: "mediump" }]) {
    try { return new THREE.WebGLRenderer({ canvas: lienzo, ...opciones }); }
    catch (e) { console.warn("Maqueta 3D: no se pudo iniciar con", opciones, e); }
  }
  return null;
}
const renderer = crearRenderer();
if (!renderer) {
  raiz.classList.add("mapa3d--sin-3d");
  import("./recorrido-giro.js");   // maqueta giratoria con imágenes (pesa poco y funciona en cualquier teléfono)
}
if (renderer) {   // ---------- todo lo que sigue es la maqueta 3D
lienzo.addEventListener("webglcontextlost", (e) => { e.preventDefault(); raiz.classList.add("mapa3d--sin-3d"); import("./recorrido-giro.js"); });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, liviano ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
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

// Terreno con la textura generada del croquis (zacate, calles, carretera y pista)
const t = datos.campus.terreno;
const textura = new THREE.TextureLoader().load(raiz.dataset.suelo, pedirDibujo);
textura.colorSpace = THREE.SRGBColorSpace;
textura.anisotropy = 4;
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(t.ancho, t.largo), new THREE.MeshLambertMaterial({ map: textura }));
suelo.rotation.x = -Math.PI / 2;
suelo.position.set(t.x + t.ancho / 2, 0, t.z + t.largo / 2);
suelo.receiveShadow = true;
escena.add(suelo);
// borde de la maqueta: una base gruesa, como una maqueta de verdad
const base = new THREE.Mesh(new THREE.BoxGeometry(t.ancho, 6, t.largo), new THREE.MeshLambertMaterial({ color: 0x7c6a52 }));
base.position.set(suelo.position.x, -3.05, suelo.position.z);
escena.add(base);

// ---------- edificios
// Estilo tomado de las fotos de la Sede: paredes blancas, celosías grises en las ventanas y techos de cuatro
// aguas gris verdoso con aleros anchos (las residencias llevan además una linternilla con su propio techo).
const colores = { pared: 0xfbfaf6, techo: 0x66756b, losa: 0xe3e6ea, celosia: 0x7d858c, elegido: 0x005da4, paredElegida: 0xeaf2f9 };
// La maqueta exagera un poco las alturas para que los edificios se lean desde arriba
const EXAGERAR = 1.4;
const edificios = [];
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
// Galería: columnas de acero, balcón corrido con baranda y escalera exterior (edificio 12)
function galeria(grupo, vol, alto, pisos) {
  const f = fachadaSur(vol.contorno), fondo = 2.6, dx = (f.b[0] - f.a[0]) / f.largo, dz = (f.b[1] - f.a[1]) / f.largo;
  const angulo = Math.atan2(-dz, dx);
  const n = Math.max(2, Math.round(f.largo / 5));
  for (let i = 0; i <= n; i++) {
    const t = i / n, col = new THREE.Mesh(new THREE.BoxGeometry(0.35, alto + 0.6, 0.35), acero);
    col.position.set(f.a[0] + dx * f.largo * t + f.nx * fondo, (alto + 0.6) / 2, f.a[1] + dz * f.largo * t + f.nz * fondo);
    col.castShadow = true; grupo.add(col);
  }
  for (let p = 1; p < pisos; p++) {
    const y = (alto / pisos) * p;
    const balcon = new THREE.Mesh(new THREE.BoxGeometry(f.largo, 0.3, fondo + 0.3), losa);
    balcon.position.set((f.a[0] + f.b[0]) / 2 + f.nx * fondo / 2, y, (f.a[1] + f.b[1]) / 2 + f.nz * fondo / 2);
    balcon.rotation.y = angulo; balcon.castShadow = true; grupo.add(balcon);
    const baranda = new THREE.Mesh(new THREE.BoxGeometry(f.largo, 0.12, 0.12), acero);
    baranda.position.set((f.a[0] + f.b[0]) / 2 + f.nx * (fondo + 0.1), y + 1.1, (f.a[1] + f.b[1]) / 2 + f.nz * (fondo + 0.1));
    baranda.rotation.y = angulo; grupo.add(baranda);
  }
  // escalera exterior en diagonal, a un tercio de la fachada
  const largoEsc = Math.hypot(alto / pisos, 6);
  const esc = new THREE.Mesh(new THREE.BoxGeometry(largoEsc, 0.25, 1.4), acero);
  esc.position.set(f.a[0] + dx * f.largo * 0.62 + f.nx * (fondo + 1.1), alto / pisos / 2, f.a[1] + dz * f.largo * 0.62 + f.nz * (fondo + 1.1));
  esc.rotation.set(0, angulo, Math.atan2(alto / pisos, 6));
  esc.castShadow = true; grupo.add(esc);
}
// Entrada principal (fotos): rótulo de concreto con el nombre, cuatro astas con banderas y el pórtico
// inclinado sobre el carril, con columnas en V. El rótulo mira a la ruta 32 (al norte).
function texturaRotulo() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 470;
  const x = c.getContext("2d");
  x.fillStyle = "#a3a8ad"; x.fillRect(0, 0, 1024, 470);
  x.strokeStyle = "#c9cdd1"; x.lineWidth = 14; x.strokeRect(36, 36, 952, 398);
  x.fillStyle = "#eef0f2"; x.textAlign = "center";
  x.font = "600 64px 'Source Sans 3', Arial, sans-serif"; x.fillText("UNIVERSIDAD DE COSTA RICA", 512, 190);
  x.font = "600 92px 'Source Sans 3', Arial, sans-serif"; x.fillText("Sede del Caribe", 512, 320);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function bandera(franjas, verticales = false) {
  const c = document.createElement("canvas"); c.width = 96; c.height = 64;
  const x = c.getContext("2d"), total = franjas.reduce((s, f) => s + f[1], 0);
  let pos = 0;
  for (const [color, peso] of franjas) {
    x.fillStyle = color;
    const tam = (peso / total) * (verticales ? 96 : 64);
    verticales ? x.fillRect(pos, 0, tam + 1, 64) : x.fillRect(0, pos, 96, tam + 1);
    pos += tam;
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
}
function entrada(grupo, e) {
  const k = e.volumenes[0].contorno, largo = Math.hypot(k[1][0] - k[0][0], k[1][1] - k[0][1]);
  let dx = (k[1][0] - k[0][0]) / largo, dz = (k[1][1] - k[0][1]) / largo;
  if (dx < 0) { dx = -dx; dz = -dz; }                      // d apunta al este
  let nx = dz, nz = -dx;                                    // n apunta al norte (hacia la carretera)
  if (nz > 0) { nx = -nx; nz = -nz; }
  const [cx, cz] = e.centro, giro = Math.atan2(nx, nz);
  const en = (a, b, y = 0) => new THREE.Vector3(cx + dx * a + nx * b, y, cz + dz * a + nz * b);
  // rótulo de concreto, con el nombre en la cara que mira a la carretera
  const gris = new THREE.MeshStandardMaterial({ color: 0xa3a8ad, roughness: 0.9 });
  const cara = new THREE.MeshStandardMaterial({ map: texturaRotulo(), roughness: 0.9 });
  const rotulo = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.3, 0.7), [gris, gris, gris, gris, cara, gris]);
  rotulo.position.copy(en(3.5, 8, 2.05)); rotulo.rotation.y = giro; rotulo.castShadow = true; grupo.add(rotulo);
  const base = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.4, 1.1), gris);
  base.position.copy(en(3.5, 8, 0.2)); base.rotation.y = giro; grupo.add(base);
  // cuatro astas detrás del rótulo; la cuarta, sin bandera, como en la foto
  const asta = new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 0.6, roughness: 0.3 });
  const telas = [
    bandera([["#002b7f", 1], ["#ffffff", 1], ["#ce1126", 2], ["#ffffff", 1], ["#002b7f", 1]]),
    bandera([["#cfe8f7", 1], ["#ffffff", 1], ["#cfe8f7", 1]]),
    bandera([["#2e8b3e", 1], ["#ffffff", 1], ["#1f6fb5", 1]]),
  ];
  for (let i = 0; i < 4; i++) {
    const p = en(1.6 + i * 1.5, 5.6);
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 10, 6), asta);
    palo.position.set(p.x, 5, p.z); palo.castShadow = true; grupo.add(palo);
    if (!telas[i]) continue;
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.4), telas[i]);
    tela.position.set(p.x + dx * 1.1, 9.1, p.z + dz * 1.1); tela.rotation.y = Math.atan2(-dz, dx); tela.castShadow = true; grupo.add(tela);
  }
  // pórtico inclinado sobre el carril de entrada, en el extremo este, con columnas en V
  const blanco = new THREE.MeshStandardMaterial({ color: 0xf4f5f6, roughness: 0.6 });
  const ala = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 9), blanco);
  ala.position.copy(en(largo / 2 + 4.5, 0.5, 4.9)); ala.rotation.set(0, Math.atan2(-dz, dx), 0); ala.rotateX(-0.09); ala.castShadow = true; grupo.add(ala);
  const acero = new THREE.MeshStandardMaterial({ color: 0xb9bec3, metalness: 0.5, roughness: 0.4 });
  for (const [a, b, inclina] of [[largo / 2 + 1.5, 3, 0.18], [largo / 2 + 1.5, 3, -0.18], [largo / 2 + 7.5, -2, 0.18], [largo / 2 + 7.5, -2, -0.18]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), acero);
    col.position.copy(en(a, b, 2.5)); col.rotation.set(0, Math.atan2(-dz, dx), inclina); col.castShadow = true; grupo.add(col);
  }
}

// Parasoles curvos de lámina blanca frente a la fachada (edificio 13): paneles altos que se arquean hacia afuera
function parasoles(grupo, vol, alto) {
  const f = fachadaSur(vol.contorno), dx = (f.b[0] - f.a[0]) / f.largo, dz = (f.b[1] - f.a[1]) / f.largo;
  const cuantos = 3, ancho = (f.largo / cuantos) * 0.82, altoP = alto * 0.9;
  for (let i = 0; i < cuantos; i++) {
    const g = new THREE.PlaneGeometry(ancho, altoP, 1, 10);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / altoP + 0.5; p.setZ(k, Math.sin(Math.PI * t) * 1.3); }
    g.computeVertexNormals();
    const panel = new THREE.Mesh(g, parasol);
    const t = (i + 0.5) / cuantos;
    panel.position.set(f.a[0] + dx * f.largo * t + f.nx * 1.0, alto * 0.52, f.a[1] + dz * f.largo * t + f.nz * 1.0);
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
    // vestidores y toldo en arco: detrás de la piscina, del lado de la quebrada (sur)
    const sur = ladoHacia(1);
    const blancoV = new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.85 });
    const grisV = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.85 });
    const laminaV = new THREE.MeshStandardMaterial({ color: 0xd6dade, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    for (const [t, largo] of [[-6, 7], [3.5, 10]]) {
      const caseta = new THREE.Group();
      const zocalo = new THREE.Mesh(new THREE.BoxGeometry(largo, 1.8, 4), grisV); zocalo.position.y = 0.9; caseta.add(zocalo);
      const muro = new THREE.Mesh(new THREE.BoxGeometry(largo, 1.4, 4), blancoV); muro.position.y = 2.5; caseta.add(muro);
      const techo = new THREE.Mesh(new THREE.BoxGeometry(largo + 1.2, 0.12, 5.6), laminaV); techo.position.set(0, 3.45, 0.3); techo.rotation.x = -0.16; caseta.add(techo);
      caseta.position.set(...sur.en(t, 12, 0)); caseta.rotation.y = sur.ang; grupo.add(caseta);
    }
    const toldo = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6, 14, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8c8f88, roughness: 0.7, side: THREE.DoubleSide }));
    toldo.rotation.set(0, sur.ang, Math.PI / 2); toldo.position.set(...sur.en(-13, 11, 2.2)); grupo.add(toldo);
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
    // parqueo de bicicletas y motos: adoquín rojizo pegado a la calle, en la cara que mira a la biblioteca (norte)
    const norte = ladoHacia(-1);
    const adoquin = new THREE.Mesh(new THREE.BoxGeometry(16, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0x8e5a4c, roughness: 0.95 }));
    adoquin.position.set(...norte.en(0, 12.5, 0.05)); adoquin.rotation.y = norte.ang; grupo.add(adoquin);
    const inox = new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 0.7, roughness: 0.25 });
    for (let k = 0; k < 4; k++) {
      const u = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 12, Math.PI), inox);
      u.position.set(...norte.en(-6.5 + k * 1.6, 11.5, 0.45)); u.rotation.y = norte.ang + Math.PI / 2; grupo.add(u);
    }
    const tonos = [0x1f4fa8, 0x2a2d31, 0x5b2a6e, 0xb3262e, 0xe8e8e8];
    for (let k = 0; k < 5; k++) {
      const moto = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: tonos[k], roughness: 0.4, metalness: 0.3 });
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 1.9), m); cuerpo.position.y = 0.6; moto.add(cuerpo);
      for (const z of [-0.75, 0.75]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.15, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1a })); r.rotation.z = Math.PI / 2; r.position.set(0, 0.32, z); moto.add(r); }
      moto.position.set(...norte.en(1 + k * 1.4, 12.8, 0)); moto.rotation.y = norte.ang + Math.PI / 2; grupo.add(moto);
    }
    grupo.traverse((o) => { if (o.isMesh && o.material !== mallaV) { o.castShadow = !liviano; o.receiveShadow = true; } });
  } else {
    const pisos = Math.max(e.pisos, 1), altoPiso = e.alto / pisos;
    for (const vol of e.volumenes) {
      grupo.add(prisma(vol.contorno, vol.alto, vol.desde, mat.pared));
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
      if (estilo.porton) {   // portón de lámina oscura en la fachada que mira a la calle
        const f = fachadaSur(vol.contorno), ang = Math.atan2(-(f.b[1] - f.a[1]), f.b[0] - f.a[0]);
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
        const t = 0.12;   // cerca de la esquina, como en la foto
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
      if (e.id !== 6 && estilo.ventanas !== "ninguna") for (let p = 0; p < pisos; p++) grupo.add(prisma(vol.contorno, altoPiso * (ventanal ? 0.4 : 0.3), altoPiso * p + altoPiso * (ventanal ? 0.4 : 0.36), ventanal ? cristal : celosia, 0.05));
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
    if (estilo.base) {   // el edificio queda más alto que el terreno vecino, sobre una base de concreto
      grupo.children.forEach((h) => { h.position.y += estilo.base; });
      for (const vol of e.volumenes) grupo.add(prisma(vol.contorno, estilo.base, 0, new THREE.MeshStandardMaterial({ color: 0xb9b8b1, roughness: 0.95 }), 1.3));
    }
    if (estilo.forma_techo === "plano") for (const vol of e.volumenes) {   // losa plana volada
      const l = prisma(vol.contorno, 0.6, e.alto, mat.techo, 3.2);
      grupo.add(l);
    }
    if (estilo.galeria) e.volumenes.forEach((vol) => galeria(grupo, vol, e.alto, Math.max(e.pisos, 1)));
    if (estilo.parasoles) e.volumenes.forEach((vol) => parasoles(grupo, vol, e.alto));
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
      const dx = (f.b[0] - f.a[0]) / f.largo, dz = (f.b[1] - f.a[1]) / f.largo;
      const ang = Math.atan2(-dz, dx), largoEsc = Math.hypot(t, 5);
      const escalera = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, largoEsc), new THREE.MeshStandardMaterial({ color: 0xbdbdb8 }));
      const mx = (f.a[0] + f.b[0]) / 2 + f.nx * 6.5, mz = (f.a[1] + f.b[1]) / 2 + f.nz * 6.5;
      escalera.position.set(mx, t / 2, mz); escalera.rotation.set(0, ang + Math.PI / 2, 0); escalera.rotateX(-Math.atan2(t, 5)); grupo.add(escalera);
    }
    if (estilo.cupula) {   // torrecita de ventilación sobre la cumbrera
      const torre = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), celeste);
      torre.position.set(e.centro[0], e.cumbre + 0.5, e.centro[1]);
      const tapa = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0x4d5a63 }));
      tapa.rotation.y = Math.PI / 4;
      tapa.position.set(e.centro[0], e.cumbre + 1.9, e.centro[1]);
      torre.castShadow = tapa.castShadow = true;
      grupo.add(torre, tapa);
    }
  }
  grupo.scale.y = EXAGERAR;
  grupo.userData = { id: e.id, centro: new THREE.Vector3(e.centro[0], e.cumbre * EXAGERAR, e.centro[1]), mat, alto: e.alto };
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
if (datos.campus.porton_pista && lugares.get(19)) {
  const blancoTubo = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const [pcx, pcz] = datos.campus.pista.centro, eje = -0.46;
  for (const lado of [-1, 1]) {   // marcos de fútbol en los extremos de la cancha
    const gx = pcx + Math.cos(eje) * 42 * lado, gz = pcz - Math.sin(eje) * 42 * lado;
    const marco = new THREE.Group();
    for (const dz of [-3.6, 3.6]) { const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.44, 6), blancoTubo); palo.position.set(0, 1.22, dz); marco.add(palo); }
    const travesano = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 7.4), blancoTubo); travesano.position.y = 2.44; marco.add(travesano);
    marco.position.set(gx, 0, gz); marco.rotation.y = eje; marco.castShadow = true;
    escena.add(marco);
  }
  // portón de dos hojas de tubo galvanizado, poste azul con panel solar y lámpara solar
  const { p, hacia_pista } = datos.campus.porton_pista;
  const grupo = new THREE.Group();
  const acero = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.5, roughness: 0.4 });
  const azul = new THREE.MeshStandardMaterial({ color: 0x1e88d8, roughness: 0.6 });
  for (const lado of [-1, 1]) {
    const hoja = new THREE.Group();
    for (let k = 0; k <= 10; k++) { const barra = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.06), acero); barra.position.set(lado * (0.25 + k * 0.33), 1.25, 0); hoja.add(barra); }
    for (const y of [0.2, 1.3, 2.35]) { const larguero = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 0.08), acero); larguero.position.set(lado * 1.9, y, 0); hoja.add(larguero); }
    grupo.add(hoja);
  }
  for (const x of [-3.8, 3.8]) { const pilar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.9, 0.2), acero); pilar.position.set(x, 1.45, 0); grupo.add(pilar); }
  const postePanel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.2, 6), azul); postePanel.position.set(6, 2.1, 1.5); grupo.add(postePanel);
  const caja = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.35), azul); caja.position.set(6, 3.2, 1.3); grupo.add(caja);
  const panelSolar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.1), new THREE.MeshStandardMaterial({ color: 0x2b3a4a, metalness: 0.4, roughness: 0.3 }));
  panelSolar.position.set(6, 4.3, 1.5); panelSolar.rotation.x = -0.25; grupo.add(panelSolar);
  const lampara = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7.5, 6), new THREE.MeshStandardMaterial({ color: 0x2f3337 })); lampara.position.set(9, 3.75, 2); grupo.add(lampara);
  const panelLamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.7), panelSolar.material); panelLamp.position.set(9, 7.6, 2); panelLamp.rotation.x = -0.3; grupo.add(panelLamp);
  grupo.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  grupo.position.set(p[0], 0, p[1]);
  grupo.rotation.y = hacia_pista;   // las hojas quedan atravesadas en el camino; +z local apunta a la pista
  grupo.userData = { id: 19, centro: new THREE.Vector3(p[0], 5, p[1]), mat: { pared: acero, techo: azul }, alto: 3 };
  grupo.traverse((o) => { o.userData.edificio = grupo; });
  escena.add(grupo);
  edificios.push(grupo);
}

// ---------- entrada por residencias (fotos): portón verde de dos hojas, marco de tubo con malla y
// refuerzos en X, columnas con baliza amarilla y faroles verdes de dos brazos a los lados de la calle
function portonVerde(conFaroles) {
  const grupo = new THREE.Group();
  const verde = new THREE.MeshStandardMaterial({ color: 0x1f5a3c, roughness: 0.6, metalness: 0.2 });
  const mallaPorton = new THREE.MeshLambertMaterial({ color: 0x24533a, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xf2b705, emissive: 0x3a2a00 });
  const ANCHO = 4.2, ALTO = 2.2;
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
if (datos.campus.porton_residencias && lugares.get(20)) {
  const { p, hacia_dentro } = datos.campus.porton_residencias;
  const grupo = portonVerde(true), verde = grupo.userData.verde;
  grupo.position.set(p[0], 0, p[1]);
  grupo.rotation.y = hacia_dentro;
  grupo.userData = { id: 20, centro: new THREE.Vector3(p[0], 5, p[1]), mat: { pared: verde, techo: verde }, alto: 3 };
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
  if (lugares.get(21)) {
    zona.userData = { id: 21, centro: new THREE.Vector3(cx, 4, cz), mat: { pared: celesteMesa, techo: celesteMesa }, alto: 1 };
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
  const concreto = new THREE.MeshStandardMaterial({ color: 0xc9c7c0, roughness: 0.9 });
  const asfalto = new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 0.95 });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5, metalness: 0.2 });
  const gris = new THREE.MeshStandardMaterial({ color: 0xb8bdc2, roughness: 0.4, metalness: 0.5 });
  const blanco = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const CALZADA = 5.8, ACERA = 1.8;
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
    caja(CALZADA + ACERA + 0.6, 0.9, L, concreto, -ACERA / 2, -0.4, ang, cx, cz);   // tablero
    caja(ACERA, 0.2, L, concreto, -(CALZADA + ACERA) / 2, 0.15, ang, cx, cz);        // acera
    for (const x of [CALZADA / 2 + 0.1, -CALZADA / 2 - 0.1]) {                 // defensas amarillas
      caja(0.12, 0.35, L, amarillo, x, 0.65, ang, cx, cz);
      caja(0.15, 0.75, 0.15, amarillo, x, 0.42, ang, ax, az);
    }
    const xb = -CALZADA / 2 - ACERA - 0.1;                                      // baranda de la acera
    caja(0.07, 0.07, L, amarillo, xb, 0.75, ang, cx, cz);
    caja(0.07, 0.07, L, gris, xb, 1.2, ang, cx, cz);
    caja(0.06, 1.5, 0.06, gris, xb, 0.55, ang, ax, az);
  }
  // paso de cebra al norte del puente
  const [nx, nz] = eje[1], [mx, mz] = eje[0], angN = Math.atan2(nx - mx, nz - mz);
  for (let k = 0; k < 6; k++) caja(0.5, 0.04, 2.6, blanco, -CALZADA / 2 + 0.6 + k * 0.9, 0.1, angN, (nx + mx) / 2, (nz + mz) / 2);
  puente.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
  if (lugares.get(23)) {
    puente.userData = { id: 23, centro: new THREE.Vector3(px, 3, pz), mat: { pared: amarillo, techo: amarillo }, alto: 1 };
    puente.traverse((o) => { o.userData.edificio = puente; });
    edificios.push(puente);
  }
  escena.add(puente);
}

// ---------- planta de tratamiento de aguas (fotos): dos tanques grises, estructura azul con plataforma
// y techo, casetas blancas con techo verde y borde azul, y malla ciclón alrededor
if (datos.campus.planta && lugares.get(22)) {
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
  g.userData = { id: 22, centro: new THREE.Vector3(cx, 8, cz), mat: { pared: blancoP, techo: techoVerde }, alto: 5 };
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
      if (azar(k) < 0.45) continue;   // espacio libre
      const carro = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: colores[k % colores.length], roughness: 0.35, metalness: 0.4 });
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 4.3), mat); cuerpo.position.y = 0.55; carro.add(cuerpo);
      const cabina = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.3), new THREE.MeshStandardMaterial({ color: 0x27323c, roughness: 0.2, metalness: 0.5 })); cabina.position.set(0, 1.2, 0.2 * fila); carro.add(cabina);
      carro.position.set(x, 0, z); g.add(carro);
    }
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
  if (lugares.get(33)) {
    g.userData = { id: 33, centro: new THREE.Vector3(cx, 3, cz), mat: { pared: verdePoste, techo: amarilloTope }, alto: 1, menor: true };
    g.traverse((o) => { o.userData.edificio = g; });
    edificios.push(g);
  }
}

// ---------- lugares sin edificio que marcó la Sede (anotaciones sobre la maqueta): pasillos techados,
// casetas, parqueos, la alcantarilla de la quebrada, la explanada, el puente peatonal y el jardín
{
  const azar = (i) => { const v = Math.sin(i * 53.3) * 43758.5; return v - Math.floor(v); };
  const caja = new THREE.BoxGeometry(1, 1, 1);
  // muchas cajas iguales en una sola llamada de dibujo
  function cajas(mat, lista) {
    const m = new THREE.InstancedMesh(caja, mat, lista.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eje = new THREE.Vector3(0, 1, 0);
    lista.forEach(([x, y, z, sx, sy, sz, ry], i) => { q.setFromAxisAngle(eje, ry || 0); m.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz))); });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = !liviano; m.receiveShadow = true;
    return m;
  }
  function registrar(g, id, centro, mat, alto = 1) {
    g.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.castShadow = !liviano && !o.material.transparent; o.receiveShadow = true; } });
    escena.add(g);
    if (id && lugares.get(id)) {
      g.userData = { id, centro, mat, alto, menor: true };
      g.traverse((o) => { o.userData.edificio = g; });
      edificios.push(g);
    }
  }
  const concretoClaro = new THREE.MeshStandardMaterial({ color: 0xc8c6bf, roughness: 0.95 });
  const sinUso = () => new THREE.MeshStandardMaterial();   // para resaltar sin cambiar el color de nada

  // pasillo techado: losa de concreto, columnas metálicas y techo de lámina, por tramos a lo largo del trazo
  function pasillo({ id, puntos, ancho }) {
    const g = new THREE.Group();
    const lamina = new THREE.MeshStandardMaterial({ color: 0x8f9c98, roughness: 0.55, metalness: 0.3 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x3e4a52, roughness: 0.6, metalness: 0.4 });
    const pisos = [], techos = [], columnas = [];
    for (let i = 0; i < puntos.length - 1; i++) {
      const [ax, az] = puntos[i], [bx, bz] = puntos[i + 1];
      const L = Math.hypot(bx - ax, bz - az) + 0.15, ang = Math.atan2(bx - ax, bz - az);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      pisos.push([cx, 0.06, cz, ancho, 0.12, L, ang]);
      techos.push([cx, 2.75, cz, ancho + 0.9, 0.08, L + 0.1, ang]);
    }
    puntos.forEach(([x, z], i) => {
      const [ax, az] = puntos[Math.max(i - 1, 0)], [bx, bz] = puntos[Math.min(i + 1, puntos.length - 1)];
      const L = Math.hypot(bx - ax, bz - az) || 1, nx = (bz - az) / L, nz = -(bx - ax) / L;
      for (const lado of [-1, 1]) columnas.push([x + nx * lado * (ancho / 2), 1.37, z + nz * lado * (ancho / 2), 0.12, 2.74, 0.12, 0]);
    });
    g.add(cajas(concretoClaro, pisos), cajas(lamina, techos), cajas(metal, columnas));
    const [mx, mz] = puntos[Math.floor(puntos.length / 2)];
    registrar(g, id, new THREE.Vector3(mx, 3.5, mz), { pared: metal, techo: lamina });
  }

  // caseta pequeña: de guarda (ventanas corridas), de baños (bloques de ventilación) o de uso general
  function caseta({ id, p, giro, largo, ancho, alto, uso }) {
    const g = new THREE.Group();
    const pared = new THREE.MeshStandardMaterial({ color: 0xf6f5f0, roughness: 0.85 });
    const techoM = new THREE.MeshStandardMaterial({ color: uso === "guarda" ? 0x5d6b73 : 0x66756b, roughness: 0.7 });
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(largo, alto, ancho), pared); cuerpo.position.y = alto / 2; g.add(cuerpo);
    const zocalo = new THREE.Mesh(new THREE.BoxGeometry(largo + 0.06, 0.6, ancho + 0.06), new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.85 })); zocalo.position.y = 0.3; g.add(zocalo);
    if (uso === "guarda") {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(largo + 0.08, 1.0, ancho + 0.08), vidrio); vent.position.y = 1.65; g.add(vent);
    } else {
      const banda = new THREE.Mesh(new THREE.BoxGeometry(largo + 0.08, uso === "banos" ? 0.5 : 0.8, ancho + 0.08), uso === "banos" ? new THREE.MeshStandardMaterial({ color: 0x8d949a, roughness: 0.9 }) : celosia);
      banda.position.y = alto - 0.6; g.add(banda);
    }
    const puertas = uso === "banos" ? [-largo / 4, largo / 4] : [0];
    for (const x of puertas) { const pu = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.05, 0.06), new THREE.MeshStandardMaterial({ color: 0x6d7880, roughness: 0.6 })); pu.position.set(x, 1.03, ancho / 2 + 0.04); g.add(pu); }
    const losaT = new THREE.Mesh(new THREE.BoxGeometry(largo + 1.2, 0.16, ancho + 1.2), techoM); losaT.position.y = alto + 0.08; g.add(losaT);
    g.position.set(p[0], 0, p[1]); g.rotation.y = -giro;
    registrar(g, id, new THREE.Vector3(p[0], alto + 2, p[1]), { pared, techo: techoM }, alto);
  }

  // parqueo asfaltado (el asfalto y las rayas están en la textura): topes, algunos carros y alumbrado
  function parqueo({ id, centro: [cx, cz], largo, ancho, giro, filas }, k0) {
    const g = new THREE.Group();
    const tope = new THREE.MeshStandardMaterial({ color: 0xe6b800, roughness: 0.7 });
    const verdePoste = new THREE.MeshStandardMaterial({ color: 0x2f6b45, roughness: 0.6 });
    const tonos = [0xf0f0ee, 0x1f2a44, 0xb9bcbf, 0x2a2d31, 0x9b1b2a, 0xc7c9cc];
    let k = k0;
    for (const { z: zv, fondo, n } of filas) {
      const z = -zv, lado = Math.sign(z) || 1;   // la fila mide z hacia la izquierda del giro; en la maqueta es -z
      for (let i = 0; i < n; i++, k++) {
        const x = (-n / 2 + i + 0.5) * 2.6;
        const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.25), tope); t.position.set(x, 0.08, z + lado * (fondo / 2 - 0.6)); g.add(t);
        if (azar(k) < 0.4) continue;
        const carro = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: tonos[k % tonos.length], roughness: 0.35, metalness: 0.4 });
        const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 4.3), m); cuerpo.position.y = 0.55; carro.add(cuerpo);
        const cabina = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.3), vidrio); cabina.position.set(0, 1.2, 0.2 * lado); carro.add(cabina);
        carro.position.set(x, 0, z); g.add(carro);
      }
    }
    for (const x of [-largo / 2 + 0.8, largo / 2 - 0.8]) {
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8), verdePoste); poste.position.set(x, 3.75, -ancho / 2 + 0.6); g.add(poste);
      const lampara = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.9), new THREE.MeshBasicMaterial({ color: 0xfff3c4 })); lampara.position.set(x, 7.4, -ancho / 2 + 1.1); g.add(lampara);
    }
    g.position.set(cx, 0, cz); g.rotation.y = -giro;
    registrar(g, id, new THREE.Vector3(cx, 3, cz), { pared: verdePoste, techo: tope });
  }

  // escalera de concreto con pasamanos: sube a lo largo del giro
  function escalera({ p, giro, largo, ancho, alto }) {
    const g = new THREE.Group(), h = alto * EXAGERAR, n = Math.max(3, Math.round(h / 0.17));
    for (let i = 0; i < n; i++) {
      const paso = new THREE.Mesh(new THREE.BoxGeometry(largo / n + 0.02, (h * (i + 1)) / n, ancho), concretoClaro);
      paso.position.set(-largo / 2 + (largo / n) * (i + 0.5), (h * (i + 1)) / n / 2, 0); g.add(paso);
    }
    const tubo = new THREE.MeshStandardMaterial({ color: 0xd2a417, roughness: 0.5, metalness: 0.3 }), pend = Math.atan2(h, largo);
    for (const lado of [-1, 1]) {
      const pasamanos = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, Math.hypot(largo, h), 6), tubo);
      pasamanos.rotation.z = Math.PI / 2 - pend; pasamanos.position.set(0, h / 2 + 0.9, lado * (ancho / 2 - 0.1)); g.add(pasamanos);
      for (const t of [-0.45, 0, 0.45]) { const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), tubo); poste.position.set(t * largo, h * (0.5 + t) + 0.45, lado * (ancho / 2 - 0.1)); g.add(poste); }
    }
    g.position.set(p[0], 0, p[1]); g.rotation.y = -giro;
    registrar(g, null);
  }

  // mesas de picnic de concreto con bancas, como las del área frente al CIUB
  function mesas({ puntos }) {
    const g = new THREE.Group(), azulMesa = new THREE.MeshStandardMaterial({ color: 0x3d8fd6, roughness: 0.85 });
    puntos.forEach(([x, z], i) => {
      const m = new THREE.Group();
      const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.75, 8), azulMesa); pata.position.y = 0.37; m.add(pata);
      const tablero = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 14), azulMesa); tablero.position.y = 0.78; m.add(tablero);
      for (const lado of [-1, 1]) { const banca = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.38), azulMesa); banca.position.set(0, 0.23, lado * 1.15); m.add(banca); }
      m.position.set(x, 0, z); m.rotation.y = azar(i + 3) * 3; g.add(m);
    });
    registrar(g, null);
  }

  // explanada: zacate abierto (ya pintado en el suelo) con bancas de concreto en el borde
  function explanada({ id, contorno, centro }) {
    const g = new THREE.Group();
    const sh = new THREE.Shape(contorno.map(([x, z]) => new THREE.Vector2(x, -z)));
    const piso = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshLambertMaterial({ color: 0xa4ce7e, transparent: true, opacity: 0, depthWrite: false }));
    piso.rotation.x = -Math.PI / 2; piso.position.y = 0.05; g.add(piso);
    contorno.forEach(([x, z], i) => {
      if (i % 3) return;
      const dx = centro[0] - x, dz = centro[1] - z, d = Math.hypot(dx, dz) || 1;
      const banca = new THREE.Mesh(new THREE.BoxGeometry(2, 0.45, 0.5), concretoClaro);
      banca.position.set(x + (dx / d) * 2.5, 0.23, z + (dz / d) * 2.5); banca.rotation.y = Math.atan2(dx, dz); g.add(banca);
    });
    registrar(g, id, new THREE.Vector3(centro[0], 2, centro[1]), { pared: sinUso(), techo: sinUso() }, 0);
  }

  // alcantarilla donde la calle pasa sobre la quebrada: barandas de concreto a los dos lados y paso de cebra
  function alcantarilla({ id, p, giro, ancho }) {
    const g = new THREE.Group(), concreto = new THREE.MeshStandardMaterial({ color: 0xbfbdb5, roughness: 0.95 });
    const amarillo = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6 });
    for (const lado of [-1, 1]) {
      const muro = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 7), concreto); muro.position.set(lado * (ancho / 2 + 0.6), 0.35, 0); g.add(muro);
      const franja = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.18, 7), amarillo); franja.position.set(lado * (ancho / 2 + 0.6), 0.62, 0); g.add(franja);
      for (const z of [-3.2, 3.2]) { const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.4), concreto); cab.position.set(lado * (ancho / 2 + 1.5), -0.1, z); g.add(cab); }
    }
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, ancho + 4, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a8a84, side: THREE.DoubleSide }));
    tubo.rotation.z = Math.PI / 2; tubo.position.y = -0.2; g.add(tubo);
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro;
    registrar(g, id, new THREE.Vector3(p[0], 3, p[1]), { pared: concreto, techo: amarillo });
  }

  // puente peatonal sobre la ruta 32: tablero techado de estructura metálica con malla y escaleras en los extremos
  function puentePeatonal({ id, p, giro }) {
    const g = new THREE.Group();
    const acero = new THREE.MeshStandardMaterial({ color: 0x4f6170, roughness: 0.5, metalness: 0.5 });
    const techoP = new THREE.MeshStandardMaterial({ color: 0xd3d7da, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    const malla = new THREE.MeshLambertMaterial({ color: 0x55636e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const H = 5.6, LUZ = 26, ANCHO = 2.4;   // la luz cruza la carretera (x local); la carretera corre por z local
    const tablero = new THREE.Mesh(new THREE.BoxGeometry(LUZ, 0.35, ANCHO), concretoClaro); tablero.position.y = H; g.add(tablero);
    for (const z of [-ANCHO / 2, ANCHO / 2]) {
      const viga = new THREE.Mesh(new THREE.BoxGeometry(LUZ, 0.25, 0.15), acero); viga.position.set(0, H + 1.15, z); g.add(viga);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(LUZ, 1.1), malla); m.position.set(0, H + 0.7, z); g.add(m);
    }
    const arco = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, LUZ, 12, 1, true, -Math.PI / 2.6, Math.PI / 1.3), techoP);
    arco.rotation.z = Math.PI / 2; arco.position.y = H + 1.6; g.add(arco);
    for (const lado of [-1, 1]) {
      const x0 = lado * LUZ / 2;
      for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {   // torre de la escalera
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.25, H + 3, 0.25), acero); col.position.set(x0 + dx + lado * 1.3, (H + 3) / 2, dz); g.add(col);
      }
      // dos tramos de escalera con un descanso, bajando a lo largo de la carretera (hacia -z)
      const L = 8, pend = Math.atan2(H / 2, L), xs = x0 + lado * 1.3;
      for (const [zc, yc] of [[-L / 2, (3 * H) / 4], [-L * 1.5 - 2, H / 4]]) {
        const esc = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, Math.hypot(L, H / 2)), concretoClaro);
        esc.position.set(xs, yc, zc); esc.rotation.x = -pend; g.add(esc);
      }
      const descanso = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 2), concretoClaro); descanso.position.set(xs, H / 2, -L - 1); g.add(descanso);
      for (const z of [-L - 1, -L * 2 - 2]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.2, H / 2, 0.2), acero); col.position.set(xs, H / 4, z); g.add(col); }
    }
    g.position.set(p[0], 0, p[1]); g.rotation.y = giro;
    registrar(g, id, new THREE.Vector3(p[0], H + 4, p[1]), { pared: acero, techo: techoP }, H);
  }

  // entrada al Jardín Etnobotánico: sendero de lastre (en el suelo), arco de madera con rótulo y siembras en abanico
  function jardin({ id, desde, hasta }) {
    const g = new THREE.Group(), madera = new THREE.MeshLambertMaterial({ color: 0x6b4f33 });
    const dx = hasta[0] - desde[0], dz = hasta[1] - desde[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, ang = Math.atan2(dx, dz);
    const arco = new THREE.Group();
    for (const x of [-2.1, 2.1]) { const poste = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), madera); poste.position.set(x, 1.5, 0); arco.add(poste); }
    const viga = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 0.35), madera); viga.position.y = 3.05; arco.add(viga);
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
    const x = cv.getContext("2d"); x.fillStyle = "#5a4027"; x.fillRect(0, 0, 512, 128); x.fillStyle = "#f4ead8"; x.textAlign = "center";
    x.font = "600 44px 'Source Sans 3', Arial, sans-serif"; x.fillText("JARDÍN ETNOBOTÁNICO", 256, 80);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    for (const lado of [1, -1]) { const r = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: tex })); r.position.set(0, 2.5, lado * 0.19); r.rotation.y = lado > 0 ? 0 : Math.PI; arco.add(r); }
    arco.position.set(hasta[0], 0, hasta[1]); arco.rotation.y = ang; g.add(arco);
    const tonos = [0x3f7d34, 0x5f9e43, 0x2f6b2c, 0xd2452c, 0xe39b2d, 0x4f8f3a];
    for (let i = 0; i < 26; i++) {   // matas en abanico más allá del arco
      const a = (azar(i) - 0.5) * 1.6, d = 3 + azar(i + 40) * 12, r = 0.6 + azar(i + 80) * 1.1;
      const px = hasta[0] + (ux * Math.cos(a) - uz * Math.sin(a)) * d, pz = hasta[1] + (uz * Math.cos(a) + ux * Math.sin(a)) * d;
      const mata = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshLambertMaterial({ color: tonos[i % tonos.length], flatShading: true }));
      mata.position.set(px, r * 0.8, pz); g.add(mata);
    }
    registrar(g, id, new THREE.Vector3(hasta[0], 4, hasta[1]), { pared: madera, techo: sinUso() }, 3);
  }

  let kParqueo = 100;
  for (const el of datos.campus.elementos || []) {
    if (el.tipo === "pasillo") pasillo(el);
    else if (el.tipo === "caseta") caseta(el);
    else if (el.tipo === "parqueo") { parqueo(el, kParqueo); kParqueo += 40; }
    else if (el.tipo === "escalera") escalera(el);
    else if (el.tipo === "mesas") mesas(el);
    else if (el.tipo === "explanada") explanada(el);
    else if (el.tipo === "alcantarilla") alcantarilla(el);
    else if (el.tipo === "puente_peatonal") puentePeatonal(el);
    else if (el.tipo === "jardin") jardin(el);
    else if (el.tipo === "porton") {   // acceso cerrado con portón (sin faroles)
      const g = portonVerde(false); g.position.set(el.p[0], 0, el.p[1]); g.rotation.y = el.giro; escena.add(g);
    }
  }
}

// ---------- árboles y palmeras (instancias: cientos de árboles en pocas llamadas de dibujo)
{
  const lista = datos.campus.arboles;
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
    copas.setColorAt(i, color.setHex(tonos[Math.floor(azar(i + 7) * tonos.length)]));
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
  vistaGeneral.posicion.copy(desde).multiplyScalar(lejos).add(vistaGeneral.objetivo);
}
calcularVistaGeneral();
camara.position.copy(vistaGeneral.posicion);
controles.target.copy(vistaGeneral.objetivo);
controles.addEventListener("change", pedirDibujo);

// ---------- marcas numeradas (botones HTML encima del lienzo)
const marcas = new Map();
for (const g of edificios) {
  const l = lugares.get(g.userData.id);
  if (!l) continue;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mapa3d__marca";
  b.textContent = l.id;
  b.setAttribute("aria-label", `${l.id}. ${l.nombre}`);
  b.addEventListener("click", () => elegir(l.id, true));
  capaMarcas.appendChild(b);
  marcas.set(l.id, b);
}
const v = new THREE.Vector3();
// Las marcas de edificios vecinos (7, 8 y 9) se encimarían: se corren hasta que no se toquen,
// para que cada botón mantenga su tamaño completo al tocarlo.
// Los lugares menores (pasillos, casetas, parqueos…) solo muestran su número de cerca, o si están elegidos,
// para que la vista general no se llene de botones
const CERCA_MENORES = 300;
function moverMarcas() {
  const w = lienzo.clientWidth, h = lienzo.clientHeight, puestas = [];
  const lejos = camara.position.distanceTo(controles.target) > CERCA_MENORES;
  const lista = edificios.map((g) => { v.copy(g.userData.centro); v.y += 3; v.project(camara); return { g, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z, fuera: v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 || (lejos && g.userData.menor && g !== elegido) }; })
    .sort((a, b) => a.z - b.z);
  for (const m of lista) {
    const b = marcas.get(m.g.userData.id);
    if (!b) continue;
    b.hidden = m.fuera;
    if (m.fuera) continue;
    for (let intento = 0; intento < 8 && puestas.some((p) => Math.abs(p.x - m.x) < 34 && Math.abs(p.y - m.y) < 34); intento++) m.x += 18;
    puestas.push(m);
    b.style.transform = `translate(${m.x}px, ${m.y}px) translate(-50%, -50%)`;
  }
}

// ---------- elegir un edificio: lo resalta, muestra la ficha y acerca la cámara
let elegido = null;
// al soltar un lugar, techo y paredes vuelven a su color (no todos son blancos: portones, parqueos…)
function soltar(g) {
  for (const m of [g.userData.mat.techo, g.userData.mat.pared]) if (m.userData.original !== undefined) m.color.setHex(m.userData.original);
}
function elegir(id, volar) {
  if (elegido) soltar(elegido);
  marcas.forEach((b, k) => b.setAttribute("aria-pressed", String(k === id)));
  const g = edificios.find((x) => x.userData.id === id);
  const l = lugares.get(id);
  if (!g || !l) return;
  elegido = g;
  const { techo, pared } = g.userData.mat;
  for (const m of [techo, pared]) if (m.userData.original === undefined) m.userData.original = m.color.getHex();
  techo.color.setHex(g.userData.alto < 1 ? techo.userData.original : colores.elegido);
  pared.color.setHex(colores.paredElegida);
  rellenarFicha(l);
  if (volar) {
    const c = g.userData.centro;
    const dir = camara.position.clone().sub(controles.target).normalize();
    viajar(new THREE.Vector3(c.x, 0, c.z), new THREE.Vector3(c.x, 0, c.z).addScaledVector(dir, 120));
  }
  pedirDibujo();
}
function cerrarFicha() {
  if (elegido) soltar(elegido);
  elegido = null;
  ficha.hidden = true;
  marcas.forEach((b) => b.setAttribute("aria-pressed", "false"));
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
raiz.querySelector("[data-vista-general]").addEventListener("click", () => { cerrarFicha(); calcularVistaGeneral(); viajar(vistaGeneral.objetivo, vistaGeneral.posicion); });

// tocar un edificio en el lienzo (sin confundirlo con arrastrar para girar)
const rayo = new THREE.Raycaster(), puntero = new THREE.Vector2();
let inicio = null;
lienzo.addEventListener("pointerdown", (e) => { inicio = [e.clientX, e.clientY]; });
lienzo.addEventListener("pointerup", (e) => {
  if (!inicio || Math.hypot(e.clientX - inicio[0], e.clientY - inicio[1]) > 6) return;
  const r = lienzo.getBoundingClientRect();
  puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rayo.setFromCamera(puntero, camara);
  const golpe = rayo.intersectObjects(edificios, true)[0];
  if (golpe) elegir(golpe.object.userData.edificio.userData.id, false);
});

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
    camara.updateProjectionMatrix();
  }
}
function dibujar(ahora) {
  pendiente = false;
  ajustar();
  let seguir = false;
  if (viaje) {
    const k = Math.min((ahora - viaje.t0) / 900, 1), s = k * k * (3 - 2 * k);
    controles.target.lerpVectors(viaje.de[0], viaje.a[0], s);
    camara.position.lerpVectors(viaje.de[1], viaje.a[1], s);
    if (k >= 1) viaje = null; else seguir = true;
  }
  if (controles.update()) seguir = true;   // con amortiguación, sigue hasta detenerse
  const d = camara.position.distanceTo(controles.target);
  escena.fog.near = d * 1.2; escena.fog.far = d * 3;
  renderer.render(escena, camara);
  moverMarcas();
  brujula.style.transform = `rotate(${THREE.MathUtils.radToDeg(controles.getAzimuthalAngle())}deg)`;
  if (seguir) pedirDibujo();
}
new ResizeObserver(pedirDibujo).observe(lienzo);
raiz.classList.add("mapa3d--listo");
pedirDibujo();

// Para herramientas/giro.py: con #captura-giro la página expone la cámara para dibujar las vistas de la maqueta giratoria
if (location.hash === "#captura-giro") {
  window.__giro = { camara, controles, renderer, escena, edificios, dibujarYa() { ajustar(); controles.update(); renderer.render(escena, camara); } };
}
}
