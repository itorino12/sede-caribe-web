#!/usr/bin/env python3
"""Genera src/paginas/*.md: el texto largo de cada página, migrado del sitio anterior.

En producción estos textos vienen de los Documentos de Google de la carpeta «Páginas» del Drive
(un documento por página, con el mismo nombre del archivo). Aquí quedan como respaldo.
"""
from pathlib import Path

DESTINO = Path(__file__).resolve().parent.parent / "src" / "paginas"

PAGINAS = {
"mision-vision": """
## Misión

Contribuir a la transformación de la sociedad costarricense, y en especial de la provincia de Limón, mediante la formación integral de profesionales con un amplio sentido de responsabilidad social, integrando la docencia, la investigación y la acción social.

## Visión

Ser líder en la educación superior pública, mediante la creación y descentralización de procesos, carreras pertinentes y proyectos de desarrollo que respondan a las necesidades de Limón y de la comunidad académica, en concordancia con los valores de la Sede.
""",
"historia": """
La idea de una universidad pública en el Caribe nació a finales de los años sesenta. En 1975 el Consejo Universitario aprobó el Servicio Descentralizado de Limón, que dependía de la Sede Regional de Turrialba y empezó con Estudios Generales y cursos básicos.

Las primeras 54 personas estudiaron donde se pudo: el Liceo Nuevo, una casa cedida, el Black Star Line, el Parque Vargas, la Escuela de Niñas y el segundo piso del Correo de Limón. Estudiantes y docentes pioneros pasaban los fines de semana construyendo la soda y las aceras.

En 1977 la demanda subió de 150 a 200 estudiantes y nació el «Gran Comité», que impulsó las gestiones para que el servicio creciera. Ese año el Ministerio de Obras Públicas y Transportes donó siete hectáreas, y en 1978 se levantó un pabellón de diez aulas prefabricadas con aportes de la comunidad, la Universidad y el Gobierno.

El 21 de abril de 1979 el Consejo Universitario sesionó en Limón y creó el Centro Regional de Limón, decisión que se ratificó el 19 de abril de 1980.

## Hoy

El campus sumó en los últimos años una biblioteca nueva, el Aula Multiuso, las residencias estudiantiles, un nuevo acceso principal, un puente hacia las residencias con salida por Santa Rosa, un edificio de aulas y laboratorios para las ingenierías y un paso techado desde las aulas de la entrada hasta el edificio de Registro.
""",
"direccion": """
La Dirección conduce la Sede y coordina sus cinco áreas: docencia, investigación, acción social, vida estudiantil y administración. Atiende la correspondencia oficial en sedecaribe@ucr.ac.cr.
""",
"docencia": """
La Coordinación de Docencia da apoyo logístico a las coordinaciones de carrera y vela por el mejoramiento permanente de la actividad docente y la excelencia académica.

## Qué hace

- Prepara las guías de horarios y organiza los procesos de matrícula (ordinaria, de inclusión y otras).
- Procura que las carreras cuenten con el equipo y las licencias que requieren sus cursos.
- Impulsa nuevas carreras y participa en la elaboración de los planes de estudio de la Sede.
- Presta equipo audiovisual a docentes y estudiantes.
""",
"investigacion": """
La Coordinación de Investigación promueve, desarrolla y divulga la investigación en la Sede del Caribe. Su comisión recibe y aprueba los proyectos y sus presupuestos, les da seguimiento y valora su impacto en la comunidad.

## Ejes temáticos

- **Historia y cultura:** las raíces del calypso, el aporte de las iglesias protestantes a la educación en Limón y la cultura caribeña en sentido amplio.
- **Turismo:** su papel como generador de divisas y de desarrollo para la región.

## Algunos proyectos

- Historia de Puerto Viejo de Limón: el paso de una villa de pescadores y cazadores de tortugas a un destino turístico.
- Inventario de los recursos turísticos de la región.
- Encadenamientos hoteleros: redes de negocio entre pequeñas empresas turísticas del Caribe.
""",
"accion-social": """
La Coordinación de Acción Social mantiene el vínculo entre la Sede y las comunidades, en conjunto con la docencia y la investigación, y lleva a la sociedad el conocimiento que se genera en la universidad.

## Programas

- **Extensión docente:** actividades educativas, de actualización y de capacitación que responden a demandas de la comunidad.
- **Extensión cultural:** artes, letras, modos de vida, derechos humanos y tradiciones de los grupos de la región.
- **Trabajo Comunal Universitario (TCU):** estudiantes y docentes trabajan con comunidades para resolver problemas concretos.
- **Iniciativas estudiantiles:** proyectos de acción social que el estudiantado diseña junto con las comunidades.
- **Educación continua:** cursos libres y de actualización abiertos al público.
""",
"vida-estudiantil": """
La Coordinación de Vida Estudiantil existe desde agosto de 1980. Su tarea es que entrar y mantenerse en la universidad sea posible para todas las personas, atendiendo las barreras socioeconómicas, de origen, de género, culturales o de salud.

## Oficinas y servicios

- Registro: admisión, matrícula, expediente y graduaciones.
- Becas: becas socioeconómicas y de estímulo.
- Orientación.
- Trabajo Social.
- Psicología.
- Consultorio médico y odontología.
- Residencias estudiantiles.

## Admisión

Cada año la Oficina de Registro, con apoyo de Orientación y Becas, visita los 79 colegios de la región para presentar la oferta académica, el sistema de becas y el proceso de admisión. La campaña se apoya en la Feria Vocacional de la Sede, la feria de la Ciudad Universitaria Rodrigo Facio, las redes sociales y los medios de comunicación.
""",
"administracion": """
La Coordinación de Administración vela por procedimientos adecuados, servicios generales eficientes, control presupuestario y buen uso de los recursos, en coordinación con la Dirección y la Vicerrectoría de Administración.

## Servicios

- Personal y recursos humanos.
- Publicaciones y reproducción.
- Suministros, compras y bodega.
- Administración financiera.
- Servicios generales: seguridad, conserjería, zonas verdes, mantenimiento y transporte.
- Recurso Informático Desconcentrado (RID) y activos fijos.
""",
"siquirres": """
El Aula Desconcentrada de Siquirres lleva la universidad al cantón gracias a un convenio de cooperación con la Municipalidad, que incluye docencia, investigación, acción social y actividades artísticas y culturales.

## Historia

- **Enero de 2011:** la Municipalidad ofrece el antiguo palacio municipal, junto al mercado.
- **8 de diciembre de 2011:** se firma el convenio, con un alcance de 25 años.
- **Marzo de 2013:** abre con la primera generación de Informática Empresarial.
- **2013:** se suma una generación de Dirección de Empresas, en convenio con el CUN Limón.
""",
"ciub": """
El Centro Infantil Universitario Bilingüe es un centro de estimulación y formación integral para niñas y niños menores de 6 años. Es un proyecto de acción social de la Sede y forma parte del programa universitario de atención a la niñez.

Parte de una idea sencilla: cada niña y cada niño tiene capacidades propias que se desarrollan con estímulo y con respeto por su individualidad.
""",
"educacion-continua": """
Educación Continua, conocida como «cursos cortos», ofrece cursos libres y de actualización de interés para la región. La matrícula abre en distintos períodos del año.

Para conocer los cursos abiertos, consulte la agenda de este sitio o llame a la extensión 2511-7330.
""",
"biblioteca": """
La biblioteca de la Sede forma parte del Sistema de Bibliotecas, Documentación e Información (SIBDI) de la UCR. Apoya la docencia, la investigación, la acción social y la administración con colecciones, servicios de consulta y acceso a recursos electrónicos.

El catálogo y las bases de datos están disponibles en sibdi.ucr.ac.cr.
""",
"laboratorios": """
## Laboratorio de Informática

Equipos para los cursos de Informática Empresarial y de las demás carreras.

## Laboratorio de Idiomas

Espacio para la práctica de la lengua en Inglés, Enseñanza del Inglés y Educación Inicial en Inglés.

## Laboratorio de Química

Laboratorio para los cursos de Ingeniería Química y de las ciencias básicas.
""",
"residencias": """
Las residencias estudiantiles están dentro del campus y se conectan con la Sede por un puente peatonal. Se asignan a estudiantes con beca que viven lejos de Limón, por medio de la Coordinación de Vida Estudiantil.
""",
"gimnasio": """
El gimnasio alberga los entrenamientos de los equipos de la Sede, los cursos de actividad deportiva y eventos institucionales.
""",
"piscina": """
La piscina del campus se usa para cursos de natación, entrenamientos y actividades recreativas de la comunidad universitaria.
""",
"informatica-empresarial": """
Forma profesionales que desarrollan y administran proyectos informáticos para organizar los sistemas, los recursos y las finanzas de una empresa. La carrera combina computación, administración, matemática, estadística y lógica, con la ética y el humanismo como ejes.

## Qué podrá hacer

- Analizar, diseñar y programar sistemas de información.
- Planificar y dirigir la gestión informática de una organización.
- Modelar procesos empresariales para apoyar la toma de decisiones.

Se imparte en Limón y en el Aula Desconcentrada de Siquirres. Toda la información de la carrera en las diez sedes está en informaticaempresarial.ucr.ac.cr.
""",
}

DESTINO.mkdir(parents=True, exist_ok=True)
for nombre, texto in PAGINAS.items():
    (DESTINO / f"{nombre}.md").write_text(texto.strip() + "\n", encoding="utf-8")
print(f"{len(PAGINAS)} páginas")
