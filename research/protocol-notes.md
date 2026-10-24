# Protocolo local iRobot (verificado leyendo koalazak/dorita980, lib/v2/local.js y lib/discovery.js)

## Descubrimiento
- UDP broadcast: se envía el texto `irobotmcs` a 255.255.255.255:5678 (o unicast a la IP del robot).
- Respuesta JSON con `hostname` = `Roomba-<BLID>` o `iRobot-<BLID>`, `ip`, etc.

## Conexión MQTT
- `tls://<ip>:8883`, MQTT 3.1.1 (protocolVersion 4), clientId = usuario = BLID, password = la del robot.
- Certificado autofirmado (rejectUnauthorized: false).
- TLS legado: cifrado `AES128-SHA256` y `SSL_OP_LEGACY_SERVER_CONNECT`. Configurable con ROBOT_CIPHERS.
- Solo 1 conexión local simultánea (la app oficial pasa a usar cloud mientras estamos conectados).

## Comandos
- Publicar en topic `cmd`: `{"command":"<cmd>","time":<epoch s>,"initiator":"localApp"}`
  - cmd: `start`, `clean`, `pause`, `stop`, `resume`, `dock`, `find`, `evac`, `train`.
  - `start` con args extra para limpiar regiones/habitaciones (cleanRoom), requiere mapas (pmaps).
- Preferencias: topic `delta`, payload `{"state": {...}}` (carpetBoost, vacHigh, openOnly, noAutoPasses, twoPass, binPause, cleanSchedule).

## Estado
- El robot publica JSON `{"state":{"reported":{...}}}` en topics shadow; dorita980 los fusiona.
- Campos relevantes: `cleanMissionStatus`, `pose` (si el robot lo publica; el `cap` indica capacidades), `bin`, `batPct`, `signal`, `sku`, `cap`, `pmaps`, `lastCommand`.
- `cap` lista capacidades: pose, maps, ota, multiPass, carpetBoost, pp, binFullDetect, edge, eco, svcConf...

## Pendiente de verificar EN EL ROBOT
- Si el i1+ publica `pose` y qué `cap` declara.
- Firmware (3.x) y si el cifrado legado sigue válido.
- BLID/password: mantener HOME ~2 s (suena) con el robot en la base, y ejecutar `get-roomba-password <ip>`.

## Mapas: hallazgos del análisis estático (2026-10-24)
- `libcore_base.so` define `GigyaConst::kPMapCLFeatureSwitchKey` y la cadena `PMAP_CL_FSW`: el aprendizaje de mapas (pmap CL) se controla con un *feature switch* de la **cuenta de iRobot (Gigya)**, no solo del robot.
- `MapsCapabilitiesProvider` (`setPMapLearningAllowed`, `getMapCapabilityState`, `updateSettings`) combina ese switch con `optFeats`/`pmapLearningAllowed` del robot; si no se soporta registra "Skipping check for PMapLearningAllowed, it is not supported."
- Comandos locales existentes: `{ "pmapLearningAllowed" : %s}` y `{ "pmapCL" : %s}` (la i1 ignoró el primero).
- Conclusión: el bloqueo es de cuenta/nube. Activarlo implicaría tocar el switch de la cuenta o suplantar al cliente: parar y consultar al usuario.
- Pendiente de probar (solo local, reversible): enviar `{"state":{"pmapCL":true}}` por `delta` y observar `optFeats`.
- Probado 2026-10-24 (`research/test-pmapcl.js`): `{"pmapCL":true}` por `delta` y por shadow `desired` es ignorado; `optFeats.pmaps.enabled` sigue false, `cap.pmaps` null. Confirma que el bloqueo es de cuenta/nube.
