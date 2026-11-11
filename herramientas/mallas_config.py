"""Configuración de cada carrera para mallas_planes.py (áreas, ciclos y notas de cada plan)."""
import re

ROM = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
FG_RE = r"^(EG|EF|RP|SR)\b"
NOTA_OFERTA = "Se elige entre la oferta de la Sede para cada ciclo."


def reglas(lista, defecto):
    """lista de (id_area, regex sobre «SIGLA NOMBRE»); gana la primera que coincida."""
    comp = [(a, re.compile(r, re.I)) for a, r in lista]

    def f(c, x):
        t = c["sigla"] + " " + c["nombre"]
        if c["optativo"] and "optativo" in dict(lista):
            return "OPT"
        for a, r in comp:
            if r.search(t):
                return a
        return defecto
    return f


def ciclos_simples(n_bach, tramo_lic="Licenciatura", verano=()):
    def f(cursos):
        orden = []
        for x in cursos:
            if x["ciclo"] not in orden:
                orden.append(x["ciclo"])
        out = []
        for i, n in enumerate(orden):
            d = {"n": n, "anio": i // 2 + 1, "nombre": n + " ciclo", "verano": n in verano}
            if i >= n_bach:
                d["tramo"] = tramo_lic
            out.append(d)
        return out
    return f


FG = {"id": "FG", "nombre": "Formación general", "corto": "Formación general", "paleta": 7,
      "descripcion": "Cursos integrados de humanidades, arte, repertorio, actividad deportiva y seminarios de realidad nacional, comunes a toda la Universidad."}

CARRERAS = {}

# ---------------------------------------------------------------- Turismo
CARRERAS["turismo-ecologico"] = dict(
    id="turismo-ecologico", archivo="turismo.txt", plan="Plan 01", total=142,
    resumen="142 créditos del bachillerato en ocho ciclos, más 300 horas de Trabajo Comunal Universitario.",
    nota_fuente="Fuente: estructura curricular del plan 600310 (Informe Curricular CEA-22-2025).",
    areas=[
        dict(id="ECO", nombre="Ecoturismo y recursos naturales", corto="Ecoturismo", paleta=3,
             descripcion="Biología, ecología, biodiversidad, historia natural, geografía, educación ambiental y los dos cursos de ecoturismo."),
        dict(id="GES", nombre="Gestión y emprendimiento turístico", corto="Gestión turística", paleta=0,
             descripcion="Administración, contabilidad, finanzas, economía, legislación, planificación, reservaciones, emprendimiento y estadística aplicada."),
        dict(id="IDI", nombre="Idiomas", corto="Idiomas", paleta=2,
             descripcion="Inglés progresivo para el servicio turístico y francés para turismo."),
        dict(id="CUL", nombre="Cultura y patrimonio", corto="Cultura y patrimonio", paleta=4,
             descripcion="Historia, multiculturalismo, interpretación del patrimonio, atención y guiado de turistas."),
        dict(id="PRA", nombre="Investigación y práctica profesional", corto="Práctica", paleta=1,
             descripcion="Métodos de investigación aplicada y práctica profesional."),
        FG],
    area_de=reglas([("FG", FG_RE + r"|PI-0044"), ("PRA", r"PRÁCTICA|MÉTODOS DE INVESTIGACIÓN"), ("IDI", r"INGLÉS|FRANCÉS|COMPRENSIÓN AUDITIVA|COMPRENSIÓN DE LECTURA"),
                    ("ECO", r"ECOTUR|ECOLOG|ECODES|BIOLOG|BIODIVERSIDAD|HISTORIA NATURAL|EDUCACIÓN AMBIENTAL|GEOGRAFÍA"), ("CUL", r"PATRIMONIO|MULTICULT|HISTORIA DE COSTA|GUIADO"),
                    ("GES", r".")], "GES"),
    ciclos=ciclos_simples(8), ciclo_de=lambda x: x["ciclo"],
    lista_de=lambda x: "OPT" if x["lista"] and "OPTATIVOS DEL BACHILLERATO" in x["lista"] else None,
    titulo_optativos="Cursos optativos del bachillerato",
    listas_optativos=[dict(id="OPT", titulo="Optativos del bachillerato", nota="Se eligen según el bloque optativo del VIII ciclo.", color_de="ECO")],
    nombres={"TE-0229": "Atención y guiado de turistas", "TE-0230": "Herramientas digitales y tecnológicas aplicadas al turismo",
             "TE-0237": "Gestión de la calidad del servicio turístico", "TE-0238": "Herramientas de gestión y certificaciones turísticas",
             "TE-0406": "Administración de empresas turísticas"},
    notas={"EG-": NOTA_OFERTA, "RP-": NOTA_OFERTA})

# ---------------------------------------------------------------- Dirección de Empresas
CARRERAS["direccion-de-empresas"] = dict(
    id="direccion-de-empresas", archivo="direccion.txt", plan="Plan 2", total=175,
    resumen="175 créditos: 139 del bachillerato (ocho ciclos) y 36 de la licenciatura (dos ciclos).",
    nota_fuente="Fuente: estructura curricular del plan 330102 (Informe Curricular CEA-05-2025). Las siglas que siguen a «o» en los requisitos son cursos equivalentes de otros planes o carreras.",
    areas=[
        dict(id="ADM", nombre="Administración y gerencia", corto="Administración", paleta=0,
             descripcion="Fundamentos de administración, talento humano, operaciones, liderazgo, innovación, calidad, emprendimiento y negociación."),
        dict(id="MKT", nombre="Mercadeo y ventas", corto="Mercadeo", paleta=4,
             descripcion="Principios de mercadeo, publicidad, investigación de mercados, ventas y distribución."),
        dict(id="FIN", nombre="Finanzas, contabilidad y legislación", corto="Finanzas", paleta=1,
             descripcion="Contabilidad, matemática financiera, administración financiera, mercados bursátiles, auditoría, proyectos y legislación."),
        dict(id="CUA", nombre="Métodos cuantitativos y economía", corto="Cuantitativos", paleta=5,
             descripcion="Precálculo, cálculo, estadística, métodos cuantitativos, economía y metodología de la investigación."),
        dict(id="OPT", nombre="Optativos y opcionales", corto="Optativos", paleta=6,
             descripcion="Cursos optativos de la licenciatura y cursos opcionales de inglés para negocios."),
        FG],
    area_de=reglas([("OPT", r"^OPT"), ("FG", FG_RE), ("CUA", r"^(MA|XS|XE)-|MÉTODOS CUANTITATIVOS|METODOLOGÍA DE LA INV|TALLER DE INVESTIGACIÓN|OFIMÁTICAS"),
                    ("MKT", r"MERCADEO|PUBLICIDAD|VENTAS|MERCADOS$|INVESTIGACIÓN DE MERCADOS"),
                    ("FIN", r"^PC-|FINANCIER|BURSÁTILES|AUDITORÍA|LEGISLACI|PROYECTOS"), ("ADM", r".")], "ADM"),
    ciclos=ciclos_simples(8), ciclo_de=lambda x: x["ciclo"],
    lista_de=lambda x: "OPC" if "OPCIONALES" in x["lista"] else ("OPT" if "OPTATIVOS" in x["lista"] else None),
    titulo_optativos="Cursos optativos y opcionales",
    listas_optativos=[dict(id="OPT", titulo="Optativos de la licenciatura", nota="Se eligen cuatro cursos de 3 créditos: dos en el IX ciclo y dos en el X.", color_de="OPT"),
                      dict(id="OPC", titulo="Inglés para administración de negocios (opcional)", nota="No es obligatorio; refuerza la formación en inglés.", color_de="OPT")],
    renombrar={"OPT-III-1": "Inglés opcional (sin créditos)", "OPT-IX-1": "Cursos optativos (12 créditos)", "OPT-X-1": "Cursos optativos (12 créditos)"},
    notas={"EG-": NOTA_OFERTA, "RP-": NOTA_OFERTA, "OPT-III-1": "Espacio para los cursos opcionales de inglés para negocios; no es obligatorio.",
           "OPT-IX-1": "Se eligen cuatro cursos de 3 créditos de la lista de optativos (dos en este ciclo y dos en el siguiente).",
           "OPT-X-1": "Se eligen dos cursos de la lista de optativos."})

# ---------------------------------------------------------------- Enseñanza del Inglés
CARRERAS["ensenanza-del-ingles"] = dict(
    id="ensenanza-del-ingles", archivo="ensenanza.txt", plan="Plan 02", total=142,
    resumen="142 créditos del bachillerato en ocho ciclos, con salida lateral al profesorado al concluir el VI ciclo.",
    nota_fuente="Fuente: malla curricular del plan 320208 (Informe Curricular CEA-59-2024). Al concluir el VI ciclo se puede optar por el título de profesorado (150 horas de TCU); el bachillerato completa las 300.",
    tcu=300,
    areas=[
        dict(id="LEN", nombre="Lengua inglesa", corto="Lengua inglesa", paleta=0,
             descripcion="Inglés integrado, gramática, comunicación oral, composición, comprensión de lectura, retórica y pronunciación."),
        dict(id="LIT", nombre="Literatura y cultura", corto="Literatura", paleta=4,
             descripcion="Narrativa, poesía y drama para la enseñanza del inglés, crítica literaria y comunicación intercultural."),
        dict(id="DID", nombre="Didáctica del inglés y práctica docente", corto="Didáctica", paleta=3,
             descripcion="Metodología de la enseñanza del inglés, materiales didácticos, experiencia docente, investigación y seminario."),
        dict(id="PED", nombre="Formación pedagógica", corto="Pedagogía", paleta=1,
             descripcion="Pedagogía, didáctica, currículum, desarrollo adolescente, psicopedagogía, evaluación y teoría de la educación."),
        FG],
    area_de=reglas([("FG", FG_RE), ("DID", r"METODOLOGÍA DE LA ENSEÑANZA|EXPERIENCIA DOCENTE|SEMINARIO DE ENSEÑANZA|TALLER DE MATERIALES|INVESTIGACIÓN PARA EL MEJORAMIENTO"),
                    ("LIT", r"NARRATIVAS|POESÍA|DRAMA|CRÍTICA|INTERCULTURAL"), ("PED", r"^(FD|OE)-"), ("LEN", r".")], "LEN"),
    ciclos=ciclos_simples(8), ciclo_de=lambda x: x["ciclo"], lista_de=lambda x: None,
    listas_optativos=[], notas={"EG-": NOTA_OFERTA, "RP-": NOTA_OFERTA})

# ---------------------------------------------------------------- Educación Inicial en Inglés
CARRERAS["educacion-inicial-ingles"] = dict(
    id="educacion-inicial-ingles", archivo="inicial.txt", plan="Plan 01", total=136,
    resumen="136 créditos del bachillerato en ocho ciclos, más 300 horas de Trabajo Comunal Universitario.",
    nota_fuente="Fuente: estructura curricular del plan 600135 (Informe Curricular CEA-59-2025, actualizada el 5 de noviembre de 2025).",
    tcu=300,
    areas=[
        dict(id="EDI", nombre="Educación inicial", corto="Educación inicial", paleta=4,
             descripcion="Pedagogía, didáctica, currículo, desarrollo de la niñez, planeamiento, expresión plástica, música y salud mental."),
        dict(id="COM", nombre="Comunicación en inglés", corto="Comunicación en inglés", paleta=0,
             descripcion="Comunicación oral y escrita, laboratorios, fonética, fonología y literatura infantil en inglés."),
        dict(id="DID", nombre="Didáctica del inglés y práctica", corto="Didáctica del inglés", paleta=3,
             descripcion="Didáctica del inglés I y II y experiencia profesional en la enseñanza del inglés en educación inicial."),
        FG],
    area_de=reglas([("FG", FG_RE), ("DID", r"DIDÁCTICA DEL INGLÉS|EXPERIENCIA PROFESIONAL"), ("COM", r"^IO-"), ("EDI", r".")], "EDI"),
    ciclos=ciclos_simples(8), ciclo_de=lambda x: x["ciclo"], lista_de=lambda x: None,
    listas_optativos=[], notas={"EG-": NOTA_OFERTA, "RP-": NOTA_OFERTA})

# ---------------------------------------------------------------- Administración Aduanera
_ADU_AREAS = {
    "ADU": "XP-0241 XP-0301 XP-0527 XP-0502 XP-0602 XP-0503 XP-0603 XP-0259 XP-0260 XP-0261 XP-0265 XP-0314 XP-0315 XP-0316 XP-0317 XP-0318 XP-0319",
    "MER": "XP-0242 XP-0244 XP-0248 XP-0252 XP-0253 XP-0255 XP-0272",
    "COM": "XE-0156 XP-0201 XP-0240 XP-0247 XP-0249 XP-0258 XP-0262 XP-0263 XP-0266 XP-0267 XP-0268 XP-0269 XP-0270 XP-0271 XP-0273",
    "LOG": "XP-0257 XP-0274 XP-0275 XP-0276 XP-0277 XP-0278 XP-0279 XP-0280 XP-0281",
    "GES": "XP-0245 XP-0246 XP-0250 XP-0251 XP-0254 XP-0256 XP-0264 XP-0282 XP-0283 XP-0284 XP-0285 XP-0286 XP-0287 XP-0288 XP-0289",
    "MET": "MA-0001 MA-1021 FL-2075 LM-0348 XP-0243 XP-0312 XP-0313",
}
_ADU_DE = {s: a for a, l in _ADU_AREAS.items() for s in l.split()}
_ENFASIS = {
    "Comercio internacional": "XP-0266 XP-0267 XP-0268 XP-0269 XP-0270 XP-0271 XP-0273",
    "Logística y cadena de abastecimiento": "XP-0274 XP-0275 XP-0276 XP-0277 XP-0278 XP-0279 XP-0280 XP-0281",
    "Gestión de organizaciones de comercio exterior": "XP-0282 XP-0283 XP-0284 XP-0285 XP-0286 XP-0287 XP-0288 XP-0289",
    "Gestión aduanera": "XP-0313 XP-0314 XP-0315 XP-0316 XP-0317 XP-0318 XP-0319",
}
_ADU_NOTAS = {s: "Énfasis en %s." % e.lower() for e, l in _ENFASIS.items() for s in l.split()}
_ADU_NOTAS["XP-0272"] = "Énfasis en comercio internacional y en gestión aduanera."
_ADU_NOTAS["XP-0312"] = "Lo llevan los cuatro énfasis."
_ADU_NOTAS["EG-"] = _ADU_NOTAS["RP-"] = NOTA_OFERTA
_ADU_NOTAS["OPT-VI-1"] = _ADU_NOTAS["OPT-VIII-1"] = _ADU_NOTAS["OPT-X-1"] = "Se elige un curso de la lista de optativos."

CARRERAS["administracion-aduanera"] = dict(
    id="administracion-aduanera", archivo="aduanera.txt", plan="Plan de estudios", total=165,
    resumen="165 créditos: 83 del diplomado (hasta el V ciclo), 135 del bachillerato (hasta el VIII ciclo) y 30 de la licenciatura, que se cursa en uno de cuatro énfasis. En el IX y el X ciclo se muestran los cuatro énfasis; cada estudiante cursa uno.",
    nota_fuente="Fuente: estructura curricular del plan de estudios (Informe Curricular CEA-46-2024). Las siglas que siguen a «o» en los requisitos son cursos equivalentes de planes anteriores.",
    areas=[
        dict(id="ADU", nombre="Derecho, regímenes y gestión aduanera", corto="Gestión aduanera", paleta=0,
             descripcion="Derecho aduanero, regímenes y sus procedimientos, valoración, control y fiscalización, facilitación y los cursos del énfasis en gestión aduanera."),
        dict(id="MER", nombre="Merceología, arancel y origen", corto="Merceología", paleta=3,
             descripcion="Clasificación arancelaria de mercancías, arancel y barreras no arancelarias y normas de origen."),
        dict(id="COM", nombre="Comercio internacional y economía", corto="Comercio internacional", paleta=1,
             descripcion="Economía, comercio multilateral y regional, tratados comerciales, comercio de servicios y los cursos del énfasis en comercio internacional."),
        dict(id="LOG", nombre="Logística y cadena de abastecimiento", corto="Logística", paleta=2,
             descripcion="Introducción a la logística y los cursos del énfasis en logística y cadena de abastecimiento."),
        dict(id="GES", nombre="Gestión, finanzas y mercadeo", corto="Gestión y finanzas", paleta=4,
             descripcion="Organizaciones, planificación, contabilidad, finanzas, mercadeo, proyectos y los cursos del énfasis en gestión de organizaciones de comercio exterior."),
        dict(id="MET", nombre="Métodos, idiomas y análisis de datos", corto="Métodos e idiomas", paleta=5,
             descripcion="Precálculo y cálculo, expresión oral y escrita, inglés, métodos de investigación, análisis de datos y seminario de investigación."),
        dict(id="OPT", nombre="Optativos", corto="Optativos", paleta=6, descripcion="Tres cursos optativos de 3 créditos, uno en el VI ciclo, uno en el VIII y uno en el X."),
        FG],
    area_de=lambda c, x: "OPT" if c["optativo"] else ("FG" if re.match(FG_RE, c["sigla"]) else _ADU_DE.get(c["sigla"], "MET")),
    ciclos=ciclos_simples(8), ciclo_de=lambda x: x["ciclo"], opt_uno=True,
    creditos_ciclo={"IX": 15, "X": 15}, nombre_ciclo={"IX": "IX ciclo · un énfasis", "X": "X ciclo · un énfasis"},
    lista_de=lambda x: "OPT",
    titulo_optativos="Lista de cursos optativos",
    listas_optativos=[dict(id="OPT", titulo="Cursos optativos", nota="Se eligen tres cursos de 3 créditos.", color_de="OPT")],
    nombres={"XP-0260": "TALLER PRÁCTICO", "XP-0318": "POLÍTICA ADUANERA Y GESTIÓN TRIBUTARIA"},
    fijo={"XP-0260": dict(req=["XP-0253", "XP-0255", "XP-0602", "XP-0603", "XP-0252"], req_texto="XP-0501 o XP-0253, XP-0255 o XP-0601, XP-0602, XP-0603, XP-0252 o XP-0105"),
          "XP-0318": dict(req=["XP-0259", "XP-0313", "XP-0314", "XP-0315", "XP-0316"], req_texto="XP-0260 o XP-0702, XP-0259 o XP-0803, XP-0313, XP-0314, XP-0315, XP-0316"),
          "XP-0319": dict(req=["XP-0259", "XP-0314"], req_texto="XP-0264 o XP-0901, XP-0259 o XP-0803, XP-0314")},
    notas=_ADU_NOTAS)

# ---------------------------------------------------------------- Ingeniería Marítima (Marina Civil)
_NAU = "CN-0101 CN-0104 CN-0107 CN-0023 CN-0116 CN-0117 CN-0115 CN-0114 CN-0119 CN-0120 CN-0028 CN-0124 CN-0125"
_MAQ = "CN-0127 CN-0058 CN-0059 CN-0060 CN-0128 CN-0062 CN-0068 CN-0063 CN-0064 CN-0129 CN-0066 CN-0130 CN-0069 CN-0046 CN-0131"
_MAR_AREA = {}
for _a, _l in dict(
    MAT="CN-0005 CN-0002 CN-0118 II-0305",
    BUQ="CN-0100 CN-0102 CN-0103 CN-0105 CN-0108 CN-0016 CN-0071 CN-0126 CN-0106 CN-0109",
    NAV=_NAU, MAQ=_MAQ + " CN-0017",
    ING="CN-0110 CN-0111 CN-0112 CN-0113").items():
    for _s in _l.split():
        _MAR_AREA[_s] = _a


def _mar_area(c, x):
    if c["optativo"]:
        return "OPT"
    if re.match(FG_RE, c["sigla"]):
        return "FG"
    if re.match(r"^(MA|FS|QU)-", c["sigla"]):
        return "MAT"
    return _MAR_AREA.get(c["sigla"], "BUQ")


def _mar_ciclos(cursos):
    anio = {"I": 1, "II": 1, "III": 2, "IV": 2, "V": 2, "VI": 3, "VII": 3, "VIII": 4, "IX": 4, "X": 5, "XI": 5}
    orden = []
    for x in cursos:
        if x["ciclo"] not in orden:
            orden.append(x["ciclo"])
    return [{"n": n, "anio": anio[n], "nombre": n + " ciclo" + (" (interciclo)" if n == "V" else ""), "verano": n == "V"} for n in orden]


_MAR_NOTAS = {s: "Énfasis en Náutica y Transporte Marítimo." for s in _NAU.split()}
_MAR_NOTAS.update({s: "Énfasis en Máquinas Marinas." for s in _MAQ.split()})
_MAR_NOTAS.update({
    "SR-I": "Común a los dos énfasis; en Máquinas Marinas se cursa en el VI ciclo.",
    "SR-II": "Común a los dos énfasis; en Máquinas Marinas se cursa en el VII ciclo.",
    "CN-0106": "Común a los dos énfasis; en Máquinas Marinas se cursa en el VII ciclo.",
    "CN-0109": "Común a los dos énfasis; en Máquinas Marinas se cursa en el VIII ciclo.",
    "CN-0118": "Común a los dos énfasis; en Máquinas Marinas se cursa en el X ciclo.",
    "CN-0126": "Común a los dos énfasis (XI ciclo).",
    "OPT-IX-1": "Énfasis en Náutica y Transporte Marítimo: se elige un curso de la lista de optativos.",
    "OPT-X-1": "Énfasis en Máquinas Marinas: se elige un curso de la lista de optativos.",
    "EG-": NOTA_OFERTA, "RP-": NOTA_OFERTA})

CARRERAS["marina-civil"] = dict(
    id="marina-civil", archivo="maritima.txt", plan="Plan 600004", total=177, tcu=300,
    resumen="177 créditos en el énfasis en Náutica y Transporte Marítimo o 176 en el de Máquinas Marinas, en once ciclos (el V es un interciclo). Los cursos de cada énfasis se señalan en su ficha.",
    nota_fuente="Fuente: estructura curricular del plan de la Licenciatura en Ingeniería Marítima, código 600004 (Informe Curricular CEA-16-2025). Los cursos comunes que cada énfasis cursa en un ciclo distinto se muestran en el ciclo del énfasis en Náutica; la ficha indica el otro.",
    areas=[
        dict(id="MAT", nombre="Ciencias básicas y métodos", corto="Ciencias básicas", paleta=5,
             descripcion="Matemática, física, química, informática, expresión gráfica, probabilidad y estadística y métodos de investigación."),
        dict(id="BUQ", nombre="Buque, seguridad y embarque", corto="Buque y seguridad", paleta=0,
             descripcion="Teoría y sistemas del buque, buques tanque y gaseros, seguridad marítima, legislación y cursos de embarque (OMI)."),
        dict(id="NAV", nombre="Náutica y transporte marítimo", corto="Náutica", paleta=1,
             descripcion="Navegación, maniobras, comunicaciones, reglamentos y señales, meteorología, estiba y prácticas externas del énfasis en Náutica."),
        dict(id="MAQ", nombre="Máquinas marinas y electrotecnia", corto="Máquinas marinas", paleta=3,
             descripcion="Electrotecnia, termodinámica, materiales, motores, propulsión, sistemas auxiliares y prácticas del énfasis en Máquinas Marinas."),
        dict(id="ING", nombre="Inglés marítimo", corto="Inglés marítimo", paleta=2,
             descripcion="Cuatro cursos de inglés marítimo, del interciclo al VIII ciclo."),
        dict(id="OPT", nombre="Optativos", corto="Optativos", paleta=6, descripcion="Un bloque optativo de 2 créditos en cada énfasis."),
        FG],
    area_de=_mar_area, ciclos=_mar_ciclos, ciclo_de=lambda x: x["ciclo"], opt_uno=True,
    creditos_ciclo={"IV": 18, "VI": "17–18", "VII": 16, "VIII": 18, "IX": "16–18", "X": 16, "XI": "16–18"},
    lista_de=lambda x: "OPT", titulo_optativos="Lista de cursos optativos",
    listas_optativos=[dict(id="OPT", titulo="Cursos optativos", nota="Se elige uno de 2 créditos en el bloque optativo de cada énfasis.", color_de="OPT")],
    nombres={"MA-1005": "ECUACIONES DIFERENCIALES", "FS-0311": "LABORATORIO DE FÍSICA GENERAL II", "CN-0123": "EVALUACIÓN DE RIESGOS"},
    fijo={"MA-1005": dict(req=["MA-1002", "MA-1004"], req_texto="MA-1002 o MA-1023 o MA-0292 o MA-0232, MA-1004 o MA-0294 o MA-0232"),
          "FS-0310": dict(req=["FS-0210", "FS-0211", "MA-1002"], req_texto="FS-0210, FS-0211, MA-1002 o MA-2210 o MA-0350"),
          "FS-0311": dict(req=["FS-0210", "FS-0211", "MA-1002"], req_texto="FS-0210 o FS-0227, FS-0211, MA-1002 o MA-2210 o MA-0350",
                          coreq=["FS-0310"], coreq_texto="FS-0310 o FS-0327"),
          "CN-0126": dict(req=["CN-0071"], req_texto="CN-0071")},
    notas=_MAR_NOTAS)

# ---------------------------------------------------------------- Bachillerato en Inglés (fascículo del SAE)
CARRERAS["ingles"] = dict(
    id="ingles", archivo="ingles.txt", sae=True, equiv_lista=True, plan="Plan 3", total=140,
    resumen="140 créditos del bachillerato en ocho ciclos, con seis bloques optativos de 3 créditos.",
    nota_fuente="Fuente: fascículo del Sistema de Aplicaciones Estudiantiles (SAE) del plan 3 del Bachillerato en Inglés, código 120303 (resolución VD-R-10013-2018). Las siglas que siguen a «Equiv.:» son cursos equivalentes de planes anteriores.",
    areas=[
        dict(id="LEN", nombre="Lengua inglesa", corto="Lengua inglesa", paleta=0,
             descripcion="Inglés integrado, gramática, comunicación oral, composición, comprensión de lectura, técnicas de comunicación y pronunciación y retórica."),
        dict(id="LIT", nombre="Literatura en inglés", corto="Literatura", paleta=4,
             descripcion="Introducción a la literatura, narrativa, drama, poesía y panoramas de las literaturas británica y norteamericana, literatura de la Commonwealth y crítica literaria."),
        dict(id="LIN", nombre="Lingüística y comunicación intercultural", corto="Lingüística", paleta=2,
             descripcion="Introducción a la lingüística y comunicación intercultural."),
        dict(id="OPT", nombre="Optativos", corto="Optativos", paleta=6,
             descripcion="Seis bloques optativos de 3 créditos: traducción, literatura, francés y otros cursos de la lista."),
        FG],
    area_de=lambda c, x: "OPT" if c["optativo"] else ("FG" if re.match(FG_RE, c["sigla"]) else
            "LIN" if c["sigla"] in ("FL-3168", "LM-1481") else
            "LIT" if c["sigla"] in ("LM-1237", "LM-1220", "LM-1222", "LM-1366", "LM-1485", "LM-1221", "LM-0364", "LM-1486") else "LEN"),
    ciclos=ciclos_simples(99), ciclo_de=lambda x: x["ciclo"],
    lista_de=lambda x: "OPT", titulo_optativos="Lista de cursos optativos",
    listas_optativos=[dict(id="OPT", titulo="Cursos optativos", nota="En cada ciclo desde el III se elige un curso de esta lista, para un total de seis.", color_de="OPT")],
    nombre_opt="Optativo de Inglés", req_extra={"LM-1472": ["LM-1361", "LM-1362"]},
    notas={"EG-": NOTA_OFERTA, "RP-": NOTA_OFERTA, "OPT-III-1": "Se elige un curso de la lista de optativos."})

# ---------------------------------------------------------------- Licenciatura en Ingeniería Química (fascículo del SAE, transcrito)
# El fascículo de este plan trae filas de dos líneas con los requisitos desalineados; se transcribió y se comprobó
# contra «Créditos ciclo N» del propio fascículo (19, 18, 19, 20, 19, 18, 17, 16, 16, 12; total 174).
# Formato: ciclo | sigla | créditos | nombre | requisitos | correquisitos
_IQ = """
1|EG-|2|CURSO DE ARTE||
1|EG-I|6|CURSO INTEGRADO DE HUMANIDADES I||
1|LM-1030|4|ESTRATEGIAS DE LECTURA EN INGLÉS I (PARA OTRAS CARRERAS)||
1|MA-0001|0|PRECÁLCULO||
1|MA-1001|3|CÁLCULO I|MA-0001|
1|QU-0100|3|QUÍMICA GENERAL I||QU-0101
1|QU-0101|1|LABORATORIO DE QUÍMICA GENERAL I||QU-0100
2|EF-|0|ACTIVIDAD DEPORTIVA||
2|EG-II|6|CURSO INTEGRADO DE HUMANIDADES II|EG-I|
2|FS-0210|3|FÍSICA GENERAL I|MA-1001 Equiv.: MA-0250 o MA-1210 o MA-1101|FS-0211
2|FS-0211|1|LABORATORIO DE FÍSICA GENERAL I|MA-1001 Equiv.: MA-0250 o MA-1210 o MA-1101|FS-0210 Equiv.: FS-0227
2|MA-1002|4|CÁLCULO II|MA-1001 Equiv.: MA-1101|
2|QU-0102|3|QUÍMICA GENERAL II|QU-0100; QU-0101|QU-0103
2|QU-0103|1|LABORATORIO DE QUÍMICA GENERAL II|QU-0100; QU-0101|QU-0102
3|FS-0310|3|FÍSICA GENERAL II|FS-0210; FS-0211; MA-1002 Equiv.: MA-0350 o MA-2210|FS-0311
3|FS-0311|1|LABORATORIO DE FÍSICA GENERAL II|FS-0210 Equiv.: FS-0227; FS-0211; MA-1002 Equiv.: MA-2210 o MA-0350|FS-0310 Equiv.: FS-0327
3|IQ-0200|3|ANÁLISIS GRÁFICO PARA INGENIERÍA QUÍMICA|FS-0210; MA-1002; QU-0102|
3|MA-1003|4|CÁLCULO III|MA-1002|MA-1004 Equiv.: MA-0307
3|MA-1004|3|ÁLGEBRA LINEAL||
3|QU-0200|3|QUÍMICA ANALÍTICA CUANTITATIVA I|QU-0102 Equiv.: QU-0114; QU-0103 Equiv.: QU-0115|QU-0201
3|QU-0201|2|LABORATORIO DE QUÍMICA ANALÍTICA CUANTITATIVA|QU-0102 Equiv.: QU-0114; QU-0103 Equiv.: QU-0115|QU-0200
4|CI-0202|4|PRINCIPIOS DE INFORMÁTICA|MA-0205 Equiv.: MA-0225 o MA-0230 o MA-1001 o MA-1210 o MA-1101|
4|FS-0410|3|FÍSICA GENERAL III|FS-0310; FS-0311; MA-1003 Equiv.: MA-0450|FS-0411
4|FS-0411|1|LABORATORIO DE FÍSICA GENERAL III|FS-0310 Equiv.: FS-0327; FS-0311; MA-0450 Equiv.: MA-1003|FS-0410 Equiv.: FS-0427
4|IQ-0332|4|ANÁLISIS DE PROCESOS I|FS-0310; IQ-0200|
4|MA-1005|4|ECUACIONES DIFERENCIALES|MA-1002 Equiv.: MA-1023 o MA-0292 o MA-0232; MA-1004 Equiv.: MA-0294 o MA-0232|
4|QU-0260|4|FÍSICO QUÍMICA PARA INGENIERÍA QUÍMICA|FS-0310; FS-0311; MA-1002; QU-0102; QU-0103|
5|IQ-0312|4|MECÁNICA I|FS-0210; FS-0211; MA-1003; MA-1004|
5|IQ-0333|3|ANÁLISIS DE PROCESOS II|CI-0202; IQ-0332; MA-1003; MA-1005|
5|IQ-0334|3|TERMODINÁMICA I|IQ-0332; MA-1005; QU-0260|
5|QU-0212|4|QUÍMICA ORGÁNICA GENERAL I|QU-0102; QU-0103|QU-0213
5|QU-0213|1|LABORATORIO DE QUÍMICA ORGÁNICA GENERAL I|QU-0102; QU-0103|QU-0212
5|XS-0217|4|PROBABILIDADES E INFERENCIA ESTADÍSTICA|MA-0303 Equiv.: MA-1004 o MA-0325 o MA-1005|
6|IE-0303|3|ELECTROTECNIA I|FS-0310; FS-0311; MA-1003|
6|IQ-0313|4|FENÓMENOS DE TRANSFERENCIA|IQ-0333; IQ-0334|
6|IQ-0331|3|MEDICIÓN Y TRATAMIENTO DE DATOS EXPERIMENTALES|FS-0410; FS-0411; IQ-0332; QU-0201; XS-0217|
6|IQ-0335|3|TERMODINÁMICA II|CI-0202; IQ-0334; MA-1003; QU-0212|
6|QU-0214|4|QUÍMICA ORGÁNICA GENERAL II|QU-0212; QU-0213|QU-0215
6|QU-0215|1|LABORATORIO DE QUÍMICA ORGÁNICA GENERAL II|QU-0212; QU-0213|QU-0214
7|IQ-0415|3|INGENIERÍA DE LOS MATERIALES|IQ-0312; IQ-0335|
7|IQ-0423|3|OPERACIONES DE TRANSFERENCIA DE FLUIDOS Y CALOR|IQ-0313|IQ-0432
7|IQ-0432|3|LABORATORIO DE OPERACIONES DE TRANSFERENCIA DE FLUIDOS Y CALOR|IQ-0313; IQ-0331|IQ-0423
7|IQ-0451|3|PLANEAMIENTO DE LA PRODUCCIÓN|XS-0217 Equiv.: XS-0215|
7|OPT-|3|BLOQUE OPTATIVO||
7|SR-I|2|SEMINARIO DE REALIDAD NACIONAL I|EG-II|
8|IQ-0416|3|CINÉTICA Y REACTORES QUÍMICOS|IQ-0415; IQ-0423; QU-0214|
8|IQ-0424|3|OPERACIONES POR SEPARACIÓN DE FASES|IQ-0335; IQ-0423|IQ-0433
8|IQ-0433|2|LABORATORIO DE OPERACIONES POR SEPARACIÓN DE FASES|IQ-0335; IQ-0432; QU-0215|IQ-0424
8|IQ-0452|3|CONTROL DE LA PRODUCCIÓN|IQ-0451|
8|RP-|3|REPERTORIO||
8|SR-II|2|SEMINARIO DE REALIDAD NACIONAL II|SR-I|
9|IQ-0517|3|CONTROL E INSTRUMENTACIÓN DE PROCESOS|IE-0303; IQ-0416; IQ-0424; IQ-0433|
9|IQ-0525|3|OPERACIONES DE SEPARACIÓN POR MÉTODOS DIFUSIONALES|IQ-0424|IQ-0534
9|IQ-0534|2|LABORATORIO DE OPERACIONES DE SEPARACIÓN POR MÉTODOS DIFUSIONALES|IQ-0424; IQ-0433|IQ-0525
9|IQ-0553|3|EVALUACIÓN DE PROYECTOS|IQ-0424; IQ-0452|
9|IQ-0590|2|SEMINARIO PARA PROYECTOS DE GRADUACIÓN|IQ-0424; IQ-0452|IQ-0553
9|OPT-|3|BLOQUE OPTATIVO||
10|IQ-0526|3|PROCESOS Y OPERACIONES INTEGRADAS|IQ-0525; IQ-0553|
10|IQ-0551|3|DISEÑO DE PROCESOS QUÍMICOS|IQ-0416; IQ-0525; IQ-0553|
10|IQ-0556|3|PRINCIPIOS DE ADMINISTRACIÓN INDUSTRIAL|IQ-0525; IQ-0553|
10|IQ-9500|0|INVESTIGACIÓN DIRIGIDA I|IQ-0590|
10|IQ-9700|0|PRÁCTICA DIRIGIDA I||
10|IQ-9800|0|PROYECTO DE GRADUACIÓN I||
10|OPT-|3|BLOQUE OPTATIVO||
11|IQ-9501|0|INVESTIGACIÓN DIRIGIDA II|IQ-9500|
11|IQ-9701|0|PRÁCTICA DIRIGIDA II|IQ-9700|
11|IQ-9801|0|PROYECTO DE GRADUACIÓN II|IQ-9800|
12|IQ-9502|0|INVESTIGACIÓN DIRIGIDA III|IQ-9501|
12|IQ-9702|0|PRÁCTICA DIRIGIDA III|IQ-9701|
12|IQ-9802|0|PROYECTO DE GRADUACIÓN III|IQ-9801|
"""


def _iq_fuente():
    import plan_sae
    from mallas_planes import RAIZ
    import os
    cursos = []
    for l in _IQ.strip().split("\n"):
        ci, sg, cr, nom, rq, co = l.split("|")
        cursos.append(dict(sigla=sg, nombre=nom, ciclo=ROM[int(ci) - 1], lista=None, bloque="", cred=int(cr), req=rq, coreq=co))
    lista, _ = plan_sae.parse(os.path.join(RAIZ, "herramientas", "fuentes", "planes", "quimica.txt"))
    cursos += [c for c in lista if c["lista"]]
    return cursos, {}


CARRERAS["ingenieria-quimica"] = dict(
    id="ingenieria-quimica", fuente=_iq_fuente, sae=True, plan="Plan de 2003", total=174, tcu=300,
    resumen="174 créditos de la licenciatura en diez ciclos, más dos ciclos finales de trabajo final de graduación sin créditos y tres bloques optativos de 3 créditos.",
    nota_fuente="Fuente: fascículo del Sistema de Aplicaciones Estudiantiles (SAE) del plan de 2003 de la Licenciatura en Ingeniería Química, código 420501 (última actualización: resolución 7289-2003). Las siglas que siguen a «Equiv.:» son cursos equivalentes de planes anteriores.",
    areas=[
        dict(id="MAT", nombre="Matemática, estadística e informática", corto="Matemática", paleta=5,
             descripcion="Precálculo, cálculo, álgebra lineal, ecuaciones diferenciales, probabilidades e inferencia estadística y principios de informática."),
        dict(id="FIS", nombre="Física y electrotecnia", corto="Física", paleta=3,
             descripcion="Física general I a III con sus laboratorios y electrotecnia."),
        dict(id="QUI", nombre="Química", corto="Química", paleta=2,
             descripcion="Química general, analítica, orgánica y físico química, con sus laboratorios."),
        dict(id="ING", nombre="Ingeniería de procesos", corto="Ingeniería de procesos", paleta=0,
             descripcion="Análisis de procesos, termodinámica, fenómenos de transferencia, operaciones unitarias, reactores, control y diseño de procesos."),
        dict(id="GES", nombre="Gestión de la producción y proyectos", corto="Gestión", paleta=1,
             descripcion="Planeamiento y control de la producción, evaluación de proyectos y administración industrial."),
        dict(id="GRA", nombre="Trabajo final de graduación", corto="Graduación", paleta=4,
             descripcion="Seminario para proyectos de graduación y las modalidades de investigación dirigida, práctica dirigida y proyecto de graduación (sin créditos)."),
        dict(id="OPT", nombre="Optativos", corto="Optativos", paleta=6,
             descripcion="Tres bloques optativos de 3 créditos, con cursos de procesos, alimentos, materiales, ambiente, calidad y gestión."),
        FG],
    area_de=lambda c, x: "OPT" if c["optativo"] else ("FG" if re.match(FG_RE, c["sigla"]) or c["sigla"] == "LM-1030" else
            "GRA" if c["sigla"] == "IQ-0590" or c["sigla"].startswith("IQ-9") else
            "GES" if c["sigla"] in ("IQ-0451", "IQ-0452", "IQ-0553", "IQ-0556") else
            "ING" if c["sigla"].startswith("IQ-") else
            "QUI" if c["sigla"].startswith("QU-") else
            "FIS" if c["sigla"].startswith(("FS-", "IE-")) else "MAT"),
    ciclos=ciclos_simples(99), ciclo_de=lambda x: x["ciclo"], nombre_opt="Bloque optativo",
    lista_de=lambda x: "OPT", titulo_optativos="Lista de cursos optativos",
    listas_optativos=[dict(id="OPT", titulo="Cursos optativos", nota="Se eligen tres cursos de 3 créditos: uno en el VII ciclo, uno en el IX y uno en el X.", color_de="OPT")],
    fijo={"XS-0217": dict(req=[])},
    notas={"EG-": NOTA_OFERTA, "RP-": NOTA_OFERTA, "IQ-9500": "Las tres modalidades de graduación se detallan en el plan; se cursa una.", "XS-0217": "El requisito oficial usa equivalencias de planes anteriores; revise la ficha.",
           "OPT-VII-1": "Se elige un curso de la lista de optativos.", "OPT-IX-1": "Se elige un curso de la lista de optativos.", "OPT-X-1": "Se elige un curso de la lista de optativos."})
