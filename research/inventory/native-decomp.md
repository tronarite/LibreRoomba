# Pseudocódigo del nativo (Ghidra 12.1.4 headless, `research/tools/ghidra/run.sh`) — 2026-10-24
Binario: `libcore_base.so` (arm64). REA no analiza ELF arm64 en Windows, por eso se usa Ghidra directo.

## gentleMode / navStrategy: no aplican a la i1+
- `AssetCapabilitiesImpl::supportsGentleModeV2()` devuelve `AssetCapabilityRecord::gentle() > 1`: el modo suave es una **capacidad que declara el robot**. El `cap` de esta i1+ (binFullDetect, addOnHw, oMode, dockComm, edge, maps, pmaps, mc, tLine, area, eco, multiPass, team, pp, lang, 5ghz, prov, sched, svcConf, ota, log, langOta) **no tiene clave `gentle`** → no soportado.
- `AtlantisPreferencesDeserializer::deserializeToNavStrategyEvent` lee un entero (`json11 int_value`) en un evento `NavStrategyEventState`: es de la familia "Atlantis" (otros modelos), no de la i1+.
- Decisión: **no enviar** `gentleMode` ni `navStrategy` al robot (no hay forma de restaurar un valor que no reporta). Quitar de las pruebas pendientes.

## Pendiente de decompilar
`isLanguageOTAV2Supported`, `attemptLocalOta`, serializador de `RequestOtaCommand` (nombres sin sufijo `V2`/`Ota` exacto en esta librería: probar patrones `Ota+Language`). Los otros candidatos están en `libcore_jni.so` (103 MB, análisis mucho más lento).
