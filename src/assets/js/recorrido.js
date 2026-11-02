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
function fachadaSur(contorno) {
  const cx = contorno.reduce((s, p) => s + p[0], 0) / contorno.length, cz = contorno.reduce((s, p) => s + p[1], 0) / contorno.length;
  let mejor = null;
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i], b = contorno[(i + 1) % contorno.length];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, largo = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / largo, nz = (b[0] - a[0]) / largo;
    if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
    const puntaje = largo * (0.6 + nz);
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
    pared: new THREE.MeshStandardMaterial({ color: colores.pared, roughness: 0.85 }),
    techo: new THREE.MeshStandardMaterial({ color: estilo.techo || colores.techo, roughness: 0.75, side: THREE.DoubleSide }),
  };
  if (e.tipo === "piscina") {
    const c = e.volumenes[0].contorno;
    grupo.add(prisma(c, 0.5, 0, new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.9 }), 2));
    const agua = prisma(c, 0.12, 0.5, new THREE.MeshStandardMaterial({ color: 0x2f8fd0, roughness: 0.15, metalness: 0.1 }), -2.2);
    agua.castShadow = false;
    grupo.add(agua);
    mat.techo = agua.material;
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
      if (e.id !== 6) for (let p = 0; p < pisos; p++) grupo.add(prisma(vol.contorno, altoPiso * (ventanal ? 0.4 : 0.3), altoPiso * p + altoPiso * (ventanal ? 0.4 : 0.36), ventanal ? cristal : celosia, 0.05));
    }
    if (e.techo.length) grupo.add(techo(e.techo, mat.techo));
    if (estilo.forma_techo === "plano") for (const vol of e.volumenes) {   // losa plana volada
      const l = prisma(vol.contorno, 0.6, e.alto, mat.techo, 3.2);
      grupo.add(l);
    }
    if (estilo.galeria) e.volumenes.forEach((vol) => galeria(grupo, vol, e.alto, Math.max(e.pisos, 1)));
    if (estilo.parasoles) e.volumenes.forEach((vol) => parasoles(grupo, vol, e.alto));
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
  for (const m of [copas, troncos, hojas]) { m.castShadow = true; m.instanceMatrix.needsUpdate = true; escena.add(m); }
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
function moverMarcas() {
  const w = lienzo.clientWidth, h = lienzo.clientHeight, puestas = [];
  const lista = edificios.map((g) => { v.copy(g.userData.centro); v.y += 3; v.project(camara); return { g, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, z: v.z, fuera: v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 }; })
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
  carruselFicha.cargar(l.fotos || [], `Fotos de ${l.nombre}`);
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

// ---------- carrusel de fotos: en la ficha y, al tocar una foto, en grande a pantalla completa
class Carrusel {
  constructor(nodo, grande, alTocar) {
    this.nodo = nodo; this.grande = grande; this.alTocar = alTocar;
    this.pista = nodo.querySelector(".carrusel__pista");
    this.cuenta = nodo.querySelector(".carrusel__cuenta");
    this.fotos = []; this.actual = 0;
    nodo.querySelector("[data-antes]").addEventListener("click", () => this.ir(this.actual - 1));
    nodo.querySelector("[data-despues]").addEventListener("click", () => this.ir(this.actual + 1));
    this.pista.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); this.ir(this.actual - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); this.ir(this.actual + 1); }
    });
    let espera;
    this.pista.addEventListener("scroll", () => { clearTimeout(espera); espera = setTimeout(() => this.leerPosicion(), 80); }, { passive: true });
  }
  cargar(fotos, titulo, inicio = 0) {
    this.fotos = fotos; this.actual = 0;
    this.nodo.hidden = !fotos.length;
    this.nodo.setAttribute("aria-label", titulo);
    this.nodo.classList.toggle("carrusel--una", fotos.length < 2);
    this.pista.replaceChildren(...fotos.map((f, i) => {
      const li = document.createElement("li");
      li.className = "carrusel__foto";
      li.setAttribute("aria-label", `${i + 1} de ${fotos.length}`);
      const img = document.createElement("img");
      img.src = raiz.dataset.raiz + (this.grande ? f.m : f.s);
      img.srcset = `${raiz.dataset.raiz + f.s} 640w, ${raiz.dataset.raiz + f.m} 1280w, ${raiz.dataset.raiz + f.g} 1920w`;
      img.sizes = this.grande ? "100vw" : "420px";
      img.alt = f.alt; img.loading = i ? "lazy" : "eager"; img.decoding = "async";
      if (this.alTocar) { img.addEventListener("click", () => this.alTocar(i)); img.classList.add("carrusel__ampliable"); }
      li.appendChild(img);
      return li;
    }));
    this.pista.scrollLeft = 0;
    if (inicio) requestAnimationFrame(() => this.ir(inicio, true)); else this.marcar();
  }
  ir(i, inmediato) {
    if (!this.fotos.length) return;
    this.actual = (i + this.fotos.length) % this.fotos.length;
    this.pista.scrollTo({ left: this.actual * this.pista.clientWidth, behavior: inmediato || sinMovimiento ? "auto" : "smooth" });
    this.marcar();
  }
  leerPosicion() {
    const i = Math.round(this.pista.scrollLeft / Math.max(this.pista.clientWidth, 1));
    if (i !== this.actual) { this.actual = i; this.marcar(); }
  }
  marcar() { this.cuenta.textContent = this.fotos.length > 1 ? `${this.actual + 1} / ${this.fotos.length}` : ""; }
}
const visor = document.querySelector(".visor-fotos");
const carruselGrande = new Carrusel(visor.querySelector("[data-carrusel]"), true);
const carruselFicha = new Carrusel(ficha.querySelector("[data-carrusel]"), false, (i) => {
  carruselGrande.cargar(carruselFicha.fotos, ficha.querySelector(".mapa3d__ficha-titulo").textContent, i);
  visor.showModal();
  carruselGrande.pista.focus();
});
visor.querySelector(".visor-fotos__cerrar").addEventListener("click", () => visor.close());
visor.addEventListener("click", (e) => { if (e.target === visor) visor.close(); });
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
