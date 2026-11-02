#!/usr/bin/env python3
"""Genera los dibujos SVG del sitio en src/assets/img/.

ola-linea.svg    línea ondulada fina (se usa como máscara: toma el color del CSS)
ola-borde.svg    borde ondulado relleno para el inicio de una franja de color (máscara)
hoja.svg         hoja de banano con sus nervaduras paralelas, para marcas de agua (máscara)
hoja-mini.svg    hoja pequeña para viñetas de la línea de tiempo (máscara)
"""
import math
from pathlib import Path

IMG = Path(__file__).resolve().parent.parent / "src" / "assets" / "img"


def guardar(nombre, cuerpo, vb):
    (IMG / nombre).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{cuerpo}</svg>\n', encoding="utf-8")


# Ola: un período de 120 de ancho; los extremos coinciden en altura y pendiente, así se repite sin costura
guardar("ola-linea.svg", '<path d="M0 6C20 1 40 1 60 6S100 11 120 6" fill="none" stroke="#000" stroke-width="1.6"/>', "0 0 120 12")
# Ola de trazo grueso para tamaños pequeños (subrayados de títulos y separadores cortos)
guardar("ola-titulo.svg", '<path d="M0 6C20 1 40 1 60 6S100 11 120 6" fill="none" stroke="#000" stroke-width="4.2"/>', "0 0 120 12")
guardar("ola-borde.svg", '<path d="M0 9C20 2 40 2 60 9S100 16 120 9V18H0Z"/>', "0 0 120 18")


def hoja(ancho, largo, nervaduras, grosor):
    """Hoja de banano: contorno alargado, nervadura central curva y nervaduras laterales paralelas."""
    cx = ancho / 2
    contorno = (f"M{cx} 4C{ancho * .92} {largo * .12} {ancho * .98} {largo * .62} {cx + 2} {largo - 4}"
                f"C{ancho * .04} {largo * .6} {ancho * .1} {largo * .14} {cx} 4Z")
    partes = [f'<defs><clipPath id="c"><path d="{contorno}"/></clipPath></defs>',
              f'<path d="{contorno}" fill="none" stroke="#000" stroke-width="{grosor}"/>',
              f'<path d="M{cx} 8Q{cx + 6} {largo / 2} {cx + 2} {largo - 8}" fill="none" stroke="#000" stroke-width="{grosor}"/>',
              '<g clip-path="url(#c)">']
    for i in range(1, nervaduras):
        t = i / nervaduras
        y = 8 + t * (largo - 20)
        mitad = math.sin(math.pi * min(1, t * 1.08)) * ancho * .5  # media anchura de la hoja a esa altura
        xc = cx + 6 * math.sin(math.pi * t)
        caida = mitad * .55
        partes.append(f'<path d="M{xc:.1f} {y:.1f}Q{xc + mitad * .5:.1f} {y - caida * .35:.1f} {xc + mitad * .92:.1f} {y - caida:.1f}'
                      f'M{xc:.1f} {y:.1f}Q{xc - mitad * .5:.1f} {y - caida * .35:.1f} {xc - mitad * .92:.1f} {y - caida:.1f}" '
                      f'fill="none" stroke="#000" stroke-width="{grosor * .6:.2f}"/>')
    partes.append("</g>")
    return "".join(partes)


guardar("hoja.svg", hoja(200, 560, 30, 2.2), "0 0 200 560")
guardar("hoja-mini.svg", '<path d="M8 1C15 6 15 17 8 23C1 17 1 6 8 1Z"/><path d="M8 4V21" stroke="#fff" stroke-width="1.2"/>', "0 0 16 24")
# Versiones con color fijo, para fondos sobre las franjas azules (no dependen del tema)
guardar("ola-celeste.svg", '<path d="M0 6C20 1 40 1 60 6S100 11 120 6" fill="none" stroke="#00C0F3" stroke-width="1.6"/>', "0 0 120 12")
guardar("hoja-blanca.svg", '<g opacity=".13">' + hoja(200, 560, 30, 2.2).replace('stroke="#000"', 'stroke="#fff"') + "</g>", "0 0 200 560")
print("Dibujos generados en", IMG)
