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
- Probado 2026-10-24 (`research/test-prefs3.js`, restaurado): aceptados vía `delta` `ecoCharge`, `schedHold`, `binTypeDetect` (0/1), `name` (texto). Ignorado: `noPP`. Estado completo con `research/dump-state.js`.
- Estado útil visto: `langs2 {sLang, dLangs.langs[], uLangs:null, aSlots:1}` (hueco para paquete de idioma de usuario: pista para audio), `evacAllowed:true`, `cloudEnv:"prod"`, `svcEndpoints.svcDeplId`, `featureFlags{quietNav,hibLed,...}`.
- Política (usuario): LibreRoomba se monta en paralelo; el robot sigue con la app/nube oficial hasta que se dé por definitivo. No tocar `cloudEnv`/`sdiscUrl` antes.
- Probado 2026-10-24 con el robot (`research/test-disp.js`): `dispLight` false/true por delta: sin efecto visible ni clave nueva en el estado. No soportado en la i1+.
- Probado 2026-10-28 con el robot (LibreRoomba + prueba de No molestar): **`dock` se ignora mientras el robot limpia** (fase `run`): dos órdenes `dock` quedaron en `lastCommand` sin cambio de fase (dorita980: "before dock you need to pause() or stop()"). `RobotCore.command('dock')` ahora envía `stop` y luego `dock`. Tras el `stop` el robot pasa ~1-2 s en `notReady: 39` (guardando el mapa) y TAMBIÉN ignora `dock` en ese hueco: hay que esperar a `notReady: 0` (+3 s de margen). Con eso, probado: `stop/none` → 39 → 0 → `dock` → `stop/dock` → `hmUsrDock` → llega, `evac` (`dock.state` 302 → 303) → `charge` (301). Desde pausa (`stop/clean`) `dock` funciona directo. Arranque de la programación (entrada temporal de `cleanSchedule2`, restaurada): `charge/clean` + `initiator: "schedule"` y 1 s después `run`; si se para aún sobre la base, vuelve directo a `charge` (con notReady 39) y un `dock` en ese momento provoca un **vaciado** (`evac`): no hay que mandarlo. Al volver a la base tras una misión, la Clean Base vacía automáticamente (`hmUsrDock` → `evac` 302 → 303 → `charge` 301). Al arrancar con `start`, el robot reporta primero `phase: charge, cycle: clean, initiator: localApp` y ~2 s después `phase: run` con `missionId` y `mssnStrtTm` nuevos (el `initiator` llega ANTES que la fase). En la base `initiator: "none"`. `dock.state` pasa de 301 (lista) a 300 al salir de la base. Atasco real: `phase: stuck`, `error: 2` (extractores) y `notReady: 6` a la vez (confirma notReady N = código 200+N: «Start-Refuse 6» extractores).
- Probado 2026-10-24 con el robot (`research/robot-run.js`): `{"command":"evac"}` por `cmd` FUNCIONA (fase `evac` ~16 s en la base y vuelve a `charge`). Misión real con `start` (~110 s limpiando, sin llegar a mandar `dock` desde el script por interrupción; luego `stop` y `dock` manuales funcionaron): por MQTT local solo llegan `cleanMissionStatus` (charge/clean -> run/clean) y `wifistat` cada 10 s. NO llegaron `pose`, `vslam_report`, `map_save` ni claves nuevas durante la limpieza: el robot no emite telemetría de mapa por la conexión local; el mapa depende de la nube.
- `bbmssn` (contadores de por vida): `{aCycleM:115, nMssnF:103, nMssnC:234, nMssnOk:222, aMssnM:285, nMssn:558}` (nMssn = total; nMssnOk/nMssnC/nMssnF parecen exitosas/completadas/fallidas; aCycleM/aMssnM probablemente minutos acumulados/medios: sin confirmar).

## Nube de iRobot: flujo de login (2026-10-24; descubrimiento público probado, el resto sin probar)
- `GET https://disc-prod.iot.irobotapi.com/v1/discover/endpoints?country_code=ES` (sin autenticación) devuelve `deployments` (v005/v007/v011; actual v011) con `httpBase`/`httpBaseAuth`/`userServicesBase`/`mqtt` (AWS IoT us-east-1) y `gigya.{api_key, datacenter_domain}`. El `svcDeplId` del robot (`v011`) coincide.
- Login (script `research/cloud/login.js`, lo ejecuta el usuario): Gigya `accounts.login` -> `POST {httpBase}/v2/login` con `{app_id, assume_robot_ownership:"0", gigya:{signature,timestamp,uid}}` -> credenciales AWS temporales y `robots{blid:{name,sku,password...}}`. Solo lectura.
- Siguiente (tras el login): consultar `pmaps` de la cuenta con las credenciales AWS (firma SigV4 en `httpBaseAuth`) y ver el estado del interruptor `PMAP_CL_FSW`. Hasta entonces, no modificar nada en la cuenta.
