// Sitio sin conexión (lo publica build.py en la raíz, con la versión de los recursos).
// · Páginas: primero la red (siempre lo último); sin señal, la copia guardada; si no hay copia, sin-conexion.html.
// · CSS y JS llevan ?v=versión: se guardan una vez por archivo y se renuevan cuando cambia la versión.
// · Fotos de media/ (el nombre lleva su huella, nunca cambian): se guardan al verlas, hasta un límite.
// · Lo demás (imágenes de assets, letras, datos): la copia guardada al instante y se renueva por detrás.
// · El botón de sin-conexion.html manda la lista de sin-conexion.json para guardar todo de una vez.
// PDF, videos, audio, .ics, .xml y la API van directo a la red.
const VERSION = "__VERSION__";
const BASE = new URL("./", self.location).href;
const PAGINAS = "sede-paginas", RECURSOS = "sede-recursos", FOTOS = "sede-fotos", NOMBRES = [PAGINAS, RECURSOS, FOTOS];
const MAX_PAGINAS = 120, MAX_FOTOS = 300;
const MARCA = BASE + "__sin-conexion-guardado";   // fecha y páginas del último «Guardar»
const ESENCIAL = [`assets/css/sede.css?v=${VERSION}`, `assets/js/tema.js?v=${VERSION}`,
  `assets/js/sede.js?v=${VERSION}`, `assets/js/sin-conexion.js?v=${VERSION}`,
  "assets/fonts/source-sans-3-latin-400-normal.woff2", "assets/fonts/source-sans-3-latin-700-normal.woff2",
  "assets/fonts/source-sans-3-latin-900-normal.woff2", "assets/img/firma-ucr-negro.png", "assets/img/firma-ucr-blanco.png",
  "assets/img/favicon.svg"];

const versionada = (u) => /\/assets\/(css|js)\//.test(u.pathname);
const esFoto = (u) => u.pathname.startsWith(new URL(BASE).pathname + "media/");
const directo = (u) => /\.(pdf|mp4|mp3|webm|ics|xml)$/i.test(u.pathname) || /\/(estado|sin-conexion)\.json$/.test(u.pathname) || u.pathname.includes("/api/");
function clave(u) {
  const k = new URL(u); k.hash = "";
  if (versionada(k)) k.search = "";
  return k.href;
}
function clavePagina(u) {
  const k = new URL(u); k.hash = ""; k.search = "";
  if (k.pathname.endsWith("/")) k.pathname += "index.html";
  return k.href;
}

async function poner(nombre, k, resp, v) {
  if (v || resp.redirected) {   // una respuesta redirigida no sirve para navegar: se guarda limpia   // la versión va en una cabecera propia: así se sabe si la copia sirve para la página que la pide
    const h = new Headers(resp.headers); if (v) h.set("x-sede-v", v);
    resp = new Response(await resp.blob(), { status: resp.status, statusText: resp.statusText, headers: h });
  }
  const c = await caches.open(nombre);
  await c.put(k, resp);
}
async function recortar(nombre, max) {
  const c = await caches.open(nombre), llaves = await c.keys();
  if (llaves.length <= max) return;
  const marca = await caches.match(MARCA), fijas = new Set([MARCA, ...(marca ? (await marca.json()).paginas : [])]);
  for (const r of llaves.slice(0, llaves.length - max)) if (!fijas.has(r.url)) await c.delete(r);
}
const conLimite = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("lenta")), ms))]);

async function pagina(evento, r, u) {
  const k = clavePagina(u);
  const red = fetch(r).then(async (resp) => {
    if (resp.ok && resp.type === "basic") { await poner(PAGINAS, k, resp.clone()); recortar(PAGINAS, MAX_PAGINAS); }
    return resp;
  });
  evento.waitUntil(red.catch(() => {}));
  try {
    // con señal débil no se espera más de 6 s si hay copia; sin copia, se espera a la red lo que tarde
    return await conLimite(red, 6000);
  } catch {
    const copia = await caches.match(k, { ignoreSearch: true });
    if (copia) return copia;
    try { return await red; } catch {
      // sin copia: a la página que dice qué hay guardado (con redirección, para que sus enlaces relativos funcionen)
      const pedida = k.slice(BASE.length);
      return Response.redirect(`${BASE}sin-conexion.html?pedida=${encodeURIComponent(pedida)}`, 302);
    }
  }
}

