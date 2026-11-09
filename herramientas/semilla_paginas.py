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
La Coordinación de Acción Social mantiene el vínculo entre la Sede y las comunidades del Caribe, en conjunto con la docencia y la investigación. Lleva a la sociedad el conocimiento que se genera en la universidad y trae de vuelta a las aulas las preguntas y los saberes de la región.

Hoy la Sede tiene más de veinte proyectos en marcha en Limón, Talamanca, Siquirres y el Caribe Norte. Trabajan con escuelas y colegios, personas adultas mayores, juventudes, personas con discapacidad, emprendimientos, pescadores, gestores culturales e instituciones públicas.

## Cómo trabaja

- **Trabajo Comunal Universitario (TCU):** estudiantes y docentes trabajan con comunidades para atender problemas concretos. Es requisito de graduación en la Universidad de Costa Rica.
- **Extensión cultural:** artes, lengua, gastronomía, memoria y tradiciones de los pueblos de la región.
- **Extensión docente:** capacitación, actualización y acompañamiento técnico que responde a demandas de la comunidad.
- **Educación continua:** cursos libres y de actualización abiertos al público.
- **Iniciativas estudiantiles:** proyectos de acción social que el estudiantado diseña junto con las comunidades.

## Trabajo Comunal Universitario

- **TC-479 · Promoción y fortalecimiento del ambiente y la cultura en el Caribe costarricense.** Actividades educativas con instituciones y comunidades de Limón sobre la biodiversidad de la región, su conservación y el respeto a la diversidad cultural.
- **TC-518 · Informática para el desarrollo comunal.** Talleres de competencias digitales en escuelas y colegios, y asesoría a pymes y emprendimientos, para reducir la brecha digital.
- **TC-598 · Acompañamiento a las pequeñas empresas.** El estudiantado asesora a microempresas de toda la provincia en promoción y ventas, finanzas básicas, identidad de marca y digitalización.
- **TC-614 · Acercamiento social: jóvenes limonenses construyendo su entorno.** Espacios educativos, culturales, recreativos y de libre expresión con jóvenes del cantón Central y de territorios indígenas de Talamanca, para que lideren iniciativas en sus comunidades.
- **TC-623 · Ambiente y turismo: promoción e implementación de prácticas ambientales sostenibles para el Caribe costarricense.** Prácticas de sostenibilidad en comunidades turísticas de Limón y Talamanca; en esta etapa abre trabajo en el Caribe Norte y apoya al Observatorio de Turismo del Caribe.
- **TC-690 · Centinelas Educativas de Estudio del Caribe.** Acompañamiento académico y actividades artísticas y deportivas con estudiantes de centros educativos del cantón Central.

## Cultura y patrimonio

- **EC-570 · Preuniversitario en Artes Musicales del Caribe.** Formación musical por niveles (inicial, intermedio y avanzado) para niñas, niños, jóvenes y personas adultas: teoría y solfeo, lecciones de instrumento o canto y ensambles, entre ellos uno de calypso. El ingreso es por convocatoria anual, con pruebas de nivelación para quienes ya tocan, y sus conciertos y recitales son abiertos.
- **EC-571 · Inclusión socioeducativa y recreativa para personas con discapacidad.** Talleres creativos y de formación en el cantón Central con personas con discapacidad, sus familias y quienes las cuidan, junto con CONAPDIS, el MEP y organizaciones locales.
- **EC-594 · Salvaguarda Cultural Gastronómica del Caribe Limón.** Documenta, protege y difunde la cocina tradicional limonense como patrimonio inmaterial, con personas de distintas etnias, edades y oficios.
- **EC-618 · Kryol Kaana.** Charlas y talleres gratuitos para revitalizar el criollo limonense (mekatelyu) con escuelas, instituciones y personas adultas mayores.
- **EC-643 · Articulación interinstitucional en salud, deporte e inclusión en Limón.** Reúne a instituciones de la provincia para organizar actividades de salud, deporte e inclusión según las necesidades de la población.
- **CP-688 · Memorias y procesos comunitarios del Caribe: de lo visual a la representación cultural en Puerto Limón.** Talleres, exposiciones y encuentros en Limón centro, Cahuita y Puerto Viejo para valorar la memoria colectiva a partir de imágenes, objetos y relatos de la comunidad.
- **Cultura Caribe en la Danza.** Taller anual de danza con personas adultas mayores, un registro de agrupaciones, maestras y bailarines limonenses, y un encuentro intergeneracional cada año.
- **Pesca y patrimonio: viajes a las tradiciones costeras de Talamanca.** Documenta las tradiciones de las personas pescadoras de Cahuita, Puerto Viejo y Manzanillo y las convierte en experiencias de turismo vivencial.

## Educación permanente y servicios

- **ED-204 · Educación Continua Sede del Caribe.** Cursos de capacitación y actualización en Limón y Siquirres: computación, hojas electrónicas, inglés, servicio al cliente, logística portuaria, salud ocupacional y mercadeo digital, entre otros. [Ver Educación Continua](educacion-continua.html).
- **ED-1518 · Programa Interrelación con la Persona Adulta Mayor.** Actividades que fortalecen la autoestima, la autonomía y las redes de apoyo de las personas adultas mayores, y su manejo de la tecnología.
- **ED-1772 · Innovación y cultura para una gestión ambiental sostenible.** Educación ambiental con centros educativos, el SINAC y comunidades: residuos, agua, energía, contaminación y cambio climático.
- **ED-2673 · Cursos Libres Sede del Caribe.** Cursos gratuitos de temas variados, impartidos por docentes, estudiantes avanzados y personas de la comunidad que dominan un oficio o un saber.
- **ED-2854 · Centro Infantil Universitario Bilingüe.** Estimulación y formación integral para niñas y niños menores de seis años, con acompañamiento a sus familias. [Ver el CIUB](ciub.html).
- **ED-3136 · Espacios de formación y articulación para el fortalecimiento del turismo sostenible en el Caribe.** Cursos, talleres y encuentros para emprendimientos, pymes, organizaciones y gobiernos locales ligados al turismo, de la mano del Observatorio de Turismo Sostenible del Caribe (OBTURCARIBE).
- **ED-3217 · Iniciativas Verdes.** Acompaña a organizaciones, centros educativos e instituciones del cantón Central en el manejo de residuos, el ahorro de recursos y la recuperación de cuencas, con la Municipalidad de Limón, el MEP y asociaciones de desarrollo.
- **ED-3672 · Formación de capital humano para la empleabilidad de la Región Huetar Caribe.** Proyecto conjunto de las cinco universidades públicas (CONARE) que arma una oferta de formación técnica, inglés y capacitación laboral para la región.
- **EPS-3755 · Proyecto de Capacitación para Gente de Mar.** Formación continua y certificada para la gente de mar y el sector portuario, con el respaldo de Ingeniería Marítima y sus simuladores.
- **Promoción y comercialización para mipymes turísticas del Caribe Sur.** Capacitación y acompañamiento a micro y pequeñas empresas turísticas de Cahuita, Puerto Viejo y Manzanillo, con herramientas tecnológicas que puedan usar por su cuenta.

## Participar

¿Su comunidad, institución u organización quiere trabajar con la Sede, o usted quiere sumarse a uno de estos proyectos? Escriba a la Coordinación de Acción Social; sus datos están en esta página.
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
