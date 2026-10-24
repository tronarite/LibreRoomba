#!/usr/bin/env bash
# Análisis y decompilación de los .so de la app con Ghidra en modo headless (sin REA: en Windows REA no analiza ELF arm64).
# Requiere Ghidra 12.1.x y un JDK 21+ (Ghidra 12.2 pide JDK 25).
#   run.sh import <libreria.so> <proyecto_dir> <nombre>         importa y analiza (lento; guarda el proyecto)
#   run.sh dump   <proyecto_dir> <nombre> <programa> <patron1+patron2> <salida.c> [max]   decompila funciones cuyo nombre contenga los patrones (separador +: Ghidra parte por comas y el .bat de Windows interpreta | como tubería)
set -euo pipefail
GHIDRA="${GHIDRA_121_DIR:-/c/Users/MARCELO/Tools/ghidra-121/ghidra_12.1.4_PUBLIC}"
export JAVA_HOME="${JAVA_HOME_GHIDRA:-/c/Program Files/Java/jdk-21}"
export PATH="$JAVA_HOME/bin:$PATH"
HEADLESS="$GHIDRA/support/analyzeHeadless.bat"
SCRIPTS="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
case "${1:-}" in
  import) "$HEADLESS" "$3" "$4" -import "$2" -overwrite -analysisTimeoutPerFile "${ANALYSIS_TIMEOUT:-1500}" ;;
  dump)   "$HEADLESS" "$2" "$3" -process "$4" -noanalysis -scriptPath "$SCRIPTS" -postScript DumpDecomp.java "$5" "$6" "${7:-60}" ;;
  *) sed -n '2,7p' "$0"; exit 1 ;;
esac
