// Maqueta 3D del campus (three.js). Los datos salen del croquis oficial y de la pestaña «lugares».
// Se dibuja solo cuando algo cambia (girar, acercar, elegir un edificio), para no gastar batería.
import * as THREE from "./vendor/three.module.min.js";
import { OrbitControls } from "./vendor/OrbitControls.js";

const raiz = document.querySelector("[data-recorrido]");
const lienzo = raiz.querySelector(".mapa3d__lienzo");
const capaMarcas = raiz.querySelector(".mapa3d__marcas");
const ficha = raiz.querySelector(".mapa3d__ficha");
const datos = JSON.parse(document.getElementById("datos-campus").textContent);
const lugares = new Map(datos.lugares.map((l) => [l.id, l]));
const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.movimiento === "no";

// ---------- escena
// Se intenta con calidad alta y, si el teléfono no lo permite, con opciones más livianas.
// Si no hay 3D, queda la imagen fija de la maqueta y la lista de lugares.
function crearRenderer() {
  for (const opciones of [{ antialias: true, alpha: true }, { antialias: false, alpha: true, powerPreference: "low-power" }, { antialias: false, alpha: false, powerPreference: "low-power", precision: "mediump" }]) {
    try { return new THREE.WebGLRenderer({ canvas: lienzo, ...opciones }); }
    catch (e) { console.warn("Maqueta 3D: no se pudo iniciar con", opciones, e); }
  }
  return null;
}
const renderer = crearRenderer();
if (!renderer) {
  raiz.classList.add("mapa3d--sin-3d");
  throw new Error("Sin WebGL: queda la imagen de la maqueta y la lista de lugares");
}
lienzo.addEventListener("webglcontextlost", (e) => { e.preventDefault(); raiz.classList.add("mapa3d--sin-3d"); });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const escena = new THREE.Scene();
escena.fog = new THREE.Fog(0xdfeaf2, 520, 1100);
const camara = new THREE.PerspectiveCamera(38, 1, 1, 3000);

escena.add(new THREE.HemisphereLight(0xf4f8ff, 0x6d8a5a, 1.45));
const sol = new THREE.DirectionalLight(0xfff4e0, 2.1);
sol.position.set(-160, 260, -120);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
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
const colores = { pared: 0xfbfaf6, techo: 0xaab6c1, losa: 0xe3e6ea, elegido: 0x005da4, paredElegida: 0xeaf2f9 };
// La maqueta exagera un poco las alturas para que los edificios se lean desde arriba
const EXAGERAR = 1.45;
const edificios = [];
function forma(contorno, crecer = 0) {
  const cx = contorno.reduce((s, p) => s + p[0], 0) / contorno.length;
  const cz = contorno.reduce((s, p) => s + p[1], 0) / contorno.length;
  const sh = new THREE.Shape();
  contorno.forEach(([x, z], i) => {
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz) || 1;
    const px = x + (dx / d) * crecer, pz = z + (dz / d) * crecer;
    i ? sh.lineTo(px, -pz) : sh.moveTo(px, -pz);
  });
  return { sh, cx, cz };
}
function prisma(contorno, alto, desde, material, crecer = 0) {
  const { sh } = forma(contorno, crecer);
  const g = new THREE.ExtrudeGeometry(sh, { depth: alto, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, desde, 0);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

for (const e0 of datos.campus.edificios) {
  const e = { ...e0, alto: e0.alto * EXAGERAR };
  const grupo = new THREE.Group();
  const { cx, cz } = forma(e.contorno);
  const mat = {
    pared: new THREE.MeshStandardMaterial({ color: colores.pared, roughness: 0.85 }),
    techo: new THREE.MeshStandardMaterial({ color: colores.techo, roughness: 0.6, metalness: 0.1 }),
  };
  if (e.tipo === "piscina") {
    grupo.add(prisma(e.contorno, 0.5, 0, new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.9 }), 2));
    const agua = prisma(e.contorno, 0.12, 0.5, new THREE.MeshStandardMaterial({ color: 0x2f8fd0, roughness: 0.15, metalness: 0.1 }), -2.2);
    agua.castShadow = false;
    grupo.add(agua);
    mat.techo = agua.material;
  } else {
    grupo.add(prisma(e.contorno, e.alto, 0, mat.pared));
    // losa entre pisos y alero del techo, un poco más anchos que la pared
    for (let p = 1; p < e.pisos; p++) grupo.add(prisma(e.contorno, 0.35, (e.alto / e.pisos) * p, new THREE.MeshStandardMaterial({ color: colores.losa }), 0.6));
    // franja oscura de ventanas en cada piso
    const vidrio = new THREE.MeshStandardMaterial({ color: 0x5b7186, roughness: 0.25, metalness: 0.2 });
    const pisos = Math.max(e.pisos, 1), altoPiso = e.alto / pisos;
    if (e.id !== 6) for (let p = 0; p < pisos; p++) grupo.add(prisma(e.contorno, altoPiso * 0.24, altoPiso * p + altoPiso * 0.42, vidrio, 0.05));
    grupo.add(prisma(e.contorno, 0.6, e.alto, mat.techo, 1.1));
  }
  grupo.userData = { id: e.id, centro: new THREE.Vector3(cx, e.alto, cz), mat, alto: e.alto };
  grupo.traverse((o) => { o.userData.edificio = grupo; });
  escena.add(grupo);
  edificios.push(grupo);
}

