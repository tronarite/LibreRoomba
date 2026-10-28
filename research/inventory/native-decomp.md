# Pseudocódigo del nativo (Ghidra 12.1.4 headless, `research/tools/ghidra/run.sh`) — 2026-10-24
Binario: `libcore_base.so` (arm64). REA no analiza ELF arm64 en Windows, por eso se usa Ghidra directo.

## gentleMode / navStrategy: no aplican a la i1+
- `AssetCapabilitiesImpl::supportsGentleModeV2()` devuelve `AssetCapabilityRecord::gentle() > 1`: el modo suave es una **capacidad que declara el robot**. El `cap` de esta i1+ (binFullDetect, addOnHw, oMode, dockComm, edge, maps, pmaps, mc, tLine, area, eco, multiPass, team, pp, lang, 5ghz, prov, sched, svcConf, ota, log, langOta) **no tiene clave `gentle`** → no soportado.
- `AtlantisPreferencesDeserializer::deserializeToNavStrategyEvent` lee un entero (`json11 int_value`) en un evento `NavStrategyEventState`: es de la familia "Atlantis" (otros modelos), no de la i1+.
- Decisión: **no enviar** `gentleMode` ni `navStrategy` al robot (no hay forma de restaurar un valor que no reporta). Quitar de las pruebas pendientes.

## Pendiente de decompilar
`isLanguageOTAV2Supported`, `attemptLocalOta`, serializador de `RequestOtaCommand` (nombres sin sufijo `V2`/`Ota` exacto en esta librería: probar patrones `Ota+Language`). Los otros candidatos están en `libcore_jni.so` (103 MB, análisis mucho más lento).

## OTA de idioma / OTA local (libcore_jni.so, Ghidra 12.1.4; análisis parcial por límite de tiempo, pero con símbolos) — 2026-10-24
- `LanguageSettingImpl::isLanguageOTAV2Supported` solo devuelve un indicador (offset 0x3a) rellenado desde las capacidades del robot. Tu i1+ declara `cap.langOta: 2` -> **soporta la OTA de idioma V2**.
- `UpdateUIServiceImpl::attemptLocalOta` lee un **archivo de firmware empaquetado en la app** (`bundledFirmwareFileName()` + `dataForFileNamed`) y se lo entrega al robot por red local (`deploymentId: "localota"`). El APK 7.18.0 no contiene ningún archivo de firmware (solo fuentes, iconos y clases): esa vía no existe para la i1+.
- Los paquetes de voz son otra cosa: OTA bajo demanda que el robot descarga de la nube (`RobotLanguagePackV2`, `manifest.json`). Nada indica un canal local para subir audio.
- **Conclusión audio:** reproducir audio propio en los altavoces no es posible por MQTT local; la única vía conocida es que el robot descargue un paquete de idioma desde un servidor que controlemos, lo que exige redirigir su descarga (tocar la configuración de nube del robot) y además se desconoce el formato y si el robot verifica una firma. Requiere captura de una descarga real (proxy en la red) antes de intentarlo. Sin permiso expreso, no se toca.

## Formato de `regions` en la orden `clean` (2026-10-28, solo strings)
- `libcore_base.so` contiene la plantilla `{ "command":"clean", "ordered": %d, "regions" : %s, "pmap_id": "%s", "pmapv_id": "%s", "time" : %d, "initiator" : "%s" }` y las claves sueltas `region_id`, `user_pmapv_id`, `favorite_id`.
- `libcore_jni.so` solo aporta nombres de la UI (`RegionSetup`, `RegionSelected`, `KeepOutZone`, `AddKeepOutZone`...), no el formato del JSON.
- Prueba real previa (`research/test-modes.js regions`): `regions:[{region_id:'1',type:'rid'}]` con ids falsos → error 224. Sin pmaps en la i1+ el rechazo no depende del formato, así que no se puede confirmar cuál es el correcto sin un robot con mapas. Para fijarlo haría falta desensamblar con Ghidra quien rellena `%s` de `regions` (lento; sin utilidad práctica en la i1+).

