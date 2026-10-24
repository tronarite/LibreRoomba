# API de la nube de iRobot (solo lectura, probada con la cuenta del usuario, 2026-10-24)
Flujo en `research/cloud/login.js` (lo ejecuta el usuario; contraseña oculta) y consultas en `research/cloud/query.js` (GET con firma AWS SigV4, `execute-api`, `us-east-1`, base `httpBaseAuth` del despliegue v011). Sesión y respuestas en `research/cloud/` (ignoradas por git).

| Ruta (`%s` = BLID) | Resultado |
|---|---|
| `GET /v1/%s/pmaps?visible=true&activeDetails=2` y `/v1/%s/pmaps` | HTTP 200, **lista vacía**: la cuenta no tiene ningún mapa persistente |
| `GET /v1/%s/missionhistory` | 200, 32 misiones desde 2026-07-16; por misión: `done` (ok/cncl/stuck/inc), `durationM`, `sqft`, `evacs`, `dirt`, `timeline` (eventos), `pmaps_robot`, `pmaps_info`, `wlBars`, `nMssn`... |
| `GET /v1/%s/pmaps/{pmapId}/versions/{ver}` | 200: `pmap_id, pmapv_id, create_time, proc_state, nMssn, mission_id, learning_percentage, shareability, robot_cap{maps}, sku, software_ver, seg_transfer` |
| `GET /v1/%s/pmaps/{pmapId}/versions/{ver}/umf` | 200, ~35 KB: **mapa UMF 4.9.0 de esa misión** |
| `GET /v1/%s/pmaps/{id}/settings` | 404 |

## Hallazgos
- Cada misión crea su **propio mapa temporal** (31 de 32 misiones, 31 `pmap_id` distintos, `learning_percentage` 100) y nunca se promueve a mapa persistente del hogar. Coherente con el aprendizaje de mapas desactivado (`pmapLearningAllowed:false`, `optFeats.pmaps.enabled:false`, interruptor de cuenta `PMAP_CL_FSW`).
- El robot **sí mide y sube** el mapa de cada misión. Por MQTT local no llega nada de eso (probado en una misión real): solo se obtiene de la nube.
- Estructura UMF de una misión: `maps[0].map_header` (resolution 0.1049 m, area m², create_time, nmssn), `regions`, `borders`, `keepoutzones`, `typed_poses{start_pose,end_pose,dock_poses}` y `layers`: `coverage` (multipoint2d, celdas limpiadas en metros), `dirt`, `coverage_poly` (multipolygon2d), `clutter`, `escape_events` (pose + evento, p. ej. `side_brush_stall_detected`), `operatingMode_coverage_poly`, `deltas`.
- `aMssnM`/`durationM`: en el historial `durationM` va en minutos (1-335 min, mediana 221); `bbmssn.aMssnM` (285) sigue sin aclarar.

## Siguiente
1. Dibujar un mapa fusionando la cobertura de todas las misiones (leyendo cada UMF, solo lectura).
2. Para que el robot guarde un mapa persistente hay que activar el aprendizaje de mapas en la cuenta: modifica la cuenta en la nube -> pedir permiso al usuario antes.
3. Para no depender de la nube: averiguar cómo sube el robot el mapa (canal AWS IoT/HTTPS) y si se puede recibir en local.

## Interruptor de mapas (2026-10-24, con permiso expreso del usuario)
- Gigya `accounts.getAccountInfo` (sesión guardada por login.js; firma de sesión estilo OAuth1 en `research/cloud/account.js`): la cuenta solo tenía 4 campos `data` (oracleOptIn, COMMERCIAL_MESSAGE_OPTIN, HKC_NOTIFICATION_CENTER_FSW, oracleContactID); los `*_FSW` guardan una marca de tiempo (texto). `getSchema`: `PMAP_CL_FSW` es `clientModify` (el usuario puede escribirlo); `USER_OPTIN_PMAPS_LEARNING_FSW` no está en el esquema.
- Prueba: `PMAP_CL_FSW = "<epoch>"` escrito con `setAccountInfo` (`research/cloud/set-flag.js set`), robot observado ~1 min y luego `pmapLearningAllowed`/`pmapCL` por delta y desired: **sin ningún efecto** (`optFeats.pmaps.enabled:false`, `pmapLearningAllowed:false`, `cap.pmaps:null`). Cambio **revertido** (`set-flag.js restore`: el campo no existía y se borró).
- Conclusión: el mapa persistente (Imprint) está limitado por la capacidad del robot (`cap.pmaps: null`, firmware; la i1/i1+ no trae mapeo inteligente), no por la cuenta. El camino viable es el mapa por misión (UMF) de la nube, que sí existe.

## Piezas del robot (Robot Health), 2026-10-24
- `GET /v1/robots/%s/parts` (base `httpBaseAuth`): 200. `{robot_id, num_parts, parts[{part_id, counter, minutes_remaining, count_type:"minutes", count_remaining, count_used, counter_category:"replacement", reset_by:"user"}]}`. Tu robot: 4 piezas (ids `35`, `36`, `37`, `139`).
- Lectura: la pieza `139` tiene 46 921 min usados y 0 restantes (agotada); la `35` tiene 2711 min usados y **420 min restantes** (se agota pronto); `36`: 6660 restantes; `37`: 7200 restantes.
- El nombre de cada `part_id` NO está en el APK: el catálogo (`MaintenancePartV2`: partName, replaceInterval...) lo baja la app de la nube (ContentStack) y `GET /v1/%s/maintenance/{id}` da 403 con la sesión de usuario. Para saber qué pieza es cada id: compararlo con la pantalla "Salud del robot" de la app oficial. Los contadores se reinician desde la app (ruta de escritura: no usada).
