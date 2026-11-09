#!/usr/bin/env bash
# Pruebas de CONGO 2.0 (el asistente).
#   bash herramientas/probar_congo.sh            pruebas automáticas: no gastan cuota (proveedor y embeddings de prueba)
#   bash herramientas/probar_congo.sh --en-vivo  revisa el servicio en marcha (en la VM): salud, una búsqueda y
#                                                una pregunta real a Gemini (gasta una consulta de la cuota)
set -euo pipefail
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
CONGO="$RAIZ/servidor/congo"
PY="$CONGO/.venv/bin/python"
[ -x "$PY" ] || PY=python3

if [ "${1:-}" != "--en-vivo" ]; then
  cd "$CONGO" && exec "$PY" -m pytest -q -p no:warnings pruebas
fi

URL=${CONGO_URL:-http://127.0.0.1:8787}
echo "== Salud"
curl -fsS "$URL/api/health"; echo
echo "== Búsqueda (sin IA)"
curl -fsS -X POST "$URL/api/search" -H 'Content-Type: application/json' -d '{"consulta":"carreras que ofrece la Sede","cuantos":3}' |
  "$PY" -c 'import json,sys; [print(f"  {r[\"similarity\"]:.2f}  {r[\"document\"]}") for r in json.load(sys.stdin)["results"]]'
echo "== Pregunta real (gasta una consulta)"
curl -fsS -X POST "$URL/api/chat" -H 'Content-Type: application/json' \
  -d '{"mensajes":[{"rol":"usuario","texto":"¿Qué carreras ofrece la Sede del Caribe?"}]}' |
  "$PY" -c 'import json,sys; j=json.load(sys.stdin); print(j["answer"]); print("confianza:", j["confidence"], "| fuentes:", [s["document"] for s in j["sources"]])'