## Tiempo real: pistas del nativo (2026-10-28, strings + Ghidra sobre `libcore_base.so`)
- Nube (AWS IoT): `/things/%s/mission/timeline/request` y `.../timeline/report` (`GetMissionTimelineCommand`, solo si la capacidad `missionTimeline` del robot lo declara: `supportsMissionTimelineRequest`) y `/things/%s/mission/rrtp/request` + `/rrtp/report/update` (RRTP, sin significado confirmado; posiblemente posición en tiempo real). `MissionTimelineLocalizingObject` lleva `regionId`, `mapId`, `mapVersion`, `zoneId`: la línea de tiempo habla de zonas de un pmap, así que en la i1+ (sin pmaps) probablemente no aplica.
- Local: `BaseSecureSocketProtocolSerializer` define los topics `kMessageTopicForCommand` (`cmd`), `ForStateChanges`, `ForPackageUpdate`, `ForWifiControl`, `ForWifiLoggingConfiguration`, `ForRobotLoggingConfiguration`, `ForUmiCommands` y **`ForLocalRrtpRequest`**: existe una petición RRTP por el canal local. Los valores de esas constantes no salen en `strings` (literales cortos inline) y los símbolos de datos no se pueden decompilar como funciones; `DumpDecomp.java` filtra por nombre de función, así que habría que leer la inicialización estática (`_GLOBAL__sub_I_*`) o los xrefs al símbolo.
- Capacidad relacionada: `supportsVSlamNavigation` / `supportsVSLAM` (la i1+ no declara pmaps; la i3 equivalente usa `vslam`).
- Pendiente (con robot): suscribirse a `#` durante una misión buscando topics distintos de `delta`/`wifistat`, y probar publicar en el topic RRTP local una vez conocido su nombre.

## Topics MQTT locales y posición en tiempo real (2026-10-28, Ghidra sobre `libcore_base.so`, solo análisis estático)
Valores leídos de `_INIT_163` (constantes de `BaseSecureSocketProtocolSerializer`; strings cortas inline, ya decodificadas):

| Constante | Topic local | Uso |
|---|---|---|
| `kMessageTopicForCommand` | `cmd` | órdenes (ya usado) |
| `kMessageTopicForStateChanges` | `delta` | ajustes (ya usado) |
| `kMessageTopicForWifiControl` | `wifictl` | control Wi-Fi (no tocar) |
| `kMessageTopicForWifiLoggingConfiguration` | `wifilog` | registro Wi-Fi |
| `kMessageTopicForRobotLoggingConfiguration` | `logUpload` | subida de logs |
| `kMessageTopicForPackageUpdate` | `deployment` | OTA/paquetes (no tocar) |
| `kMessageTopicForUmiCommands` | `umi/req` | comandos UMI estilo `{"do": ...}` |
| `kMessageTopicForLocalRrtpRequest` | `req` | petición de posición en tiempo real (RRTP) |
| `kMessagePayloadTemplate` | — | `{"state": %s}` |

- **Posición del robot** (`GetRobotPositionLocalSecureSocketSerializer`, comando `GetRobotPositionCommand`): publica en `req` la plantilla `{ "reqId" : "%s" , "reqType" : "%s" , "conType" : "%s"}`. La respuesta es un `RobotPositionEvent` (`reqId`, `reportType`, `ver`, `coordinatesType`, lista de `PositionData`). Hay casos de uso `RobotPositionUseCase` y `OmapRobotPositionUseCase` (mapa en vivo en la app). Valores válidos de `reqType`/`conType` y topic de respuesta: sin determinar (hay que leer el `RobotPositionCommand` o observar una respuesta).
- **Pose UMI** (`LegacyGetPoseLocalSecureSocketSerializer`): publica en `umi/req` `{"do": "get", "args": ["pose"], "id": N}`; la respuesta se procesa en un parser que registra "Could not parse mqtt umi pose response". También existe `{"do": "set", "args": [%s]}`.
- **Conducción manual** (`DriveCommandLocalSecureSocketSerializer`): `"drive", {"mode":3, "l":<velocidad>, "r":<velocidad angular>, "flags":...}` por `umi/req`. MUEVE el robot: nunca probar sin que el usuario lo pida expresamente.
- Herramienta nueva: `research/tools/ghidra/run.sh refs <proyecto> <nombre> <programa> <símbolo+...> <salida.c> [max]` (script `DumpSymbolRefs.java`) decompila las funciones que referencian un símbolo; así se leen constantes estáticas que `strings` no ve.
