#!/usr/bin/env python3
"""Genera los dibujos SVG del sitio en src/assets/img/.

ola-linea.svg    línea ondulada fina (se usa como máscara: toma el color del CSS)
ola-borde.svg    borde ondulado relleno para el inicio de una franja de color (máscara)
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


# Versión con color fijo, para fondos sobre las franjas azules (no depende del tema)
guardar("ola-celeste.svg", '<path d="M0 6C20 1 40 1 60 6S100 11 120 6" fill="none" stroke="#00C0F3" stroke-width="1.6"/>', "0 0 120 12")
print("Dibujos generados en", IMG)
