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
    if (estilo.entrada) entrada(grupo, e);
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
  const g = edificios.find((x) => x.userData.id === id);
  const l = lugares.get(id);
  if (!g || !l) return;
  elegido = g;
  const techo = g.userData.mat.techo;
  if (techo.userData.original === undefined) techo.userData.original = techo.color.getHex();
  techo.color.setHex(g.userData.alto < 1 ? techo.userData.original : colores.elegido);
  g.userData.mat.pared.color.setHex(colores.paredElegida);
  rellenarFicha(l);
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

// Para herramientas/giro.py: con #captura-giro la página expone la cámara para dibujar las vistas de la maqueta giratoria
if (location.hash === "#captura-giro") {
  window.__giro = { camara, controles, renderer, escena, edificios, dibujarYa() { ajustar(); controles.update(); renderer.render(escena, camara); } };
}
}
