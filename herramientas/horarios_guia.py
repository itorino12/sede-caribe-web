#!/usr/bin/env python3
"""Convierte la «Guía de Cursos y Horarios» (Registro e Información, PDF) en datos para el sitio y para el congo.

Uso:
    python3 herramientas/horarios_guia.py [guia.pdf] [--texto salida.txt]

- Escribe src/data/horarios-iic-2026.json (sin profesores): lo usa «Aulas y laboratorios» para el buscador
  «¿En qué aula es mi curso?». Es un dato solo del repositorio (como aulas.json); no va a la hoja de Drive.
- Con --texto escribe además una línea completa por grupo, con profesor y notas, para subir a la carpeta del congo.
- Al cambiar de ciclo: poner la guía nueva en herramientas/fuentes/, ajustar CICLO y volver a correr.
"""
import json, re, subprocess, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CICLO = "II ciclo 2026"
SALIDA = RAIZ / "src" / "data" / "horarios-iic-2026.json"
DIA = {"L": "lunes", "K": "martes", "M": "miércoles", "J": "jueves", "V": "viernes", "S": "sábado", "D": "domingo"}


def leer(pdf):
    t = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    meta = {"generado": (re.search(r"Datos generados el:\s*(\S+)", t) or [None, ""])[1],
            "version": (re.search(r"Versión:\s*(\d+)", t) or [None, ""])[1]}
    cursos, c, g, esc = [], None, None, None
    for ln in t.splitlines():
        s = ln.strip()
        if not s or re.fullmatch(r"Página \d+", s):
            continue
        m = re.match(r"Recinto:.*?Escuela:\s*(.*)$", s)
        if m:
            esc = m.group(1).strip(); continue
        m = re.match(r"Sigla:\s*(\S+)\s*-\s*(.*)$", s)
        if m:
            c = {"sigla": m.group(1), "nombre": m.group(2).strip(), "escuela": esc, "req": "", "cor": "", "tipo": "", "cred": "", "grupos": []}
            cursos.append(c); g = None; continue
        if c is None:
            continue
        for k, pat in (("req", "Requisitos:"), ("cor", "Correquisitos:"), ("tipo", "Tipo curso:"), ("cred", "Créditos:")):
            if s.startswith(pat):
                c[k] = s[len(pat):].strip(); break
        else:
            m = re.match(r"Grupo:\s*(\S+?)\.\s*Modalidad:\s*(.*?)\s*Profesor:\s*$", s)
            if m:
                mod = m.group(2).strip(); cerrado = "CERRADO" in mod
                g = {"grupo": m.group(1), "modalidad": re.sub(r"\s*\*+\s*CERRADO\s*\*+", "", mod).strip(), "cerrado": cerrado, "horas": [], "prof": "", "notas": []}
                c["grupos"].append(g); continue
            if s.startswith("Día y Hora"):
                continue
            m = re.match(r"([LKMJVSD](?:,[LKMJVSD])*)\s+(\d\d:\d\d) a (\d\d:\d\d)\s*(.*)$", s)
            if m and g is not None:
                aula = re.match(r"(\d{4}|-)", m.group(4))
                a = aula.group(1) if aula else ""
                a = "" if a in ("", "-") else str(int(a))
                g["horas"].append({"dias": [DIA[x] for x in m.group(1).split(",")], "inicio": m.group(2), "fin": m.group(3), "aula": a}); continue
            if s.startswith("PROF") and g is not None:
                g["prof"] = s; continue
            if g is not None and g["prof"] and not s.isupper():
                g["prof"] += " " + s; continue
            if g is not None:
                g["notas"].append(s); continue
            print("SIN CLASIFICAR:", repr(s), file=sys.stderr)
    return meta, cursos


MENORES = {"de", "del", "la", "las", "los", "el", "y", "e", "o", "u", "en", "a", "al", "con", "para", "por", "un", "una", "su", "sus"}
SIGLAS = {"TIC", "TI", "SQL", "UCR", "SINAES", "PHP", "TCU", "UX", "IA", "WEB"}


