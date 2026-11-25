"""Módulo 2: búsqueda híbrida con umbral, solo sobre documentos vigentes."""
from conftest import HTML_MUESTRA, docx_muestra, pdf_muestra, xlsx_muestra
from congo.servicios.recuperacion import Recuperacion


def poblar(repo):
    repo.incorporar("Reglamento de matrícula.pdf", pdf_muestra(), {"categoria": "normativa", "subcategoria": "matricula"})
    repo.incorporar("Becas.docx", docx_muestra(), {"categoria": "institucional", "subcategoria": "becas"})
    repo.incorporar("Horarios.xlsx", xlsx_muestra(), {"categoria": "institucional", "subcategoria": "horarios"})
    repo.incorporar("Admisión.html", HTML_MUESTRA, {"categoria": "institucional", "subcategoria": "admision"})
    return Recuperacion(repo.registro, repo.embebedor, repo.vectores, umbral=0.2)


def test_encuentra_el_documento_correcto(repo):
    rec = poblar(repo)
    h = rec.buscar("¿Cómo solicito matrícula extraordinaria?")
    assert h and h[0].fragmento["nombre"] == "Reglamento de matrícula"
    assert h[0].fragmento["seccion"] == "Artículo 3" and h[0].fragmento["pagina"] == 2
    assert rec.buscar("horario de la biblioteca")[0].fragmento["hoja"] == "Horarios"


def test_sin_resultados_bajo_el_umbral(repo):
    rec = poblar(repo)
    assert rec.buscar("receta de pan casero con levadura") == []
    assert rec.confianza([]) == "none"


def test_filtro_de_categoria_y_vigencia(repo):
    rec = poblar(repo)
    assert all(h.fragmento["categoria"] == "normativa" for h in rec.buscar("matrícula becas", categoria="normativa"))
    doc = next(d for d in repo.registro.listar() if d["subcategoria"] == "matricula")
    repo.cambiar_vigencia(doc["id"], "derogado")
    assert all(h.fragmento["doc_id"] != doc["id"] for h in rec.buscar("matrícula extraordinaria"))


def test_la_pagina_del_sitio_no_queda_tapada_por_los_reglamentos(repo):
    """«director» aparece en todos los reglamentos: sin la búsqueda solo institucional, la página quedaba fuera."""
    from congo.documentos.extractores import Bloque
    for i in range(30):
        repo.incorporar_bloques({"id": f"reg-{i}", "nombre": f"Reglamento del instituto {i}", "categoria": "normativa"},
                                [Bloque("El director del instituto convoca al consejo. El director preside. " * 3,
                                        seccion=f"Artículo {i}")], f"h{i}")
    repo.incorporar_bloques({"id": "sitio-direccion", "nombre": "Dirección de la Sede", "categoria": "institucional"},
                            [Bloque("La Dirección conduce la Sede y coordina sus cinco áreas.", seccion="Dirección de la Sede"),
                             Bloque("Director Ing. Walter Anderson Rivera, MBA. Teléfono 2511-7303.", seccion="Contacto")],
                            "hd")
    rec = Recuperacion(repo.registro, repo.embebedor, repo.vectores, umbral=0.2)
    h = rec.buscar("¿Quién es el director de la Sede?")
    assert any("Walter Anderson" in x.fragmento["texto"] for x in h)
    d = rec.diagnostico("¿Quién es el director de la Sede?")
    assert d["umbral"] == 0.2 and d["por_significado"] and d["por_palabras"]


def test_pagina_con_todos_los_terminos_entra_aunque_el_significado_puntue_bajo(repo):
    """«¿Cómo solicito una beca?» sacaba 0,06 por significado contra «Solicitud y renovación» de Becas."""
    from congo.documentos.extractores import Bloque
    repo.incorporar_bloques({"id": "sitio-becas", "nombre": "Becas", "categoria": "institucional"},
                            [Bloque("La solicitud y la renovación se gestionan en el sistema de la OBAS.",
                                    seccion="Solicitud y renovación")], "hb")
    rec = Recuperacion(repo.registro, repo.embebedor, repo.vectores, umbral=0.99)  # nada pasa por significado
    assert [h.fragmento["doc_id"] for h in rec.buscar("¿Cómo solicito una beca?")] == ["sitio-becas"]
    assert rec.buscar("¿Cómo renuevo el pasaporte?") == []  # «pasaporte» no está: no basta un término
    assert rec.buscar("beca") == []  # un solo término no alcanza


def _pagina_de_carreras(repo, cuantas=13):
    from congo.documentos.extractores import Bloque
    nombres = [f"Carrera número {i}" for i in range(cuantas)]
    repo.incorporar_bloques({"id": "sitio-carreras", "nombre": "Carreras y planes de estudio", "categoria": "institucional"},
                            [Bloque(f"{n} (Bachillerato). " + "Se imparte en Limón con su plan de estudios. " * 8, seccion=n)
                             for n in nombres], "hc")
    return nombres


def test_una_lista_trae_todos_los_elementos_de_la_pagina(repo):
    """Regresión: «¿qué carreras ofrece?» nombraba 2 porque el cupo del sitio era de 2 fragmentos."""
    nombres = _pagina_de_carreras(repo)
    rec = Recuperacion(repo.registro, repo.embebedor, repo.vectores, umbral=-1.0)
    texto = " ".join(h.fragmento["texto"] for h in rec.buscar("¿Qué carreras ofrece la Sede?"))
    assert all(n in texto for n in nombres)


def test_los_trozos_vecinos_de_la_pagina_que_responde_entran_aunque_su_similitud_sea_baja(repo):
    nombres = _pagina_de_carreras(repo, 8)
    # umbral imposible: solo entra por la regla de palabras (todos los términos en un fragmento)
    rec = Recuperacion(repo.registro, repo.embebedor, repo.vectores, umbral=0.99)
    h = rec.buscar("carrera número 3 bachillerato")
    assert len(h) > 2 and any(nombres[3] in x.fragmento["texto"] for x in h)
    assert len(h) <= 16  # MAX_SITIO


def test_la_lista_del_sitio_no_deja_sin_lugar_a_los_reglamentos(repo):
    from congo.documentos.extractores import Bloque
    _pagina_de_carreras(repo, 13)
    for i in range(6):
        repo.incorporar_bloques({"id": f"reg-{i}", "nombre": f"Reglamento de carreras {i}", "categoria": "normativa"},
                                [Bloque("Las carreras que ofrece la universidad se rigen por este reglamento. " * 3,
                                        seccion=f"Artículo {i}")], f"hr{i}")
    rec = Recuperacion(repo.registro, repo.embebedor, repo.vectores, umbral=-1.0)
    h = rec.buscar("¿Qué carreras ofrece la Sede?")
    assert sum(1 for x in h if x.fragmento["categoria"] == "normativa") >= 2
    assert sum(1 for x in h if x.fragmento["categoria"] == "institucional") >= 8
