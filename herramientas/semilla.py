#!/usr/bin/env python3
"""Genera src/data/*.json: el contenido inicial del sitio, migrado de sedecaribe.ucr.ac.cr (nov. 2026).

Cada archivo tiene la misma forma que una pestaña de la hoja «Contenido del sitio» en Drive:
una lista de filas con los encabezados como claves y todo como texto. Cuando el servidor
sincroniza con Drive, estos archivos quedan solo como respaldo y para trabajar sin conexión.
Este script también sirve para cargar la hoja de Drive la primera vez.
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "src" / "data"

config = [
    ("nombre", "Sede del Caribe"),
    ("nombre_largo", "Universidad de Costa Rica, Sede del Caribe"),
    ("lema", "Universidad de Costa Rica en el Caribe desde 1975"),
    ("descripcion", "Carreras, admisión, noticias, agenda y servicios de la Universidad de Costa Rica en Limón y Siquirres."),
    ("base_url", "https://sedecaribe.ucr.ac.cr"),
    ("telefono", "2511-7300"),
    ("correo", "sedecaribe@ucr.ac.cr"),
    ("direccion", "Limón, Costa Rica"),
    ("mapa_url", ""),
    ("facebook", ""),
    ("instagram", ""),
    ("youtube", ""),
    ("tiktok", ""),
    ("formulario_cobertura", "https://forms.gle/TMtnbD1L5CJ7R7Z8A"),
    ("correo_comunicacion", ""),
]

avisos = [
    {"publicar": "sí", "tipo": "informativo",
     "titulo": "Ingreso a Marina Civil 2027",
     "texto": "Quienes deseen ingresar o trasladarse a Marina Civil en 2027 deben enviar la Declaración Jurada de ingreso, según la resolución VD-13714-2026.",
     "enlace_texto": "Descargar la declaración jurada",
     "enlace": "https://sedecaribe.ucr.ac.cr/images/ucr/ucr_pdf/DECLARACION_JURADA.pdf",
     "desde": "2026-07-06", "hasta": "2026-10-16"},
]

noticias = [
    {"publicar": "sí", "id": "proyectos-deportivos-2024", "fecha": "2024-04-22", "categoria": "Vida estudiantil",
     "titulo": "Tres nuevos proyectos deportivos quedan inscritos en Vida Estudiantil",
     "resumen": "Voleibol femenino, fútbol 11 masculino y baloncesto femenino ya son proyectos inscritos. Sus integrantes pueden optar por la beca de estímulo por participación y por apoyo para viáticos.",
     "cuerpo": "Los equipos de voleibol femenino, fútbol 11 masculino y baloncesto femenino de la Sede del Caribe quedaron inscritos como proyectos deportivos ante la Vicerrectoría de Vida Estudiantil.\n\nSegún explicó Andy Fuller, coordinador de actividades deportivas, recreativas y artísticas de la Sede, la inscripción permite a sus integrantes optar por la beca de estímulo por participación, además de permisos y apoyo para viáticos cuando compiten fuera de Limón.",
     "documento": "", "imagen": "", "imagen_alt": "", "autor": "Unidad de Comunicación Estudiantil", "destacada": ""},
    {"publicar": "sí", "id": "bachillerato-ingles-2024", "fecha": "2024-04-19", "categoria": "Carreras",
     "titulo": "¿De qué trata el Bachillerato en Inglés?",
     "resumen": "Cuatro años de cursos prácticos y teóricos para dominar la lengua, con salidas hacia la traducción, la literatura y la lingüística.",
     "cuerpo": "El Bachillerato en Inglés combina cursos prácticos y teóricos con un objetivo central: que cada estudiante domine la lengua. La carrera dura cuatro años.\n\nRocío Masís Pereira, coordinadora de Inglés en la Sede, explicó que las personas graduadas pueden especializarse luego en campos como la traducción, la literatura o la lingüística.",
     "documento": "", "imagen": "", "imagen_alt": "", "autor": "Unidad de Comunicación Estudiantil", "destacada": ""},
    {"publicar": "sí", "id": "contaduria-publica-2024", "fecha": "2024-04-17", "categoria": "Carreras",
     "titulo": "Contaduría Pública: «una carrera poderosa, difícil, pero bella»",
     "resumen": "La coordinadora Ruth González Bordas habla de la vocación y de lo que exige la carrera.",
     "cuerpo": "Ruth González Bordas, docente y coordinadora de Contaduría Pública en la Sede del Caribe, describió la carrera como exigente y a la vez apasionante, aunque reconoce que es difícil resumirla en una frase.\n\nSobre la elección de carrera, señaló que algunas personas necesitan orientación para descubrir su vocación, mientras que otras, como ella, la tienen clara desde jóvenes.",
     "documento": "", "imagen": "", "imagen_alt": "", "autor": "Unidad de Comunicación Estudiantil", "destacada": ""},
    {"publicar": "sí", "id": "actividades-extracurriculares-2024", "fecha": "2024-04-15", "categoria": "Vida estudiantil",
     "titulo": "Hay más que teoría: actividades deportivas y artísticas en la Sede",
     "resumen": "Taekwon-do ITF, danza folclórica y calypso, y baloncesto masculino y femenino, entre las opciones abiertas al estudiantado.",
     "cuerpo": "La Sede del Caribe ofrece al estudiantado actividades deportivas y artísticas voluntarias. Entre ellas están el equipo de Taekwon-do ITF, el grupo de Danza Folclórica Típica Costarricense y Calypso, y los equipos masculino y femenino de baloncesto.",
     "documento": "", "imagen": "", "imagen_alt": "", "autor": "Unidad de Comunicación Estudiantil", "destacada": ""},
    {"publicar": "sí", "id": "empleabilidad-huetar-caribe-2024", "fecha": "2024-04-12", "categoria": "Acción social",
     "titulo": "Las cinco universidades públicas trabajan por la empleabilidad en la Huetar Caribe",
     "resumen": "El proyecto ED3672, con respaldo del CONARE, busca mejorar la preparación laboral en Matina, Siquirres y Talamanca.",
     "cuerpo": "La UCR, el TEC, la UNA, la UTN y la UNED desarrollan el proyecto ED3672, «Formación de Capital Humano para la Empleabilidad de la zona Huetar Caribe», con el respaldo del CONARE, el OCIR y la VEAS.\n\nEl objetivo es mejorar la preparación laboral en Matina, Siquirres y Talamanca: ajustar la formación a las necesidades del mercado laboral local y fortalecer las habilidades técnicas y personales de la población joven, mediante cursos que imparten docentes de las cinco universidades.",
     "documento": "", "imagen": "", "imagen_alt": "", "autor": "Unidad de Comunicación Estudiantil", "destacada": ""},
    {"publicar": "sí", "id": "coordinacion-docencia-2024", "fecha": "2024-04-10", "categoria": "Institucional",
     "titulo": "¿Qué hace la Coordinación de Docencia?",
     "resumen": "Apoya a las coordinaciones de carrera, prepara las guías de horarios y organiza los procesos de matrícula.",
     "cuerpo": "La Coordinación de Docencia da apoyo logístico a las coordinaciones de carrera, impulsa el fortalecimiento de las carreras y la ampliación de cursos, y tiene a su cargo las guías de horarios y los distintos tipos de matrícula, como la ordinaria y la de inclusión.\n\nSu coordinador, William García Morera, explicó que la unidad también procura que las carreras cuenten con los equipos y las licencias que requieren sus cursos.",
     "documento": "", "imagen": "", "imagen_alt": "", "autor": "Unidad de Comunicación Estudiantil", "destacada": ""},
]

eventos = []

PLAN = "https://sedecaribe.ucr.ac.cr/images/Carreras/Planesdeestudios2025/"
carreras = [
    ("administracion-aduanera", "Administración Aduanera y Comercio Exterior", "Diplomado y Bachillerato", "330212", "Ciencias económicas", "Limón", "", "", "", PLAN + "330212_DIPL_ADM_ADUANERA_BACH_ADM_ADUANERA_COM_EXT"),
    ("contaduria-publica", "Contaduría Pública", "Bachillerato y Licenciatura", "330103", "Ciencias económicas", "Limón", "", "", "2511-7315", PLAN + "330103_BACH_Y_LIC_EN_CONTADURIA_PUBLICA"),
    ("direccion-de-empresas", "Dirección de Empresas", "Bachillerato y Licenciatura", "330102", "Ciencias económicas", "Limón", "", "", "2511-7310", PLAN + "330102_BACH_Y_LIC_EN_DIRECCION_DE_EMPRESAS"),
    ("informatica-empresarial", "Informática Empresarial", "Bachillerato", "600002", "Ingeniería y tecnología", "Limón y Siquirres", "MSc. Itorino Espinoza Torres", "", "2511-7330", PLAN + "600002_BACH_EN_INFORMATICA_EMPRESARIAL"),
    ("ingenieria-quimica", "Ingeniería Química", "Licenciatura", "420501", "Ingeniería y tecnología", "Limón", "", "", "2511-7348", PLAN + "420501_LIC_EN_INGENIERIA_QUIMICA"),
    ("marina-civil", "Marina Civil", "Licenciatura con énfasis en Ingeniería Náutica y Transporte Marítimo", "600004", "Ingeniería y tecnología", "Limón", "", "", "", PLAN + "600004_LIC_MARINA_CIVIL_ENF_ING_NAUTICA_Y_TRANSP_MARITIMO"),
    ("ingles", "Inglés", "Bachillerato", "120303", "Lenguas y educación", "Limón", "", "", "2511-7315", PLAN + "120303_BACH_EN_INGLES"),
    ("ensenanza-del-ingles", "Enseñanza del Inglés", "Bachillerato y Licenciatura", "600113", "Lenguas y educación", "Limón", "", "", "2511-7315", PLAN + "600113_BACH_Y_LIC_EN_LA_ENS_DEL_INGLES"),
    ("educacion-inicial-ingles", "Educación Inicial en Inglés", "Bachillerato", "600135", "Lenguas y educación", "Limón", "", "", "2511-7331", PLAN + "600135_BACH_EN_EDUC_INICIAL_EN_INGLES"),
    ("comunicacion-colectiva", "Comunicación Colectiva", "Bachillerato y Licenciatura en Ciencias de la Comunicación", "340105", "Ciencias sociales", "Limón", "", "", "", PLAN + "340105_BACH_COMUNC_COLECT_LIC_EN_CS_COMUC_EN"),
    ("turismo-ecologico", "Turismo Ecológico", "Bachillerato, y Licenciatura en Gestión Ecoturística", "600307", "Ciencias sociales", "Limón", "", "", "2511-7316", PLAN + "600307_BACH_EN_TURISMO_ECOLOGICO_Y_LIC_GESTION_ECOTURISTICA"),
    ("maestria-tic", "Tecnologías de Información y Comunicación para la Gestión Organizacional", "Maestría profesional", "", "Posgrado", "Limón", "", "", "", "http://www.sep.ucr.ac.cr/"),
]
RESUMENES = {
    "informatica-empresarial": "Forma profesionales que desarrollan y administran proyectos informáticos para organizar los sistemas, los recursos y las finanzas de una empresa. Combina computación, administración, matemática y estadística, con la ética y el humanismo como ejes.",
    "ingles": "Cursos prácticos y teóricos para dominar la lengua inglesa, con salidas hacia la traducción, la literatura y la lingüística.",
}
carreras = [{"publicar": "sí", "id": i, "nombre": n, "grados": g, "codigo": c, "area": a, "recintos": r,
             "coordinacion": co, "correo": ce, "extension": ex, "resumen": RESUMENES.get(i, ""),
             "plan_url": p, "documento": i} for i, n, g, c, a, r, co, ce, ex, p in carreras]

U = lambda **k: {"publicar": "sí", "responsable": "", "cargo": "", "correo": "", "extension": "", "edificio": "",
                 "resumen": "", "documento": k["id"], **k}
unidades = [
    U(id="direccion", nombre="Dirección de la Sede", grupo="Gobierno", correo="sedecaribe@ucr.ac.cr", extension="2511-7303", edificio="Administrativo",
      resumen="Dirige la Sede y coordina sus áreas de docencia, investigación, acción social, vida estudiantil y administración."),
    U(id="docencia", nombre="Coordinación de Docencia", grupo="Coordinaciones", responsable="MBA. William García Morera", cargo="Coordinador",
      correo="docencia.sedecaribe@ucr.ac.cr", extension="2511-7346", edificio="Administrativo",
      resumen="Apoya a las coordinaciones de carrera, organiza horarios y matrícula, y gestiona nuevas opciones académicas."),
    U(id="investigacion", nombre="Coordinación de Investigación", grupo="Coordinaciones", responsable="Dr. Olman Araya Mejías", cargo="Coordinador",
      correo="investigacion.sedecaribe@ucr.ac.cr", extension="2511-7310", edificio="Biblioteca",
      resumen="Promueve, aprueba y da seguimiento a los proyectos de investigación de la Sede, con ejes ligados a las necesidades de Limón."),
    U(id="accion-social", nombre="Coordinación de Acción Social", grupo="Coordinaciones", responsable="Lic. Miguel Chavarría Chaves", cargo="Coordinador",
      correo="accionsocial.sedecaribe@ucr.ac.cr", extension="2511-7349", edificio="Administrativo",
      resumen="Vincula la Sede con las comunidades mediante extensión docente y cultural, Trabajo Comunal Universitario e iniciativas estudiantiles."),
    U(id="vida-estudiantil", nombre="Coordinación de Vida Estudiantil", grupo="Coordinaciones", responsable="MBA. Marianita Harvey Chavarría", cargo="Coordinadora",
      correo="vidaestudiantil.sedecaribe@ucr.ac.cr", extension="2511-7308", edificio="Administrativo",
      resumen="Registro, becas, orientación, trabajo social, psicología, salud y residencias: los servicios para entrar y permanecer en la universidad."),
    U(id="administracion", nombre="Coordinación de Administración", grupo="Coordinaciones", responsable="Lic. Marvin de la O Torres, MBA", cargo="Coordinador",
      correo="jefaturaadministrativa.sedecaribe@ucr.ac.cr", extension="2511-7321", edificio="Administrativo",
      resumen="Personal, compras, finanzas, servicios generales, activos e informática: el soporte de toda la Sede."),
    U(id="siquirres", nombre="Aula Desconcentrada de Siquirres", grupo="Recintos", responsable="MA. Felipe Jenkins Cruz", cargo="Coordinador",
      extension="2511-7397", edificio="Antiguo palacio municipal de Siquirres",
      resumen="Desde 2013 acerca la universidad al cantón de Siquirres, gracias a un convenio con la Municipalidad."),
    U(id="ciub", nombre="Centro Infantil Universitario Bilingüe (CIUB)", grupo="Servicios", extension="2511-7331", edificio="Residencias estudiantiles",
      resumen="Centro de estimulación y formación integral para niñas y niños menores de 6 años; es un proyecto de acción social de la Sede."),
    U(id="educacion-continua", nombre="Educación Continua", grupo="Servicios", extension="2511-7330", edificio="Aula 6",
      resumen="Cursos libres y de actualización abiertos a la comunidad, con matrícula en distintos períodos del año."),
    U(id="biblioteca", nombre="Biblioteca", grupo="Servicios", extension="2511-7309", edificio="Biblioteca",
      resumen="Parte del Sistema de Bibliotecas, Documentación e Información (SIBDI) de la UCR. Apoya la docencia, la investigación y la acción social."),
    U(id="laboratorios", nombre="Laboratorios", grupo="Servicios", extension="2511-7348",
      resumen="Laboratorios de Informática, de Idiomas y de Química para los cursos de la Sede."),
    U(id="residencias", nombre="Residencias estudiantiles", grupo="Servicios", extension="2511-7317", edificio="Residencias",
      resumen="Alojamiento dentro del campus para estudiantes con beca que vienen de lejos."),
    U(id="gimnasio", nombre="Gimnasio", grupo="Servicios", edificio="Gimnasio",
      resumen="Espacio para la actividad física, los equipos deportivos y los cursos de la Sede."),
    U(id="piscina", nombre="Piscina", grupo="Servicios",
      resumen="Piscina del campus para cursos, entrenamientos y actividades recreativas."),
    U(id="editorial", nombre="Editorial", grupo="Servicios", publicar="no",
      resumen="Publicaciones de la Sede del Caribe."),
]

D = lambda unidad, filas: [{"unidad": unidad, "oficina": o, "extension": e, "edificio": b, "correo": ""} for e, o, b in filas]
directorio = (
    D("Dirección", [("2511-7303", "Dirección, secretaría ejecutiva", "Administrativo"), ("2511-7338", "Dirección, asistente", "Administrativo")]) +
    D("Acción Social", [("2511-7349", "Coordinación de Acción Social", "Administrativo"), ("2511-7307", "Coordinación de Acción Social, asistente", "Administrativo"),
                        ("2511-7313", "Extensión docente, extensión cultural y TCU", "Pabellón 1"), ("2511-7331", "Centro Infantil Universitario Bilingüe", "Residencias estudiantiles"),
                        ("2511-7330", "Educación Continua (cursos cortos)", "Aula 6")]) +
    D("Administración", [("2511-7321", "Coordinación de Administración", "Administrativo"), ("2511-7353", "Asistente administrativa", "Administrativo"),
                         ("2511-7322", "Unidad de Compras Especializadas, encargado", "Administrativo"), ("2511-7306", "Unidad de Compras Especializadas, asistente", "Administrativo"),
                         ("2511-7305", "Administración de red", "Administrativo"), ("2511-7327", "Activos fijos", "Gimnasio"), ("2511-7345", "Bodega", "Gimnasio"),
                         ("2511-7329", "Servicios generales", "Pabellón 1"), ("2511-7328", "Oficina de Administración Financiera", "Administrativo"),
                         ("2511-7344", "Recursos humanos, encargada", "Administrativo"), ("2511-7324", "Recursos humanos, asistente", "Administrativo"),
                         ("2511-7352", "Mantenimiento", "Gimnasio"), ("2511-7300", "Central telefónica", "Administrativo")]) +
    D("Carreras", [("2511-7315", "Coordinación de Inglés, Enseñanza del Inglés y Contaduría Pública", "Pabellón 1"), ("2511-7310", "Coordinación de Dirección de Empresas", "Pabellón 1"),
                   ("2511-7353", "Coordinación de Estudios Generales", "Pabellón 1"), ("2511-7330", "Coordinación de Informática Empresarial", "Aula 6"),
                   ("2511-7331", "Coordinación de Educación Inicial en Inglés", "Centro Universitario"), ("2511-7348", "Coordinación de Química y de Laboratorios", "Administrativo"),
                   ("2511-7316", "Coordinación de Turismo Ecológico", "Pabellón 1")]) +
    D("Docencia", [("2511-7346", "Coordinación de Docencia", "Administrativo"), ("2511-7306", "Coordinación de Docencia", "Administrativo"), ("2511-7341", "Coordinación de Docencia, asistente", "Administrativo")]) +
    D("Investigación", [("2511-7310", "Coordinación de Investigación", "Biblioteca"), ("2511-7357", "Coordinación de Investigación, asistente", "Biblioteca"),
                        ("2511-7309", "Biblioteca, encargado", "Biblioteca"), ("2511-7311", "Biblioteca, asistente", "Biblioteca"),
                        ("2511-7312", "Oficina de Proyectos de Investigación", "Pabellón 1"), ("2511-7313", "Oficina de Proyectos de Investigación", "Pabellón 1")]) +
    D("Vida Estudiantil", [("2511-7308", "Coordinación de Vida Estudiantil", "Administrativo"), ("2511-7336", "Coordinación de Vida Estudiantil, asistente", "Administrativo"),
                           ("2511-7325", "Trabajo Social", "Administrativo"), ("2511-7343", "Registro, encargada", "Administrativo"), ("2511-7304", "Registro, ventanilla", "Administrativo"),
                           ("2511-7363", "Registro", "Administrativo"), ("2511-7337", "Becas, encargada", "Administrativo"), ("2511-7326", "Becas, asistente", "Administrativo"),
                           ("2511-7323", "Orientación", "Administrativo"), ("2511-7342", "Psicología", "Administrativo"), ("2511-7339", "Odontología", "Pabellón 1"),
                           ("2511-7351", "Consultorio médico", "Pabellón 1"), ("2511-7317", "Residencias estudiantiles", "Residencias")]) +
    D("Seguridad", [("2511-7350", "Oficiales de seguridad, entrada", "Entrada"), ("2511-7318", "Oficiales de seguridad, residencias", "Residencias estudiantiles"),
                    ("2511-7340", "Oficiales de seguridad, edificio administrativo", "Administrativo")]) +
    D("Siquirres", [("2511-7397", "Coordinación del Aula Desconcentrada", "Siquirres"), ("2511-7399", "Aula Desconcentrada, asistente", "Siquirres"),
                    ("2511-7398", "Apoyo estudiantil y cursos cortos", "Siquirres")]) +
    D("Otros", [("2511-7356", "SINDEU", "Pabellón 1"), ("2511-7333", "AUDEL", "Pabellón 1"), ("2511-7332", "Soda de la Sede", "Administrativo"),
                ("2511-7370", "Junta Administradora del Fondo de Ahorro y Préstamo", "Pabellón 1")])
)
for f in directorio:  # correos de coordinación conocidos
    f["correo"] = {"Coordinación de Acción Social": "accionsocial.sedecaribe@ucr.ac.cr", "Coordinación de Administración": "jefaturaadministrativa.sedecaribe@ucr.ac.cr",
                   "Coordinación de Docencia": "docencia.sedecaribe@ucr.ac.cr", "Coordinación de Investigación": "investigacion.sedecaribe@ucr.ac.cr",
                   "Coordinación de Vida Estudiantil": "vidaestudiantil.sedecaribe@ucr.ac.cr", "Dirección, secretaría ejecutiva": "sedecaribe@ucr.ac.cr"}.get(f["oficina"], "")

E = lambda grupo, filas: [{"grupo": grupo, "titulo": t, "url": u, "descripcion": d} for t, u, d in filas]
enlaces = (
    E("Estudiantes", [("ematrícula", "https://ematricula.ucr.ac.cr/ematricula/", "Matrícula, expediente y estado de cursos"),
                      ("Mediación Virtual", "https://mediacionvirtual.ucr.ac.cr/login/", "Aulas virtuales de los cursos"),
                      ("Correo universitario", "https://correo.ucr.ac.cr/", "Su cuenta @ucr.ac.cr"),
                      ("Becas y atención socioeconómica", "http://becas.ucr.ac.cr/becas/", "Solicitud y renovación de beca"),
                      ("Oficina de Registro e Información", "https://ori.ucr.ac.cr/", "Admisión, calendario y trámites"),
                      ("Bibliotecas SIBDI", "http://sibdi.ucr.ac.cr/", "Catálogo y bases de datos"),
                      ("Oficina de Administración Financiera", "https://oaf.ucr.ac.cr/", "Pagos y cobros"),
                      ("Soda estudiantil", "https://soda.ucr.ac.cr/#/serviciodealimentacion/24", "Menú del servicio de alimentación")]) +
    E("Personal universitario", [("Portal universitario", "https://portal.ucr.ac.cr", "Gestiones del personal"),
                                 ("Expediente único", "https://expediente.ucr.ac.cr/Inicio.aspx", "Expediente del personal"),
                                 ("Expediente único para jefaturas", "https://expediente.ucr.ac.cr/Unidades/Inicio.aspx", "Gestión de unidades"),
                                 ("Estándares de equipo de cómputo", "https://ci.ucr.ac.cr/estandares", "Centro de Informática")]) +
    E("De interés", [("Aula Desconcentrada de Siquirres", "https://siquirres.ucr.ac.cr/", "Sitio del recinto"),
                     ("Centro Infantil Universitario, Limón", "https://cius.ucr.ac.cr/caribe-cil", "CIUB en el sitio de los centros infantiles"),
                     ("Observatorio del Turismo del Caribe", "http://obturcaribe.ucr.ac.cr/", "ObturCaribe"),
                     ("Informática Empresarial Intersedes", "https://informaticaempresarial.ucr.ac.cr", "Sitio de la carrera en las diez sedes"),
                     ("Universidad de Costa Rica", "https://www.ucr.ac.cr", "Portal institucional")])
)

hitos = [
    {"anio": "1975", "texto": "El Consejo Universitario abre el Servicio Descentralizado de Limón, dependiente de la Sede de Turrialba. Las primeras 54 personas estudian en espacios prestados: el Liceo Nuevo, el Black Star Line, el Parque Vargas, la Escuela de Niñas y el segundo piso del Correo."},
    {"anio": "1977", "texto": "La demanda sube de 150 a 200 estudiantes y nace el «Gran Comité». El MOPT dona siete hectáreas para el campus."},
    {"anio": "1978", "texto": "Con aportes de la comunidad, la Universidad y el Gobierno se levanta el primer pabellón: diez aulas prefabricadas."},
    {"anio": "1979", "texto": "El 21 de abril, en sesión solemne en Limón, el Consejo Universitario crea el Centro Regional de Limón. La creación se ratifica el 19 de abril de 1980."},
    {"anio": "2013", "texto": "Abre el Aula Desconcentrada de Siquirres con la primera generación de Informática Empresarial."},
]

cifras = [
    {"valor": "1975", "etiqueta": "año en que llegó la UCR a Limón", "fuente": "Reseña histórica"},
    {"valor": "12", "etiqueta": "carreras de grado y posgrado", "fuente": "Oferta académica"},
    {"valor": "2", "etiqueta": "recintos: Limón y Siquirres", "fuente": ""},
]

for nombre, filas in {"config": [{"clave": k, "valor": v} for k, v in config], "avisos": avisos, "noticias": noticias,
                      "eventos": eventos, "carreras": carreras, "unidades": unidades, "directorio": directorio,
                      "enlaces": enlaces, "hitos": hitos, "cifras": cifras}.items():
    (DATA / f"{nombre}.json").write_text(json.dumps(filas, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{nombre}: {len(filas)} filas")
