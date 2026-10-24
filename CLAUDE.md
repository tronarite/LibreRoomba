# LibreRoomba

Objetivo: clon web de la app de iRobot para controlar la Roomba i1+ del usuario en local, estudiar el robot a fondo y desbloquear todas las funciones de la app (mapas incluidos); después ir más allá.

## Cómo retomar (leer primero)
1. Datos reales (IP, BLID, MAC, cómo arrancar): `LOCAL-NOTES.md` (ignorado por git). Scripts y servidor leen `ROBOT_IP` y `ROBOT_BLID` del entorno. Contraseña: `research/robot-password.txt` (ignorado; el robot la entrega con un `0x00` final que hay que quitar).
2. **Solo 1 conexión MQTT local a la vez**: parar la web app (`app/server.js`) antes de lanzar scripts de `research/`, y al terminar dejarla parada para que la app oficial recupere el robot.
3. Si MQTT responde "Bad username or password": la contraseña cambió. Con el robot en la base, `node research/get-password.js <ip>` y pedir al usuario que mantenga HOME 2-3 s hasta que parpadee el icono Wi-Fi (si el eco acaba en `03`, no está en modo emparejamiento).
4. Pruebas que cambian algo en el robot: guardar el valor previo y restaurarlo siempre (ver `research/test-prefs.js`, `test-prefs2.js`, `test-schedule.js`). No tocar Wi-Fi ni idioma sin avisar. Ajustes originales a respetar: twoPass false, rankOverlap 15, binPause true, openOnly false, childLock false, programación L-V 10:00.
5. Git: rama `beta`, remoto `origin` = repo PRIVADO `tronarite/LibreRoomba` en GitHub (subido 2026-10-24; solo existe `beta`). Merge a `main` solo con confirmación del usuario. Nunca subir BLID, IP, MAC, contraseña, correo, APK ni volcados (ver `.gitignore`); comprobar con grep antes de commitear.
6. Workers (ver `~/.claude/CLAUDE.md`, "Flujo rápido"): `run-parallel.ps1` con JSON, `effort: low`, destino agy; Codex sin cuota hasta 2026-11-20. En esta sesión agy falló al principio por un conflicto entre el modelo `gemini-3.8-flash-high` y `--effort`; otro proceso lo estaba diagnosticando y después funcionó con `effort: low`. Siempre verificar que los archivos existen y pasar los autotests.

## Estado de la investigación
- Robot: i1+ (sku i155640), firmware `daredevil+2.6.0`, hardware equivalente a la i3. `cap.pmaps` null; `maps: 2`.
- Protocolo local (ver `research/protocol-notes.md`): descubrimiento UDP 5678 con `irobotmcs`; MQTT TLS 8883, usuario=clientId=BLID, cifrado `AES128-SHA256` + `SSL_OP_LEGACY_SERVER_CONNECT`. Órdenes: topic `cmd` `{"command":X,"time":N,"initiator":"localApp"}` (start, stop, pause, resume, dock, find probados); ajustes: topic `delta` `{"state":{clave:valor}}`.
- Ajustes aceptados (probados, restaurados): `twoPass`, `rankOverlap`, `binPause`, `openOnly`, `childLock`, y `cleanSchedule2` (programación; se puede cambiar de verdad). Ignorados: `carpetBoost`/`vacHigh`, `pmapLearningAllowed` (también con el formato `desired` del shadow). `dispLight` no lo reporta la i1 (sin probar).
- Mapas: `pmaps: []`, `pmapLearningAllowed: false`, `optFeats.pmaps.enabled: false`, `mapUploadAllowed: true`; hay telemetría `vslam_report`/`map_save`. No llega `pose` ni durante una misión (50 s probados). El bloqueo parece venir de la nube.
- APK iRobot Home 7.18.0 (firma de iRobot verificada): decompilado con jadx en `research/jadx-out/`; recursos en `research/jadx-res/`; splits del Pixel 10a en `research/apk-splits/`; libs nativas en `research/native/lib/arm64-v8a/` (`libcore_jni.so` 103 MB, `libcore_base.so`). La lógica está en C++ (capa Djinni `com.irobot.core`); el Java casi no tiene URLs. Del nativo: ajustes vía `{"state":{"desired":{...}}}` en `$aws/things/<BLID>/shadow/update`; nube `disc-<env>.iot.irobotapi.com/v1/robot/discover`, `/v1/pmaps/clean-score`; orden de limpieza por zonas `{"command":"clean","regions":[...],"pmap_id","pmapv_id"}` (requiere pmap).
- Herramientas instaladas: jadx (CLI vía `java -cp jadx-gui-1.5.6-all.jar jadx.cli.JadxCLI`), adb. El MCP de REA no sirve para APK sin `REA_JADX_MCP_JAR`.
- Inventario y plan: `research/inventory/roadmap.md` (+ `native-commands.txt`, `app-ui-titles.txt`).

