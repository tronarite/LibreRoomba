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