async function otraMedida(u) {   // sin señal, otra medida de la misma foto (p. ej. la de 640 px en vez de la de 1280)
  const m = u.pathname.match(/^(.*-)\d+\.webp$/);
  if (!m) return null;
  const c = await caches.open(FOTOS);
  const r = (await c.keys()).find((x) => new URL(x.url).pathname.startsWith(m[1]));
  return r ? c.match(r) : null;
}

async function recurso(evento, r, u) {
  const k = clave(u), v = versionada(u) ? u.searchParams.get("v") : null;
  const copia = await caches.match(k);
  const traer = () => fetch(r).then(async (resp) => {
    if (resp.ok && resp.type === "basic") {
      await poner(esFoto(u) ? FOTOS : RECURSOS, k, resp.clone(), v);
      if (esFoto(u)) recortar(FOTOS, MAX_FOTOS);
    }
    return resp;
  });
  if (copia && (esFoto(u) || (v && copia.headers.get("x-sede-v") === v))) return copia;
  if (copia && !v) { evento.waitUntil(traer().catch(() => {})); return copia; }
  try { return await traer(); } catch (e) {
    if (copia) return copia;   // otra versión: mejor que nada
    const otra = esFoto(u) && await otraMedida(u);
    if (otra) return otra;
    throw e;
  }
}

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || r.headers.has("range")) return;
  const u = new URL(r.url);
  if (!u.href.startsWith(BASE) || directo(u)) return;
  if (r.mode === "navigate") e.respondWith(pagina(e, r, u));
  else e.respondWith(recurso(e, r, u));
});

// guardar una lista de una vez (botón de sin-conexion.html): avisa el avance por el puerto que manda la página
async function guardarLista({ paginas, recursos }, puerto) {
  const todos = [...paginas.map((p) => [p, true]), ...recursos.map((p) => [p, false])];
  let hechos = 0, fallas = 0;
  for (let i = 0; i < todos.length; i += 4) {
    await Promise.all(todos.slice(i, i + 4).map(async ([ruta, esPagina]) => {
      const u = new URL(ruta, BASE);
      try {
        const resp = await fetch(u);
        if (!resp.ok) throw new Error(resp.status);
        if (esPagina) await poner(PAGINAS, clavePagina(u), resp);
        else await poner(esFoto(u) ? FOTOS : RECURSOS, clave(u), resp, versionada(u) ? u.searchParams.get("v") : null);
      } catch { fallas++; }
      hechos++;
    }));
    puerto?.postMessage({ hechos, total: todos.length, fallas });
  }
  const marca = { fecha: new Date().toISOString(), version: VERSION, paginas: paginas.map((p) => clavePagina(new URL(p, BASE))), fotos: recursos.some((p) => p.startsWith("media/")) };
  await (await caches.open(PAGINAS)).put(MARCA, new Response(JSON.stringify(marca), { headers: { "content-type": "application/json" } }));
  puerto?.postMessage({ fin: true, hechos, total: todos.length, fallas });
}
self.addEventListener("message", (e) => {
  if (e.data?.tipo === "guardar") e.waitUntil(guardarLista(e.data, e.ports[0]));
  if (e.data?.tipo === "borrar") e.waitUntil(Promise.all(NOMBRES.map((n) => caches.delete(n))).then(() => e.ports[0]?.postMessage({ fin: true })));
});

self.addEventListener("install", (e) => {
  // lo mínimo para avisar sin conexión con el aspecto del sitio; si algo falla, el sitio sigue igual
  e.waitUntil(Promise.all(ESENCIAL.map((p) => recurso({ waitUntil() {} }, new Request(new URL(p, BASE)), new URL(p, BASE))
    .catch(() => {}))).then(async () => {
    const u = new URL("sin-conexion.html", BASE);
    try { const r = await fetch(u); if (r.ok) await poner(PAGINAS, clavePagina(u), r); } catch {}
  }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("sede-") && !NOMBRES.includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
