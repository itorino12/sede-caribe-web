#!/usr/bin/env python3
"""Arte de 1200×800 para noticias (mismo estilo que las de admisión y acreditación).

Uso: python3 herramientas/arte_noticia.py herramientas/fuentes/noticias/<id>.json
El JSON lleva: salida (ruta bajo src/assets/fotos/), antetitulo, titulo (líneas), recuadros [[etiqueta, texto]],
pie, recinto (opcional) y motivo (opcional: «manufactura»).
Todo lo importante queda dentro de la franja 16:10 central, porque el carrusel de la portada recorta arriba y abajo.
"""
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
E = 2  # se dibuja al doble y se reduce: bordes suaves
W, H = 1200, 800
AZUL, AZUL_OSC, CELESTE, BLANCO, TINTA = (0, 92, 165), (0, 70, 130), (0, 172, 233), (255, 255, 255), (22, 28, 40)
FUENTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans{}.ttf"


def f(tam, negrita=True):
    return ImageFont.truetype(FUENTE.format("-Bold" if negrita else ""), tam * E)


def motivo_manufactura(d, x0, y0, s):
    """Engranajes, brazo robótico y banda transportadora con cajas, en trazo claro sobre el azul."""
    linea = (255, 255, 255, 235)
    suave = (0, 172, 233, 255)
    tenue = (255, 255, 255, 34)

    def P(x, y):
        return ((x0 + x * s) * E, (y0 + y * s) * E)

    def engranaje(cx, cy, r, dientes, color, grosor, giro=0.0):
        pts = []
        for i in range(dientes * 4):
            a = giro + i * math.pi * 2 / (dientes * 4)
            rr = r * (1.16 if i % 4 in (1, 2) else 0.96)
            pts.append(P(cx + rr * math.cos(a), cy + rr * math.sin(a)))
        d.line(pts + [pts[0]], fill=color, width=int(grosor * E), joint="curve")
        cxx, cyy = P(cx, cy)
        for k, w in ((0.62, grosor), (0.2, grosor)):
            rk = r * k * s * E
            d.ellipse((cxx - rk, cyy - rk, cxx + rk, cyy + rk), outline=color, width=int(w * E))

    # rejilla tenue de fondo (plano técnico)
    for i in range(0, 9):
        d.line([P(0, i * 50), P(400, i * 50)], fill=tenue, width=E)
    for i in range(0, 9):
        d.line([P(i * 50, 0), P(i * 50, 400)], fill=tenue, width=E)

    engranaje(100, 112, 66, 10, linea, 6)
    engranaje(205, 172, 42, 7, suave, 6, giro=0.22)
    engranaje(310, 78, 32, 6, linea, 5, giro=0.4)

    # banda transportadora
    d.rounded_rectangle([P(20, 330), P(390, 362)], radius=16 * s * E, outline=linea, width=6 * E)
    for x in range(52, 390, 46):
        cx, cy = P(x, 346)
        r = 8 * s * E
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=linea, width=3 * E)
    for x, h in ((34, 46), (110, 58), (220, 46)):
        d.rounded_rectangle([P(x, 330 - h), P(x + 52, 326)], radius=4 * s * E, fill=(255, 255, 255, 245))
        d.line([P(x + 26, 330 - h), P(x + 26, 326)], fill=AZUL + (255,), width=3 * E)

    # brazo robótico sobre la banda
    base = [P(286, 326), P(358, 326), P(346, 300), P(298, 300)]
    d.polygon(base, fill=suave)
    hombro, codo, muneca = (322, 290), (300, 214), (246, 236)
    for a, b in ((hombro, codo), (codo, muneca)):
        d.line([P(*a), P(*b)], fill=linea, width=int(20 * s * E))
    for c in (hombro, codo, muneca):
        cx, cy = P(*c)
        r = 13 * s * E
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=AZUL + (255,), outline=suave, width=5 * E)
    # pinza
    d.line([P(246, 236), P(234, 258), P(240, 270)], fill=linea, width=6 * E, joint="curve")
    d.line([P(246, 236), P(260, 256), P(254, 270)], fill=linea, width=6 * E, joint="curve")


MOTIVOS = {"manufactura": motivo_manufactura}


def armar(cfg):
    im = Image.new("RGBA", (W * E, H * E), AZUL + (255,))
    d = ImageDraw.Draw(im, "RGBA")
    # cuadrícula del fondo, como las demás artes
    for x in range(0, W, 40):
        d.line([(x * E, 0), (x * E, H * E)], fill=(10, 100, 172), width=E)
    for y in range(0, H, 40):
        d.line([(0, y * E), (W * E, y * E)], fill=(10, 100, 172), width=E)

    if cfg.get("motivo"):
        capa = Image.new("RGBA", im.size, (0, 0, 0, 0))
        dc = ImageDraw.Draw(capa, "RGBA")
        # panel más oscuro detrás de la ilustración
        dc.rounded_rectangle([(752 * E, 120 * E), (1152 * E, 520 * E)], radius=28 * E, fill=AZUL_OSC + (255,))
        MOTIVOS[cfg["motivo"]](dc, 752, 120, 1.0)
        im.alpha_composite(capa)

    firma = Image.open(RAIZ / "src/assets/img/firma-ucr-blanco.png").convert("RGBA")
    alto = 80 * E
    firma = firma.resize((round(firma.width * alto / firma.height), alto), Image.LANCZOS)
    im.alpha_composite(firma, (64 * E, 84 * E))
    xs = 64 * E + firma.width + 24 * E
    d.line([(xs, 92 * E), (xs, 152 * E)], fill=CELESTE, width=3 * E)
    d.text((xs + 24 * E, 94 * E), "Sede del Caribe", font=f(24), fill=BLANCO)
    d.text((xs + 24 * E, 124 * E), cfg.get("recinto", "Recinto de Limón"), font=f(24), fill=BLANCO)

    y = cfg.get("y", 250)
    d.text((64 * E, y * E), cfg["antetitulo"].upper(), font=f(20), fill=CELESTE)
    y += 40
    tam = cfg.get("tam_titulo", 56)
    for ln in cfg["titulo"]:
        d.text((64 * E, y * E), ln, font=f(tam), fill=BLANCO)
        y += round(tam * 1.22)
    y += 26
    ancho = cfg.get("ancho_recuadros", 640)
    for etq, txt in cfg.get("recuadros", []):
        d.rounded_rectangle([(64 * E, y * E), ((64 + ancho) * E, (y + 86) * E)], radius=12 * E, fill=BLANCO)
        d.text((90 * E, (y + 14) * E), etq.upper(), font=f(18), fill=AZUL)
        d.text((90 * E, (y + 42) * E), txt, font=f(26), fill=TINTA)
        y += 98
    d.rectangle([(64 * E, 716 * E), (160 * E, 722 * E)], fill=CELESTE)
    d.text((64 * E, 738 * E), cfg["pie"], font=f(21, False), fill=BLANCO)

    salida = RAIZ / "src/assets/fotos" / cfg["salida"]
    im.resize((W, H), Image.LANCZOS).convert("RGB").save(salida, optimize=True)
    print("escrito", salida.relative_to(RAIZ))


if __name__ == "__main__":
    armar(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
