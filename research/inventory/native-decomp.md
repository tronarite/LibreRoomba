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
