<?xml version="1.0" encoding="UTF-8"?>
<!-- Presentación del feed de noticias para quien lo abre en un navegador. Los lectores de noticias ignoran esta hoja
     y reciben el mismo XML de siempre. Todo va aquí dentro (sin archivos externos) para que funcione en cualquier dominio. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>

  <xsl:template name="mes">
    <xsl:param name="m"/>
    <xsl:choose>
      <xsl:when test="$m='Jan'">enero</xsl:when><xsl:when test="$m='Feb'">febrero</xsl:when><xsl:when test="$m='Mar'">marzo</xsl:when>
      <xsl:when test="$m='Apr'">abril</xsl:when><xsl:when test="$m='May'">mayo</xsl:when><xsl:when test="$m='Jun'">junio</xsl:when>
      <xsl:when test="$m='Jul'">julio</xsl:when><xsl:when test="$m='Aug'">agosto</xsl:when><xsl:when test="$m='Sep'">setiembre</xsl:when>
      <xsl:when test="$m='Oct'">octubre</xsl:when><xsl:when test="$m='Nov'">noviembre</xsl:when><xsl:when test="$m='Dec'">diciembre</xsl:when>
      <xsl:otherwise><xsl:value-of select="$m"/></xsl:otherwise>
    </xsl:choose>
  </xsl:template>

  <xsl:template match="/rss/channel">
    <html lang="es-CR">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex"/>
        <title><xsl:value-of select="title"/> (feed RSS)</title>
        <style>
          :root { color-scheme: light dark; --papel: #fff; --tinta: #18232D; --tinta-2: #4A5763; --linea: #D5DDE4; --azul: #005DA4; --niebla: #F2F6F9; }
          @media (prefers-color-scheme: dark) { :root { --papel: #1B1B1B; --tinta: #F2F2F2; --tinta-2: #C8C8C8; --linea: #3A3A3A; --azul: #6FB8EE; --niebla: #2A2A2A; } }
          * { box-sizing: border-box; }
          body { margin: 0; background: var(--papel); color: var(--tinta); font: 1rem/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
          main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
          h1 { font-size: 1.7rem; line-height: 1.2; margin: 0 0 .3em; }
          a { color: var(--azul); }
          .aviso { background: var(--niebla); border-left: 4px solid var(--azul); padding: 14px 16px; border-radius: 4px; margin: 18px 0 26px; }
          .aviso p { margin: 0 0 .6em; } .aviso p:last-child { margin: 0; }
          .direccion { display: block; word-break: break-all; font: .9rem/1.4 ui-monospace, Menlo, Consolas, monospace; background: var(--papel); border: 1px solid var(--linea); border-radius: 4px; padding: 8px 10px; margin-top: 6px; user-select: all; }
          ol { list-style: none; margin: 0; padding: 0; }
          li { border-top: 1px solid var(--linea); padding: 16px 0; }
          li h2 { font-size: 1.2rem; line-height: 1.3; margin: 0 0 .25em; }
          .meta { font-size: .9rem; color: var(--tinta-2); margin: 0 0 .4em; }
          li p { margin: 0; }
        </style>
      </head>
      <body>
        <main>
          <h1><xsl:value-of select="title"/></h1>
          <p class="meta">Feed RSS · <xsl:value-of select="count(item)"/> noticias recientes</p>
          <div class="aviso">
            <p><strong>Esto es un feed RSS.</strong> Sirve para recibir las noticias de la Sede en un lector de noticias (como Feedly o Inoreader) sin entrar al sitio.</p>
            <p>Para suscribirse, copie esta dirección y péguela en su lector:
              <span class="direccion"><xsl:value-of select="atom:link/@href"/></span></p>
            <p><a href="{link}">Ver todas las noticias en el sitio</a></p>
          </div>
          <ol>
            <xsl:for-each select="item">
              <li>
                <h2><a href="{link}"><xsl:value-of select="title"/></a></h2>
                <p class="meta">
                  <xsl:value-of select="number(substring(pubDate, 6, 2))"/> de
                  <xsl:call-template name="mes"><xsl:with-param name="m" select="substring(pubDate, 9, 3)"/></xsl:call-template> de
                  <xsl:value-of select="substring(pubDate, 13, 4)"/>
                  <xsl:if test="category"> · <xsl:value-of select="category"/></xsl:if>
                </p>
                <p><xsl:value-of select="description"/></p>
              </li>
            </xsl:for-each>
          </ol>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