// ---------- árboles y palmeras
const hojas = [0x4f8f3a, 0x5f9e43, 0x3f7d34, 0x6aa84f].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
const tronco = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
const hojaPalma = new THREE.MeshLambertMaterial({ color: 0x5b9a3c, side: THREE.DoubleSide, flatShading: true });
datos.campus.arboles.forEach((a, i) => {
  const [x, z] = a.p, r = Math.max(a.r, 2.2), g = new THREE.Group();
  if (a.palma) {
    const h = r * 2.2;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, h, 6), tronco);
    tr.position.y = h / 2; g.add(tr);
    for (let k = 0; k < 8; k++) {
      const hoja = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, r * 1.25, 3, 1), hojaPalma);
      hoja.scale.z = 0.25;
      hoja.position.set(0, h, 0);
      hoja.rotation.set(0, (k / 8) * Math.PI * 2 + i, 0);
      hoja.rotateZ(-Math.PI / 2 + 0.45);
      hoja.translateY(r * 0.55);
      g.add(hoja);
    }
  } else {
    const h = r * 0.9;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, h, 6), tronco);
    tr.position.y = h / 2; g.add(tr);
    const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), hojas[i % hojas.length]);
    copa.position.y = h + r * 0.75; copa.scale.y = 0.8; g.add(copa);
  }
  g.position.set(x, 0, z);
  g.traverse((o) => { o.castShadow = true; });
  escena.add(g);
});

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
function moverMarcas() {
  const w = lienzo.clientWidth, h = lienzo.clientHeight, puestas = [];
  const lista = edificios.map((g) => { v.copy(g.userData.centro); v.y += 4; v.project(camara); return { g, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z, fuera: v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 }; })
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
function elegir(id, volar) {
  if (elegido) { elegido.userData.mat.techo.color.setHex(elegido.userData.mat.techo.userData.original); elegido.userData.mat.pared.color.setHex(colores.pared); }
  marcas.forEach((b, k) => b.setAttribute("aria-pressed", String(k === id)));
  document.querySelectorAll("[data-lugar]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.lugar) === id)));
  const g = edificios.find((x) => x.userData.id === id);
  const l = lugares.get(id);
  if (!g || !l) return;
  elegido = g;
  const techo = g.userData.mat.techo;
  if (techo.userData.original === undefined) techo.userData.original = techo.color.getHex();
  techo.color.setHex(g.userData.alto < 1 ? techo.userData.original : colores.elegido);
  g.userData.mat.pared.color.setHex(colores.paredElegida);
  ficha.hidden = false;
  ficha.querySelector(".mapa3d__ficha-zona").textContent = `Zona ${l.zona} · Edificio ${l.id}`;
  ficha.querySelector(".mapa3d__ficha-titulo").textContent = l.nombre;
  ficha.querySelector(".mapa3d__ficha-texto").textContent = l.texto || "";
  const enlace = ficha.querySelector(".mapa3d__ficha-enlace");
  enlace.hidden = !l.enlace;
  if (l.enlace) enlace.href = raiz.dataset.raiz + l.enlace;
  if (volar) {
    const c = g.userData.centro;
    const dir = camara.position.clone().sub(controles.target).normalize();
    viajar(new THREE.Vector3(c.x, 0, c.z), new THREE.Vector3(c.x, 0, c.z).addScaledVector(dir, 120));
  }
  pedirDibujo();
}
function cerrarFicha() {
  if (elegido) { elegido.userData.mat.techo.color.setHex(elegido.userData.mat.techo.userData.original); elegido.userData.mat.pared.color.setHex(colores.pared); }
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
