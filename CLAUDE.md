# LibreRoomba

Objetivo: web app propia para controlar la Roomba i1+ del usuario (control local) e investigar si se puede desbloquear el mapeo.

## Estado (2026-10-22)
- REA (servidor MCP `rea`, skill `reverse-engineer-anything`) instalado a nivel de usuario. Verificado: `claude mcp list` lo da Connected y responde 207 herramientas. Las herramientas solo cargan al abrir una sesión nueva.
- Hallazgo: la i1/i1+ es hardware idéntico a la i3 (sin cámara; sensor óptico de suelo + giroscopio). La i3 recibió Imprint Smart Mapping por firmware; la i1 lo tiene bloqueado por software. Hay que verificarlo en el robot.
- Protocolo local documentado en `research/protocol-notes.md` (fuentes en `research/src/`): descubrimiento UDP 5678 con `irobotmcs`; MQTT TLS en 8883, usuario=BLID, cifrado AES128-SHA256 + SSL_OP_LEGACY_SERVER_CONNECT; topics `cmd` y `delta`.
- El worker agy (Gemini) falló sin error ni salida; no reintentar en bucle, repartir entre otras bolsas.

## Avance (2026-10-22, sesión 2)
- Robot en <IP_ROBOT>, BLID `<BLID>`, fw `daredevil+2.6.0`, sku i155640, protocolo MQTT.
- Contraseña obtenida (HOME hasta que parpadea el icono Wi-Fi; si el eco acaba en `03` no está en modo emparejamiento) y guardada en `research/robot-password.txt` (no subir a git). Scripts: `research/get-password.js` (reintenta solo), `research/listen.js` (escucha solo lectura).
- Conexión MQTT local verificada. Estado completo en `research/state-snapshot.json`.
- Mapas: `pmaps: []`, `pmapLearningAllowed: false`, `optFeats.pmaps.enabled: false`, `mapUploadAllowed: true`; telemetría con `vslam_report`/`map_save`. Bloqueo por software.
- Misión de prueba por MQTT (`cmd` start/dock, funciona; ignora `start` si aún está volviendo a la base): en 50 s de `phase run` NO llegó `pose`. El MQTT local de la i1 no da posición.
- Intento de activar `pmapLearningAllowed:true` vía topic `delta`: el robot lo ignora (sigue false, `optFeats.pmaps.enabled` false). El bloqueo parece venir de la nube/firmware.
- Plan B en curso: `research/apk/iRobot.apk` (com.irobot.home 7.18.0, firma iRobot Corp verificada, SHA256 36bab3c6…b05) decompilado con jadx 1.5.6 (CLI vía `java -cp jadx-gui-1.5.6-all.jar jadx.cli.JadxCLI`) en `research/jadx-out/` (23 667 .java, 236 errores normales). REA/jadx-mcp no disponible: pide REA_JADX_MCP_JAR.
- El APK es solo `base.apk` (sin `lib/`). La lógica de mapas está en C++ nativo (capa Djinni `com.irobot.core`); falta `split_config.arm64_v8a.apk` del Pixel 10a. Java no contiene `pmapLearningAllowed` ni `optFeats`.
- Contraseña: el robot la entrega con un `0x00` final (terminador C) que hay que quitar o MQTT responde "Bad username or password". Ya limpio en el archivo y en `get-password.js`. (Contraseña actual obtenida a las 12:5x tras volver a pulsar HOME.)
- `adb` y `jadx` instalados (winget). Splits del Pixel en `research/apk-splits/`; libs nativas extraídas en `research/native/lib/arm64-v8a/` (`libcore_jni.so` 103 MB, `libcore_base.so`).
- Del nativo: la app cambia ajustes publicando `{"state":{"desired":{...}}}` en `$aws/things/<BLID>/shadow/update`; tiene `{ "pmapLearningAllowed" : %s}` y el evento `PMapContinuousLearningAllowedEventState`. Nube: `disc-<env>.iot.irobotapi.com/v1/robot/discover` y `/v1/pmaps/clean-score`. Enviado `desired.pmapLearningAllowed:true` con ese formato: el robot lo ignora (sigue false, `cap.pmaps` null, `optFeats.pmaps.enabled` false).
- Web app: `app/` (probada ya contra el robot real: conecta y da estado) (Node, express+ws+mqtt, `node server.js --mock` para probar sin robot). Hecha por Codex, revisada y corregida por mí (quitado un fallback de express/ws casero que fallaba). Aún no probada contra el robot real.

## Fase actual (2026-10-22): clon web de la app iRobot
- Objetivo del usuario: clon web de la app, estudiar el robot a fondo, desbloquear todas las funciones de la app; después ir más allá. Plan en `research/inventory/roadmap.md`.
- git iniciado en `beta` (sin commits aún); `.gitignore` protege contraseña/APK/volcados.
- Workers: agy falla al arrancar con cualquier modelo (no es cuota: error en 3 s, 0 pasos); Codex sin cuota hasta 20-nov-2026. Se trabaja en directo.
- Ajustes verificados en el robot real (topic `delta`, `{"state":{k:v}}`): `twoPass`, `rankOverlap` (15 actual), `binPause`. Ignorados: `carpetBoost`/`vacHigh`, `pmapLearningAllowed`. Test reutilizable: `research/test-prefs.js` (restaura valores). La web app ya tiene panel de ajustes (`/api/pref`, lista blanca).
- Pendiente fase 1: comandos extra (evac, find…), programación semanal (`cleanSchedule`), `openOnly`, `childLock`, historial local de misiones, mantenimiento/salud; sin tocar Wi-Fi/idioma sin avisar.

## Datos locales (no están en git)
BLID, IP y MAC reales del robot: `LOCAL-NOTES.md` (ignorado por git). Scripts y servidor leen `ROBOT_IP` y `ROBOT_BLID` del entorno. La contraseña está en `research/robot-password.txt` (ignorado).

## Estado al pausar (2026-10-22)
Pausado a petición del usuario. Robot dejado como estaba (ajustes y programación originales verificados, en la base cargando). Hecho: web app con control, ajustes (twoPass, rankOverlap, binPause, openOnly, childLock), buscar, programación semanal, mantenimiento e historial. Pendiente: mapas (pmaps bloqueado; ver análisis de `libcore_jni.so`), comandos extra (evac), historial verificado con misión real, `dispLight`, clon completo de la app.

## Decisiones del usuario
- Permitido el descubrimiento UDP en su red.
- Contraseña por método local (botón HOME ~2 s con el robot en la base): avisarle para que pulse el botón.
- Solo 1 conexión local simultánea: la app oficial queda en modo cloud mientras la web está conectada.
- No continuar con el desarrollo hasta que REA funcione en la sesión.

## Siguientes pasos
1. Comprobar que las herramientas de REA están disponibles en la sesión.
2. Descubrir el robot (UDP), obtener BLID y contraseña, y leer el estado: ¿publica `pose` y qué `cap` declara?
3. Backend (Node + mqtt, REST + WebSocket) y frontend de la web app, repartido con workers (Codex para código; no dos workers sobre los mismos archivos).
4. Si no hay `pose`: analizar el APK de iRobot y su API cloud de mapas (pmaps) con REA + JADX.
5. Git: cambios a `beta`, merge a `main` solo con confirmación del usuario.
