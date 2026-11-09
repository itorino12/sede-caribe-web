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

Hoy la Sede tiene más de veinte proyectos en marcha en Limón, Talamanca, Siquirres y el resto de la provincia. Trabajan con escuelas y colegios, personas adultas mayores, juventudes, personas con discapacidad, emprendimientos, pescadores, gestores culturales e instituciones públicas.

## Qué hace la Coordinación

- Acompaña a los proyectos de la Sede en su formulación, ejecución e informes ante la Vicerrectoría de Acción Social, junto con la Comisión de Acción Social.
- Organiza la oferta de Trabajo Comunal Universitario para el estudiantado.
- Gestiona la matrícula y los certificados de los cursos libres y de educación continua.
- Recibe las solicitudes de comunidades, instituciones y organizaciones que quieren trabajar con la Sede.

## Los proyectos, por modalidad

La Vicerrectoría de Acción Social organiza los proyectos en tres modalidades. En cada una encontrará los proyectos de la Sede y una página con la información de cada uno.
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
Educación Continua, a la que en la Sede muchos conocen como «cursos cortos», abre las aulas de la Universidad de Costa Rica a cualquier persona que quiera aprender algo nuevo, ponerse al día en su trabajo o prepararse para conseguir uno. Es el proyecto ED-204 de la Coordinación de Acción Social y ofrece cursos de 40 horas, presenciales y virtuales, en Limón, Siquirres y Talamanca.

La oferta no se decide en una oficina. Antes de cada periodo se abre una prematrícula, y los cursos que se imparten son los que la comunidad pide. En 2025 se inscribieron más de 200 personas interesadas en cada ciclo, con picos de 285.

[[cifras]]

## Quiénes llevan los cursos

Predominan las personas jóvenes: dos de cada tres tienen menos de 30 años. Aun así, en un mismo grupo pueden coincidir estudiantes de colegio, personas que ya trabajan y personas mayores; la más joven tenía 15 años y la mayor, 67.

Llegan de los seis cantones de la provincia: poco más de la mitad de Limón, casi una cuarta parte de Siquirres y el resto de Matina, Talamanca, Pococí y Guácimo. Casi una de cada seis personas ha vuelto para llevar otro curso.

## Lo que más se matricula

- **Idiomas**, con cuatro de cada diez matrículas. Inglés básico y conversacional por módulos, y también portugués.
- **Tecnología y comunicación**: operador de computadoras, hojas electrónicas, redes sociales, diseño con Canva, inteligencia artificial y fotografía.
- **Razonamiento verbal y lógico-matemático**, que fortalece la comprensión de lectura y el pensamiento matemático. Se ha impartido a jóvenes de programas del IMAS en Siquirres y Matina.
- **Logística portuaria**, en módulos ligados a la actividad de los puertos de Limón y Moín.
- **Salud**: masaje terapéutico y salud ocupacional.

## Catálogo de cursos

Educación Continua cuenta con un catálogo de más de cincuenta cursos. En cada periodo se abre una parte de ellos, según la prematrícula; los del periodo se anuncian en la [agenda](../agenda.html).

### Idiomas

Inglés básico, conversacional y avanzado (módulos I a III), preparación para la certificación TOEIC, portugués básico, ruso comunicativo y Lengua de Señas Costarricense (módulos I a VI).

### Tecnología, diseño y comunicación

Operador de computadoras I y II, operador de hojas electrónicas (básico e intermedio), introducción al desarrollo web, inteligencia artificial para el desempeño profesional, diseño gráfico publicitario con Canva, presentaciones dinámicas, redes sociales y creación de contenidos, fotografía con cámara digital e iluminación fotográfica.

### Puertos y logística

Logística portuaria I a IV (transporte internacional, transporte local, comercio internacional y aduanas, y buques, máquinas y vapores) y maniobras del buque para pilotos prácticos.

### Empresa, emprendimiento y servicio

Emprendimiento básico, administración del recurso humano para pequeñas empresas, analista de crédito bancario, asesor de ventas, calidad total del servicio al cliente, mercadotecnia para microempresas, marketing con tecnologías de información para pymes, finanzas personales, cómo elaborar un proyecto viable, gestión empresarial para pequeños hoteles, aprovisionamiento de materias primas, relaciones humanas, *design thinking* y creatividad.

### Salud y bienestar

Masaje terapéutico (integral, lesiones deportivas y clínico integral), salud ocupacional (seguridad laboral, e higiene industrial y ambiental) y bienestar integral por medio del movimiento consciente.

### Turismo, gastronomía y formación general

Creación de cartas y menús, operaciones básicas y servicios en restaurantes, e inducción al razonamiento verbal y lógico-matemático.

## Por qué llevar un curso aquí

- **Certificado de la Universidad de Costa Rica** para quienes aprueban.
- **Grupos pequeños**, de 15 personas como máximo y unas nueve en promedio, con atención cercana.
- **Horarios para quien trabaja o estudia**: mañana, tarde y noche entre semana, y sábados. Casi la mitad de las matrículas son en horario nocturno y más de un tercio, en sábado.
- **Presencial o virtual**: cerca de cuatro de cada diez matrículas son en cursos virtuales, que se pueden llevar desde cualquier cantón.
- **Docentes con experiencia** en su campo. De las 41 personas de la bolsa de docentes, 14 tienen maestría o doctorado.
- **Calidad evaluada**: al terminar cada curso, el estudiantado evalúa a la persona docente. En 2025, más del 88 % calificó como excelentes la puntualidad, la organización de las clases, los contenidos y la retroalimentación. Además, el 93 % dijo haber aprendido mucho.

## Cómo matricularse

1. Revise los cursos del periodo en la [agenda](../agenda.html) o llame al 2511-7330. En 2026 hubo cuatro periodos: enero-febrero, abril-mayo, junio-julio y octubre-noviembre.
2. Llene la prematrícula. Un curso se abre cuando reúne el cupo necesario.
3. Pague por SINPE Móvil o por transferencia a la Fundación UCR, con los datos que se indican en el anuncio del periodo.
4. Envíe el comprobante y una copia de la cédula, por ambos lados, al WhatsApp 8776-8902 o al correo [cursoscortos.sedecaribe@ucr.ac.cr](mailto:cursoscortos.sedecaribe@ucr.ac.cr).

## Para instituciones y empresas

Educación Continua también diseña capacitaciones para el personal de instituciones y empresas. En 2025 impartió un curso de maniobras del buque para los pilotos prácticos de una empresa que opera en la Terminal de Contenedores de Moín. También llevó cursos a jóvenes de programas del IMAS en Siquirres y Matina, y a población indígena de Palmeras de Matina. Si su organización necesita capacitar a su personal, escriba a la oficina.

## Bolsa de docentes

¿Domina un tema que le sirva a la región? Educación Continua mantiene una bolsa de docentes con profesionales de inglés, administración, matemática, informática, terapia física, logística portuaria, salud ocupacional, diseño y otras áreas. Para formar parte de ella, escriba al correo de la oficina y solicite el formulario de registro y la plantilla para proponer el programa de su curso.
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