## Web app (`app/`)
Node (express + ws + mqtt). Arquitectura: `app/core/` es el núcleo sin HTTP (`robot.js` conexión/reconexión/estado y toda la validación, `policy.js` lista blanca única, `fake-robot.js` robot simulado con el protocolo real, usado por `--mock` y por las pruebas); `server.js` es solo la capa web. Pruebas: `cd app && npm test` (15). `node server.js --mock` prueba sin robot; sin `--mock` exige `ROBOT_IP` y `ROBOT_BLID`. Solo escucha en 127.0.0.1 (sin autenticación). Tiene: control (limpiar, pausa, reanudar, parar, base, buscar), ajustes (lista blanca en `/api/pref`), programación semanal (`/api/schedule`), estado y mantenimiento (`/api/maintenance`), historial de misiones propio (`/api/history`, guarda en `app/data/`; registra las misiones que ve y, al arrancar, cuántas ocurrieron con el servidor apagado usando `bbmssn.nMssn`; sin probar con misión real). Dato dudoso no mostrado: `bbmssn.aMssnM` (unidad desconocida).

## Pendiente
1. Mapas: ver cómo se activa `optFeats.pmaps` (analizar `libcore_jni.so`/`libcore_base.so` y la API de descubrimiento) y reconstruir mapa con telemetría `vslam`. Si implica suplantar el modelo del robot o saltarse la autenticación de la nube, parar y consultar al usuario; leer lo que la app oficial ya hace con su cuenta es aceptable.
2. Comandos extra (vaciar depósito `evac`), probar `dispLight`, historial con una misión real, significado de `rankOverlap` (15/25/67/85) y de `aMssnM`.
3. Clon completo de la app (ver fases en `research/inventory/roadmap.md`) y después "ir más allá".

## Decisiones del usuario
- Permitido el descubrimiento UDP en su red y probar ajustes inofensivos con restauración.
- Solo 1 conexión local simultánea: la app oficial queda en modo cloud mientras la web está conectada.
- Usar workers cuando sean útiles; el código crítico lo escribo yo.

## Dos vías de trabajo (decisión del usuario, 2026-10-24)
- **Sin robot** (siempre activa): recopilar la mayor cantidad de recursos e información (APK, nativo, protocolo, inventarios en `research/inventory/`), diseñar y construir la web app contra `--mock`. No conectar al robot.
- **Con robot** (solo cuando el usuario diga "tenemos acceso a la Roomba"): pruebas reales, con restauración; trabajarlas a fondo en ese momento. Hasta entonces acumular una lista de pruebas pendientes en `research/inventory/pending-robot-tests.md`.
- LibreRoomba se monta en paralelo: la Roomba sigue con la app y la nube oficiales hasta que el usuario dé todo por definitivo. No tocar `cloudEnv`/`sdiscUrl` antes.
- agy: sin shell por defecto (en modo no interactivo deniega comandos). Para tareas que necesiten strings/grep usar `-AllowCommands` (JSON de run-parallel: `"allowCommands": true`): sandbox + auto-aprobación solo en esa ejecución, modo `auto` si no hay `write`; ~2-3 min por tarea. Sin él, agy solo lee/escribe archivos.
