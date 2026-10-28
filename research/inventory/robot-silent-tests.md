# Pruebas silenciosas con el robot (2026-10-28, solo lectura)

Robot en la base (`charge/none`, `notReady=0`), web app parada. Conexión MQTT TLS local, clientId=usuario=`<BLID>`. Sin motor, sonido ni luces.

## Suscripción a `#` (60 s)
Solo dos topics:
- `$aws/things/<BLID>/shadow/update`: 1 mensaje (el estado completo al conectar) y nada más en 60 s (en reposo no hay telemetría periódica).
- `wifistat`: 3 mensajes en 60 s (5 en 88 s).

Claves de primer nivel del estado: batPct, batteryType, batInfo, batAuthEnable, bbchg, bbchg3, bbmssn, bbnav, bbpause, bbrstinfo, bbrun, bbswitch, bbsys, behaviorFwk, bin, binPause, binTypeDetect, cap, carpetBoost, childLock, cleanMissionStatus, cleanSchedule2, cloudEnv, connected, country, deploymentState, dock, evacAllowed, ecoCharge, featureFlags, hwPartsRev, hwDbgr, langs2, lastCommand, lastDisconnect, mapUploadAllowed, missionTelemetry, mssnNavStats, name, noAutoPasses, noPP, openOnly, optFeats, pmapLearningAllowed, pmaps, pmapShare, rankOverlap, reflexSettings, sceneRecog, schedHold, secureBoot, sku, softwareVer, subModSwVer, svcEndpoints, timezone, tls, twoPass, tz, vacHigh, netinfo, signal, wifistat, wlcfg.

## Peticiones de lectura de pose (todas SIN respuesta)
Escuchando `#` durante los 12 s siguientes a cada una; no llegó ningún topic nuevo ni mensaje con `reqId`, `coords` o `pose`:
| topic | payload |
|---|---|
| `req` | `{"reqId":"1","reqType":"pose","conType":"local"}` |
| `req` | `{"reqId":"2","reqType":"pose","conType":"rrtp"}` |
| `req` | `{"reqId":"3","reqType":"position","conType":"local"}` |
| `umi/req` | `{"do":"get","args":["pose"],"id":1}` |

Estado antes y después: `charge/none`, `notReady=0`, sin cambios. El broker no devolvió error ni desconexión.

## Conclusión
- En la base no se ve pose por ninguna de estas peticiones. El robot no publica en `req`/`umi/req` de respuesta con estos formatos (los `reqType`/`conType` probados son suposiciones). Puede que el formato RRTP real sea distinto o que solo responda durante una misión (el acumulador de `core/localmap.js` ya pide la posición cada 2 s en misión: ahí sí hay que mirar).
- Pendiente (necesita misión, no silencioso): repetir con el robot en `run`.

## Lectura del estado completo (2026-10-28, robot en la base, solo lectura)
- `nMssn` pasó de 558 a 567 desde la última lectura: el usuario hizo misiones con la app oficial entre medias.
- `missionTelemetry` (el robot declara qué informes de misión emite; todos a 1 salvo `pmap_navigability: 0`): `aux_comms, backup_counts, bat_stats, behaviors_report, camera_settings, coverage_report, map_hypotheses, map_load, map_save, mboe_landmark_stats, mboe_reloc, mission_stats, sensor_stats, tumor_classifier_report, vital_stats, vslam_report`. Son los informes que la nube recibe al acabar (los UMF de cada misión); no hay pistas de que lleguen en vivo por MQTT local.
- `pmaps: []`, `pmapShare: {copy: null}`, `pmapLearningAllowed: false`, `mapUploadAllowed: true`, `sceneRecog: 1`, `optFeats.pmaps.enabled: false`: sin mapas persistentes (coincide con `cap.pmaps: null`).
- `mssnNavStats` (por misión): `mpSt: "idle"`, `gLmk/lmk` (marcas de referencia visuales), `reLc` (relocalizaciones), `plnErr`, `l_drift/h_drift`, `l_squal/h_squal`: el robot navega con marcas visuales; en reposo todo a 0. Mirarlo DURANTE una misión daría calidad de localización en vivo.
- `featureFlags`: `childLockEnable, hibLed, covPlan, ros2SptLvl, clearHaz, umcsIfNotDrc, quietNav`.
