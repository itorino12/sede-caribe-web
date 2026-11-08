// Configuración de los números (marcadores) de la maqueta 3D y de la maqueta giratoria.
// Se puede ajustar sin tocar el resto del código.
export const MARCAS = {
  // Prioridad de cada lugar: 1 = principal (siempre en la vista general), 2 = secundario (zoom medio),
  // 3 = detalle (zoom cercano). Los números que no estén en ninguna lista son de prioridad 3.
  // Dentro de una misma prioridad, el orden de la lista decide cuál se queda si dos se tapan.
  prioridad: {
    1: [13, 24, 1, 2, 15, 27, 25, 17, 30, 37, 4, 12],
    2: [3, 14, 16, 26, 32, 31, 33, 28, 34, 35, 36, 20, 29],
  },
  // Distancia de la cámara al punto que mira (en metros de la maqueta, medida con un lente de 38°; con otro
  // lente se corrige sola). Por debajo de «medio» aparecen los de prioridad 2 y por debajo de «cerca», los de 3.
  // Como referencia: la vista general queda a unos 450 m en PC y a unos 800 m en celular; al tocar un lugar,
  // la cámara se acerca a 120 m.
  zoom: { medio: 360, cerca: 250 },
  // Margen para que no parpadeen en el límite: aparecen al bajar de umbral × (1 − histéresis) y se ocultan
  // al pasar de umbral × (1 + histéresis).
  histeresis: 0.1,
  // Distancia mínima entre centros de dos números, en píxeles; si quedan más cerca, se oculta el de menor prioridad.
  separacion: 32,
  // Duración del fundido al aparecer o desaparecer, en milisegundos.
  fundidoMs: 150,
  // Tiempo que la cámara debe estar quieta antes de recalcular cuáles números se tapan, en milisegundos.
  esperaMs: 140,
  // Altura del número sobre el punto más alto del lugar, en metros.
  alturaAncla: 3,
  // Maqueta giratoria (navegadores sin 3D): prioridad más baja que se muestra.
  giroNivel: 2,
};

const orden = new Map();
for (const [p, lista] of Object.entries(MARCAS.prioridad)) lista.forEach((id, i) => orden.set(id, [Number(p), i]));

// [prioridad, posición en su lista]: sirve para ordenar de más a menos importante
export function rango(id) {
  return orden.get(id) || [3, id];
}
export function prioridadDe(id) {
  return rango(id)[0];
}
export function compararRango(a, b) {
  const [pa, ia] = rango(a), [pb, ib] = rango(b);
  return pa - pb || ia - ib;
}

// Portada: número del lugar que queda de frente a la cámara cuando la maqueta empieza a girar (13 = Entrada principal).
export const FRENTE_PORTADA = 13;

// Congos del árbol junto a la caseta de arriba (11): un toque suena su aullido; dos toques seguidos abren los videos.
export const CONGOS = {
  audio: "assets/media/congos.m4a",
  videos: [{ src: "assets/media/congos.mp4", poster: "assets/media/congos.jpg", titulo: "Congos en el árbol junto a la caseta de arriba" }],
  dobleToqueMs: 350,
};