def bonito(nombre):
    """MAYÚSCULAS de la guía -> oración, respetando números romanos y siglas conocidas (p. ej. «Desarrollo de Software II»)."""
    out = []
    for i, w in enumerate(nombre.split()):
        corte = re.match(r"^([^\wÁÉÍÓÚÜÑáéíóúüñ]*)(.*?)([^\wÁÉÍÓÚÜÑáéíóúüñ]*)$", w)
        a, n, z = corte.groups()
        if re.fullmatch(r"[IVX]{1,4}", n) or n.upper() in SIGLAS or any(ch.isdigit() for ch in n):
            n2 = n.upper()
        elif i and n.lower() in MENORES:
            n2 = n.lower()
        else:
            n2 = n.lower() if i else n.capitalize()
        out.append(a + n2 + z)
    return " ".join(out)


def para_sitio(meta, cursos):
    return {"ciclo": CICLO, "version": meta["version"], "generado": meta["generado"],
            "fuente": "Guía de Cursos y Horarios, Recinto de Limón, Oficina de Registro e Información (UCR)",
            "cursos": [{"sigla": c["sigla"], "nombre": bonito(c["nombre"]), "escuela": bonito(c["escuela"]),
                        "grupos": [{"grupo": g["grupo"], "modalidad": g["modalidad"], "cerrado": g["cerrado"], "horas": g["horas"]} for g in c["grupos"]]}
                       for c in cursos]}


def texto(meta, cursos):
    o = [f"GUÍA DE CURSOS Y HORARIOS — SEDE REGIONAL DEL CARIBE, RECINTO DE LIMÓN\nSemestral ordinaria 2-2026 ({CICLO} lectivo). Fuente: Oficina de Registro e Información, Vicerrectoría de Vida Estudiantil, UCR. "
         f"Datos generados el {meta['generado']}, versión {meta['version']}. Aulas: «0018 RL» es el aula 0018 del Recinto Regional de Limón. El código de aula 9999 aparece en la guía sin explicación.\n"]
    for c in cursos:
        o.append(f"CURSO {c['sigla']} {c['nombre']} — Escuela: {c['escuela']}. Créditos: {c['cred']}. Requisitos: {c['req'] or '-'}. Correquisitos: {c['cor'] or '-'}. Tipo: {c['tipo']}.")
        for g in c["grupos"]:
            h = "; ".join(" y ".join(x["dias"]) + f" {x['inicio']} a {x['fin']}" + (f" en aula {x['aula']}" if x["aula"] else " (sin aula indicada)") for x in g["horas"]) or "sin horario"
            p = re.sub(r"^PROF\.?\s*", "", g["prof"]).strip() or "no indicado"
            o.append(f"  {c['sigla']} {c['nombre']}, grupo {g['grupo']}, modalidad {g['modalidad']}{' (CERRADO)' if g['cerrado'] else ''}: {h}. Profesor(a): {p}."
                     + (" Nota de la guía: " + "; ".join(g["notas"]) + "." if g["notas"] else ""))
        o.append("")
    return "\n".join(o)


if __name__ == "__main__":
    resto = sys.argv[1:]
    if "--texto" in resto:
        del resto[resto.index("--texto"):resto.index("--texto") + 2]
    args = [a for a in resto if not a.startswith("--")]
    pdf = Path(args[0]) if args else RAIZ / "herramientas" / "fuentes" / "guia-horarios-limon-2-2026.pdf"
    meta, cursos = leer(pdf)
    SALIDA.write_text(json.dumps(para_sitio(meta, cursos), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(cursos)} cursos, {sum(len(c['grupos']) for c in cursos)} grupos -> {SALIDA.relative_to(RAIZ)}")
    if "--texto" in sys.argv:
        Path(sys.argv[sys.argv.index("--texto") + 1]).write_text(texto(meta, cursos), encoding="utf-8")
