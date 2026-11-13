// Buscador de lugares del recorrido: nombres de edificios, aulas y dependencias (p. ej. «laboratorio», «aula 5», «biblioteca»).
// No toca la escena: al elegir un resultado activa el botón de la lista de lugares, que ya sabe ir al lugar
// (en 3D lo enfoca y abre su ficha; sin 3D, lo marca en la maqueta giratoria).
const caja = document.querySelector("[data-busqueda]");
const origen = document.getElementById("datos-campus");
if (caja && origen) {
  const datos = JSON.parse(origen.textContent);
  const entrada = caja.querySelector("input");
  const lista = caja.querySelector("[data-busqueda-lista]");
  const estado = caja.querySelector("[data-busqueda-estado]");
  const limpiar = caja.querySelector("[data-busqueda-limpiar]");
  const norm = (t) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Un renglón por cosa que se puede buscar: el lugar, cada aula o dependencia, y el texto del lugar.
  const indice = [];
  for (const l of datos.lugares) {
    indice.push({ id: l.id, zona: l.zona, titulo: l.nombre, detalle: "", pajar: norm(l.nombre), peso: 0 });
    for (const g of l.dependencias || []) {
      for (const [nombre, detalle] of g.espacios) {
        indice.push({ id: l.id, zona: l.zona, titulo: nombre, detalle: detalle || "", piso: g.piso || "",
          pajar: norm(nombre + " " + (detalle || "")), peso: 1 });
      }
    }
    indice.push({ id: l.id, zona: l.zona, titulo: l.nombre, detalle: "", pajar: norm(l.texto), peso: 2, soloTexto: true });
  }
  const nombreDe = new Map(datos.lugares.map((l) => [l.id, l.nombre]));

  function buscar(q) {
    const palabras = norm(q).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    // cada palabra escrita debe empezar una palabra del texto: «5» halla «Aula 5» pero no «Aula 15»
    const patrones = palabras.map((p) => new RegExp("(^|[^a-z0-9])" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const mejor = new Map(); // un resultado por lugar y título: el de mejor peso
    for (const r of indice) {
      if (!patrones.every((re) => re.test(r.pajar))) continue;
      const clave = r.id + "|" + r.titulo + "|" + r.detalle;
      // el que empieza igual que lo escrito sube; «aula 1» no debe traer primero «aula 12»
      const empieza = r.pajar.startsWith(palabras[0]) || r.pajar.includes(" " + palabras[0]) ? 0 : 0.5;
      const exacto = r.pajar.split(/\s+/).includes(palabras[palabras.length - 1]) ? 0 : 0.25;
      const puntos = r.peso + empieza + exacto;
      if (!mejor.has(clave) || mejor.get(clave).puntos > puntos) mejor.set(clave, { ...r, puntos });
    }
    // un número solo («5») también es el número del lugar en el croquis
    if (/^\d+$/.test(q.trim())) {
      const id = Number(q.trim());
      if (nombreDe.has(id)) mejor.set("id|" + id, { id, zona: datos.lugares.find((l) => l.id === id).zona, titulo: nombreDe.get(id), detalle: "", puntos: -1 });
    }
    return [...mejor.values()].sort((a, b) => a.puntos - b.puntos || a.id - b.id).slice(0, 8);
  }

  let resultados = [];
  function pintar() {
    const q = entrada.value.trim();
    limpiar.hidden = !q;
    resultados = buscar(q);
    lista.replaceChildren(...resultados.map((r) => {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.dataset.id = r.id;
      const n = document.createElement("b"); n.className = `mapa3d__chip--z${r.zona}`; n.textContent = r.id;
      const t = document.createElement("span"); t.className = "busqueda__t";
      const nombre = document.createElement("strong"); nombre.textContent = r.titulo;
      t.append(nombre);
      if (r.detalle) t.append(` · ${r.detalle}`);
      const donde = document.createElement("small");
      const enLugar = r.titulo === nombreDe.get(r.id) ? "" : `En ${nombreDe.get(r.id)}${r.piso ? ", " + r.piso.toLowerCase() : ""}`;
      donde.textContent = [enLugar, r.zona ? `Zona ${r.zona}` : "Áreas deportivas"].filter(Boolean).join(" · ");
      t.append(document.createElement("br"), donde);
      b.append(n, t); li.append(b);
      return li;
    }));
    estado.textContent = !q ? "" : resultados.length ? `${resultados.length} ${resultados.length === 1 ? "resultado" : "resultados"}` :
      "Sin resultados. Pruebe con otra palabra, por ejemplo «aula», «laboratorio» o «biblioteca».";
  }
  function ir(id) {
    const boton = document.querySelector(`.lugares [data-lugar="${id}"]`);
    if (boton) boton.click();
    lista.replaceChildren(); estado.textContent = `Se muestra ${nombreDe.get(id)}.`;
  }
  entrada.addEventListener("input", pintar);
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && resultados.length) { e.preventDefault(); ir(resultados[0].id); }
    else if (e.key === "Escape") { entrada.value = ""; pintar(); }
    else if (e.key === "ArrowDown" && lista.querySelector("button")) { e.preventDefault(); lista.querySelector("button").focus(); }
  });
  lista.addEventListener("click", (e) => { const b = e.target.closest("button[data-id]"); if (b) ir(Number(b.dataset.id)); });
  lista.addEventListener("keydown", (e) => {
    const bs = [...lista.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && bs[i + 1]) { e.preventDefault(); bs[i + 1].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); (bs[i - 1] || entrada).focus(); }
    else if (e.key === "Escape") entrada.focus();
  });
  limpiar.addEventListener("click", () => { entrada.value = ""; pintar(); entrada.focus(); });
  caja.addEventListener("submit", (e) => e.preventDefault());
}
