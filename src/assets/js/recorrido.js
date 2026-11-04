// Maqueta 3D del campus (three.js). Los datos salen del croquis oficial y de la pestaña «lugares».
// Se dibuja solo cuando algo cambia (girar, acercar, elegir un edificio), para no gastar batería.
import * as THREE from "./vendor/three.module.min.js";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { ficha, sinMovimiento, rellenarFicha } from "./recorrido-ficha.js";
import { MARCAS, prioridadDe, compararRango, FRENTE_PORTADA } from "./recorrido-config.js";
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
// Alrededor del croquis: zacate hasta el horizonte, las carreteras que siguen y los barrios, naves y bosques de
// los alrededores según Google Maps (recorrido-entorno.js)
const entorno = armarEntorno({ THREE, escena, datos, liviano });

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
    // vestidores y toldo en arco: detrás de la piscina, del lado de la quebrada (sur), al otro lado de la acera
    // que bordea la malla (la acera va a ~9,6 m del borde de la pileta; ver campus3d.py)
    const sur = ladoHacia(1);
    const blancoV = new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.85 });
    const grisV = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.85 });
    const laminaV = new THREE.MeshStandardMaterial({ color: 0xd6dade, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    for (const [t, largo] of [[-6, 7], [3.5, 10]]) {
      const caseta = new THREE.Group();
      const zocalo = new THREE.Mesh(new THREE.BoxGeometry(largo, 1.8, 4), grisV); zocalo.position.y = 0.9; caseta.add(zocalo);
      const muro = new THREE.Mesh(new THREE.BoxGeometry(largo, 1.4, 4), blancoV); muro.position.y = 2.5; caseta.add(muro);
      const techo = new THREE.Mesh(new THREE.BoxGeometry(largo + 1.2, 0.12, 5.6), laminaV); techo.position.set(0, 3.45, 0.3); techo.rotation.x = -0.16; caseta.add(techo);
      caseta.position.set(...sur.en(t, 14.5, 0)); caseta.rotation.y = sur.ang; grupo.add(caseta);
    }
    const toldo = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6, 14, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8c8f88, roughness: 0.7, side: THREE.DoubleSide }));
    toldo.rotation.set(0, sur.ang, Math.PI / 2); toldo.position.set(...sur.en(-13, 14.5, 2.2)); grupo.add(toldo);
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
    // (anotaciones) un poco más grande y separado de la malla
    const adoquin = new THREE.Mesh(new THREE.BoxGeometry(18, 0.08, 7.5), new THREE.MeshStandardMaterial({ color: 0x8e5a4c, roughness: 0.95 }));
    adoquin.position.set(...norte.en(0, 14, 0.05)); adoquin.rotation.y = norte.ang; grupo.add(adoquin);
    const inox = new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 0.7, roughness: 0.25 });
    for (let k = 0; k < 4; k++) {
      const u = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 12, Math.PI), inox);
      u.position.set(...norte.en(-6.5 + k * 1.6, 12.8, 0.45)); u.rotation.y = norte.ang + Math.PI / 2; grupo.add(u);
    }
    const tonos = [0x1f4fa8, 0x2a2d31, 0x5b2a6e, 0xb3262e, 0xe8e8e8];
    for (let k = 0; k < 5; k++) {
      const moto = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: tonos[k], roughness: 0.4, metalness: 0.3 });
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 1.9), m); cuerpo.position.y = 0.6; moto.add(cuerpo);
      for (const z of [-0.75, 0.75]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.15, 10), new THREE.MeshStandardMaterial({ color: 0x1a1a1a })); r.rotation.z = Math.PI / 2; r.position.set(0, 0.32, z); moto.add(r); }
      moto.position.set(...norte.en(1 + k * 1.4, 14.6, 0)); moto.rotation.y = norte.ang + Math.PI / 2; grupo.add(moto);
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
      const piso = prisma(desplazar(vol.contorno, alero - 0.2), 0.15, 0, new THREE.MeshStandardMaterial({ color: 0xb4614e, roughness: 0.9 }));
      piso.castShadow = false; grupo.add(piso);
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 4.5));
        for (let k = 0; k < n; k++) {
          const t = k / n, col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, e.alto - 0.7, 8), mat);
          col.position.set(a[0] + (b[0] - a[0]) * t, (e.alto - 0.7) / 2, a[1] + (b[1] - a[1]) * t); col.castShadow = !liviano; grupo.add(col);
        }
      }
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
    if (estilo.moderno) {   // Miniauditorio (fotos): franja alta gris, losa muy volada, columnas en V, mural y parasoles
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
      const parasol = new THREE.MeshStandardMaterial({ color: 0x8ec3e6, roughness: 0.6 });
      for (let k = 0; k < 7; k++) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.55), parasol);
        l.position.set(...enFachada(haciaCalle, 0.86, 0.35, 0.8 + k * 0.42)); l.rotation.set(0, angF(haciaCalle) + Math.PI / 2, 0); l.rotateX(-0.35); grupo.add(l);
      }
      const acer = new THREE.MeshStandardMaterial({ color: 0x7d858c, roughness: 0.5, metalness: 0.4 });
      for (const t of [0.3, 0.7]) for (const lado of [-1, 1]) {   // columnas en V bajo el alero del lado del ala de baños
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, e.alto + 0.2, 8), acer);
        col.position.set(...enFachada(haciaAla, t, 3.2, e.alto / 2)); col.rotation.set(0, angF(haciaAla), lado * 0.2); grupo.add(col);
      }
      const planta = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 1.2), new THREE.MeshStandardMaterial({ color: 0xd8261c, roughness: 0.5 }));
      planta.position.set(...enFachada(haciaCalle, 0.9, 5, 0.75)); planta.rotation.y = angF(haciaCalle); grupo.add(planta);
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
    if (estilo.loma) {   // el edificio está en lo alto de un talud de zacate
      grupo.children.forEach((h) => { h.position.y += estilo.loma; });
      const zacate = new THREE.MeshLambertMaterial({ color: 0x86b862 });
      for (const vol of e.volumenes) for (let k = 0; k < 5; k++) {
        const m = prisma(desplazar(vol.contorno, alero + 0.6 + 6 * (1 - k / 5)), estilo.loma / 5, (estilo.loma * k) / 5, zacate);
        m.castShadow = false; grupo.add(m);
      }
    }
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
  const concreto = new THREE.MeshStandardMaterial({ color: 0xc9c7c0, roughness: 0.9 });
  const asfalto = new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 0.95 });
  const amarillo = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5, metalness: 0.2 });
  const gris = new THREE.MeshStandardMaterial({ color: 0xb8bdc2, roughness: 0.4, metalness: 0.5 });
  const blanco = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const CALZADA = 5.8, ACERA = 1.8;
  // (anotaciones) acera también del lado este, donde llega la acera de la calle que viene de la entrada por residencias
  const lados = datos.campus.puente.acera_este ? [-1, 1] : [-1];
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
    if (lados.length > 1) caja(CALZADA + 2 * ACERA + 0.6, 0.9, L, concreto, 0, -0.4, ang, cx, cz);   // tablero
    else caja(CALZADA + ACERA + 0.6, 0.9, L, concreto, -ACERA / 2, -0.4, ang, cx, cz);
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
    }
  }
  // paso de cebra al norte del puente
  const [nx, nz] = eje[1], [mx, mz] = eje[0], angN = Math.atan2(nx - mx, nz - mz);
  for (let k = 0; k < 6; k++) caja(0.5, 0.04, 2.6, blanco, -CALZADA / 2 + 0.6 + k * 0.9, 0.1, angN, (nx + mx) / 2, (nz + mz) / 2);
  puente.traverse((o) => { if (o.isMesh) { o.castShadow = !liviano; o.receiveShadow = true; } });
  if (lugares.get(N.puente)) {
    puente.userData = { id: N.puente, centro: new THREE.Vector3(px, 3, pz), mat: { pared: amarillo, techo: amarillo }, alto: 1 };
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
      g.userData = { id, centro, mat, alto, menor: true };
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
  function pasillo({ id, puntos, ancho, techo = true, en_calle = [], alturas = [] }) {
    const g = new THREE.Group(), pisos = [], guias = [], techos = [], columnas = [], barandas = [], muros = [];
    const y = (i) => alturas[i] || 0;
    for (let i = 0; i < puntos.length - 1; i++) {
      if (en_calle[i] || en_calle[i + 1]) continue;
      const [ax, az] = puntos[i], [bx, bz] = puntos[i + 1];
      const L = Math.hypot(bx - ax, bz - az) + 0.12, ang = Math.atan2(bx - ax, bz - az), pend = Math.atan2(y(i + 1) - y(i), L);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, ym = (y(i) + y(i + 1)) / 2, nx = Math.cos(ang), nz = -Math.sin(ang);
      pisos.push([cx, ym + 0.06, cz, ancho, 0.12, L, ang, -pend]);
      guias.push([cx, ym + 0.125, cz, 0.36, 0.02, L, ang, -pend]);
      if (ym > 0.25) for (const lado of [-1, 1]) muros.push([cx + nx * lado * (ancho / 2 - 0.1), ym / 2, cz + nz * lado * (ancho / 2 - 0.1), 0.2, ym, L, ang]);
      const lados = techo ? [1] : [-1, 1];
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
    } else if (uso === "ala_moderna") {   // ala de baños del Miniauditorio: blanca, celosías arriba, losa gris volada
      bloque(largo, alto, ancho, pared);
      bloque(largo + 0.08, 0.6, ancho + 0.08, mate(0xe9ebec), 0, alto - 0.55);
      techoM = mate(0xd9dcdf);
      bloque(largo + 3, 0.3, ancho + 2.4, techoM, 0, alto + 0.15);
      for (const x of [-largo / 4, largo / 4]) puerta(x, ancho / 2 + 0.05, mate(0x6d7880));
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
    } else if (uso === "banos_crema") {   // baño de Docencia: crema, techo verde a una agua con alero blanco
      pared = mate(0xefe6c8);
      bloque(largo, alto, ancho, pared);
      techoM = mate(0x4f8a62);
      const t = bloque(largo + 1.2, 0.12, ancho + 1.4, techoM, 0, alto + 0.25); t.rotation.x = 0.12;
      bloque(largo + 1.25, 0.25, 0.08, blanco, 0, alto + 0.05, ancho / 2 + 0.7);
      for (const x of [-largo / 4, largo / 4]) puerta(x, ancho / 2 + 0.05, vidrio);
    } else if (uso === "banos_mural") {   // baño del pabellón 7: dos aguas, alero celeste, celosías y mural
      bloque(largo, alto, ancho, mate(0xdfeaf4));
      bloque(largo + 0.08, 0.5, ancho + 0.08, celosia, 0, alto - 0.4);
      const mural = new THREE.Mesh(new THREE.PlaneGeometry(largo * 0.85, alto * 0.6), new THREE.MeshBasicMaterial({ map: texturaMural(11, "#cfe3f5") }));
      mural.position.set(0, alto * 0.42, ancho / 2 + 0.05); g.add(mural);
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
  function parqueo({ id, centro: [cx, cz], largo, ancho, giro, filas, techado }) {
    const g = new THREE.Group();
    const tope = mate(0xe6b800, { roughness: 0.7 }), verdePoste = mate(0x2f6b45, { roughness: 0.6 });
    for (const { z: zv, fondo, n } of filas) {
      const z = -zv, lado = Math.sign(z) || 1;   // la fila mide z hacia la izquierda del giro; en la maqueta es -z
      for (let i = 0; i < n; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.15, 0.25), tope); t.position.set((-n / 2 + i + 0.5) * 2.6, 0.08, z + lado * (fondo / 2 - 0.6)); g.add(t);
      }
      if (techado) {
        const k = Math.min(techado, n), x0 = -n / 2 * 2.6, L = k * 2.6;
        const t = new THREE.Mesh(new THREE.BoxGeometry(L + 0.6, 0.08, fondo + 1), mate(0x4e8a62, { roughness: 0.55, metalness: 0.25 }));
        t.position.set(x0 + L / 2, 2.75, z); t.rotation.x = lado * 0.07; g.add(t);
        const losa = new THREE.Mesh(new THREE.BoxGeometry(L, 0.18, fondo), concretoClaro); losa.position.set(x0 + L / 2, 0.09, z); g.add(losa);
        for (let i = 0; i <= k; i++) for (const dz of [-1, 1]) {
          const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.16), azulColumna); c.position.set(x0 + i * 2.6, 1.35, z + dz * (fondo / 2)); g.add(c);
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), tope); b.position.set(x0 + i * 2.6, 0.25, z + dz * (fondo / 2)); g.add(b);
        }
      }
    }
    for (const x of [-largo / 2 + 0.8, largo / 2 - 0.8]) {
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8), verdePoste); poste.position.set(x, 3.75, -ancho / 2 + 0.6); g.add(poste);
      const lampara = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.9), new THREE.MeshBasicMaterial({ color: 0xfff3c4 })); lampara.position.set(x, 7.4, -ancho / 2 + 1.1); g.add(lampara);
    }
    g.position.set(cx, 0, cz); g.rotation.y = -giro;
    registrar(g, id, new THREE.Vector3(cx, 3, cz), { pared: verdePoste, techo: tope });
  }

  // escalera de concreto con pasamanos gris; la larga entre el 1 y el 2 va techada
  function escalera({ p, giro, largo, ancho, alto, techado }) {
    const g = new THREE.Group(), h = alto * EXAGERAR, n = Math.max(3, Math.round(h / 0.17));
    for (let i = 0; i < n; i++) {
      const paso = new THREE.Mesh(new THREE.BoxGeometry(largo / n + 0.02, (h * (i + 1)) / n, ancho), concretoClaro);
      paso.position.set(-largo / 2 + (largo / n) * (i + 0.5), (h * (i + 1)) / n / 2, 0); g.add(paso);
    }
    const tubo = mate(0xaab0b5, { roughness: 0.5, metalness: 0.4 }), pend = Math.atan2(h, largo);
    for (const lado of [-1, 1]) {
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

  // explanada (fotos): una gran planicie en lo alto, con taludes de zacate, bancas de concreto celeste en el borde
  // y un higuerón enorme (unas tres veces más grande que los árboles comunes)
  function explanada({ id, contorno, centro, alto, arbol }) {
    const g = new THREE.Group();
    const lado = new THREE.MeshLambertMaterial({ color: 0x86b862 }), arriba = new THREE.MeshLambertMaterial({ color: 0xa4ce7e });
    const capas = 6;
    for (let k = 0; k < capas; k++) {
      const m = prisma(desplazar(contorno, 5 * (1 - k / capas)), alto / capas, (alto * k) / capas, k === capas - 1 ? arriba : lado);
      m.castShadow = false; g.add(m);
    }
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
  function alcantarilla({ id, p, giro, ancho }) {
    const g = new THREE.Group(), concreto = mate(0xbfbdb5, { roughness: 0.95 });
    const boca = new THREE.MeshBasicMaterial({ color: 0x1d2326 });
    for (const lado of [-1, 1]) {   // local x: de lado a lado de la calle; local z: a lo largo de la calle
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

  // bancas de concreto celeste (plaza del Miniauditorio)
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
  function comedor({ p, giro, largo, ancho, alto }) {
    const g = new THREE.Group(), techos = [], columnas = [], mesasC = [];
    const losa = new THREE.Mesh(new THREE.BoxGeometry(largo, 0.25, ancho), concretoClaro); losa.position.y = 0.12; g.add(losa);
    for (let i = 0; i <= 4; i++) for (const lado of [-1, 1]) columnas.push([lado * (largo / 2 - 0.2), alto / 2, -ancho / 2 + (ancho * i) / 4, 0.18, alto, 0.18]);
    tramoTecho(techos, [0, -ancho / 2 - 0.6], [0, ancho / 2 + 0.6], alto - 2.75, alto - 2.75, largo + 0.4);
    for (let i = 0; i < 4; i++) for (const lado of [-1, 1]) mesasC.push([lado * 2.2, 0.75, -ancho / 2 + 2 + i * 3.6, 1.8, 0.06, 0.8]);
    g.add(cajas(mate(0xb9bdc0, { metalness: 0.3 }), techos), cajas(azulColumna, columnas), cajas(blanco, mesasC));
    g.position.set(p[0], 0, p[1]); g.rotation.y = -giro;
    registrar(g, null);
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
  function acera({ puntos, ancho }) {
    const losas = [], guias = [];
    for (let i = 0; i < puntos.length - 1; i++) {
      const [ax, az] = puntos[i], [bx, bz] = puntos[i + 1];
      const L = Math.hypot(bx - ax, bz - az) + ancho * 0.5, ang = Math.atan2(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2;
      losas.push([cx, 0.06, cz, ancho, 0.12, L, ang]);
      guias.push([cx, 0.125, cz, 0.36, 0.02, L, ang]);
    }
    const g = new THREE.Group(); g.add(cajas(concretoClaro, losas), cajas(amarilloGuia, guias)); registrar(g, null);
  }
  // paso de cebra (anotaciones): franjas blancas a lo largo de la calle, una tras otra de lado a lado
  function cebra({ franjas, giro, ancho = 3 }) {
    const g = new THREE.Group(); g.add(cajas(blanco, franjas.map(([x, z]) => [x, 0.1, z, ancho, 0.04, 0.5, giro]))); registrar(g, null);
  }
  // portón peatonal (anotaciones): dos hojas angostas como las del portón grande, al final de la cerca
  function portonPeatonal({ p, giro, ancho = 1.4 }) {
    const g = portonVerde(false, ancho / 2); g.position.set(p[0], 0, p[1]); g.rotation.y = giro; escena.add(g);
  }
  for (const el of datos.campus.elementos || []) {
    const hacer = { pasillo, caseta, parqueo, bancas, escalera, rampa, descanso, mesas, explanada, alcantarilla, jardin, pluma, comedor, tanque,
      acera, cebra, porton_peatonal: portonPeatonal, puente_peatonal: puentePeatonal, arbol_grande: arbolGrande }[el.tipo];
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
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent || !o.visible) return;
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
let esperaQuieta = null;
function camaraQuieta() {
  clearTimeout(esperaQuieta);
  esperaQuieta = setTimeout(resolverEncimados, MARCAS.esperaMs);
}
function camaraEnMovimiento() { clearTimeout(esperaQuieta); }

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
  elegido = g;
  const mElegida = marcas.get(id);
  if (mElegida) mElegida.tapada = false;
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
  const golpe = rayo.intersectObjects(edificios, true)[0];
  if (PORTADA) { location.href = raiz.dataset.raiz + "recorrido.html" + (golpe ? `#lugar-${golpe.object.userData.edificio.userData.id}` : ""); return; }
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
  if (controles.update(paso)) seguir = true;   // con amortiguación, sigue hasta detenerse
  const d = camara.position.distanceTo(controles.target);
  escena.fog.near = d * 1.2; escena.fog.far = d * 3;
  renderer.render(escena, camara);
  moverMarcas();   // en el mismo fotograma que el dibujo: los números no se atrasan respecto a la escena
  if (seguir) camaraEnMovimiento(); else camaraQuieta();
  brujula.style.transform = `rotate(${THREE.MathUtils.radToDeg(controles.getAzimuthalAngle())}deg)`;
  if (seguir && (!PORTADA || (enPantalla && !document.hidden))) pedirDibujo();
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
