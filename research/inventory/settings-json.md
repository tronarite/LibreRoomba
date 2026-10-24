# JSON de ajustes locales (análisis con `strings -a`, 2026-10-24)

REA no pudo usarse: no hay proveedor disponible para ELF arm64 en este Windows (Ghidra/IDA/Kuna sin configurar, Hopper solo macOS). Todo sale de cadenas de formato de `libcore_base.so` y `libcore_jni.so`; sin pseudocódigo. Nada probado en el robot. Topic local supuesto: `delta` con `{"state":{...}}` (como en los ajustes ya probados) salvo que se indique otra cosa.

| Ajuste | Topic | JSON | Evidencia | Confianza |
|---|---|---|---|---|
| Succión (SetSuctionLevel) | delta / shadow desired | `{ "suctionLevel" : %d}` (int) | cadena en libcore_base; también `"desired" : {"suctionLevel": %d}` | Media (la i1 ignoró carpetBoost/vacHigh; puede ignorarlo) |
| Nombre (SetName) | delta | `{"name":"%s"}` (string) | cadena en libcore_base | Media (el campo reportado es `name`, no `robotName`; sin comprobar) |
| NTP (SetNtpHosts) | delta | `{ "ntphosts" : "%s" }` (string) | cadena en libcore_base | Media |
| Luz del display (SetDisplayLight) | delta | `{ "dispLight" : %s}` (bool) | cadena en libcore_jni | Media (la i1 no lo reporta) |
| Modo ODOA (SetODOAMode) | delta | `{ "odoaMode" : %s}` (probable int/bool) | cadena en libcore_jni | Baja-media |
| Patrón luz de carga (SetChargingLightRightPattern) | delta | `{ "chrgLrPtrn" : %s}`; en el catálogo de eventos: `"set": {"chrgLrPtrn": %d}`, `"get": {"setting": "chrgLrPtrn"}` (int) | cadenas en libcore_jni (mismo bloque que `edgeClean`) | Media |
| Tipo de depósito | delta | `{ "binTypeDetect" : %s}` | cadena en libcore_jni | Media |
| Eco charge | delta | clave `ecoCharge` | cadena `,"ecoCharge":` | Baja (formato exacto no visto) |
| Gentle mode (SetGentleMode) | ? | clave `gentleMode` (la UI usa `gentle_mode`) | solo nombres de clave; no hay plantilla JSON | Baja |
| Estrategia de navegación (SetNavStrategy) | ? | clave `navStrategy` | solo nombre de clave | Baja |
| Altura de corte (SetCutHeight) | ? | no aparece ninguna cadena `cutHeight` | solo `CommandId::kSetCutHeight` | Muy baja (probablemente no aplicable a la i1) |
| Evacuar (evac) | cmd | `{ "command" : "evac", "time" : %d, "initiator" : "localApp" }` | `evac` aparece como valor suelto junto a start/stop/dock/clean/quick/spot/train; plantilla de `command` ya conocida | Media-alta en el formato; falta probar que la i1+ lo acepte con la base |

## Otros hallazgos
- Payload de aprovisionamiento (libcore_jni): `{ "timezone" : "%s", "country" : "%s", "cloudEnv" : "%s", "utctime" : %d, "localtimeoffset" : %d, "sdiscUrl" : "%s", "ntphosts" : "%s" }`. `sdiscUrl` es la URL de descubrimiento de servicio y `cloudEnv` el entorno de nube: ahí se fijaría a qué servidor se conecta el robot (relevante para la independencia de la nube; NO probado, no tocar sin confirmar).
- Valores de `command` vistos como cadenas sueltas: `start stop dock clean quick spot train evac` (pause/resume/find ya probados).
- `flushSluice` (`{ "flushSluice" : %d}`) y `language` (`{ "language" : %s }`) también existen.
- Mensajes de evac: "Returning Home to Evac", "Updating evac dock mode to %s", "Bin removed, no longer able to evac".
- Siguiente paso si se quiere pseudocódigo: instalar Ghidra 12.1 con JDK completo y fijar `GHIDRA_INSTALL_DIR`.
