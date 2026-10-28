# Valores reales de la petición de posición RRTP local (fork E, 2026-10-28)

Leyenda: **[leído]** = valor real leído de la librería en ejecución (arnés de la VM: `dlopen` de `libcore_base.so`/`libcore_jni.so` bajo qemu + volcado de los `std::string` globales) o del desensamblado; **[inferido]** = deducido, sin confirmar con el robot.

## Resultado corto
1. Los valores que ya probábamos eran los correctos: **`reqType = "current"`** y **`conType = "local"`** **[leído]**. La petición `req` con esos valores ya se envió (matriz del 2026-10-28 y misión real de ~90 s con `app/data/mission-capture.jsonl`) y el robot **no contestó**. Por tanto el fallo no está en el formato de la petición.
2. Causa más probable **[inferido, con evidencia fuerte]**: la i1+ **no declara la capacidad `pose`** en su `cap` y no tiene `pmaps`, y RRTP/`get pose` solo existen en robots con ellas (ver §4). Hay que esperar que el robot ignore la petición, como hace.

## 1. Cómo se construye la petición (leído)
- `RobotPositionUIServiceImpl::sendGetRobotPositionCommand()` (`libcore_jni.so`, 0x3da3c7c) crea `GetRobotPositionCommandValue(string a, string b)` (ctor 0x3da5ee4: `a` → campo en +8, `b` → campo en +0x20) y lo envía como `AccessorCommand`.
  - `b` = global `std::string` en `libcore_jni.so` 0x6245bf8 = **`"current"`** [leído: volcado tras `dlopen`].
  - `a` = `std::string` estática de función (guard 0x6245c28), inicializada en la primera llamada con `this->[+24]->vtable[216]()->vtable[88]()` (un objeto de la sesión/app que devuelve texto; **[inferido]** un identificador de la app/sesión, no un contador). Es el **`reqId`**.
- `GetRobotPositionLocalSecureSocketSerializer::valueToData` (`libcore_base.so`, 0x766400) rellena la plantilla (56 bytes, 0xd7d desde el inicio de la función) con `vformat(plantilla, a, b, global_0x92fc78)`:
  - `%s` 1 = `a` → **`reqId`**; `%s` 2 = `b` → **`reqType`** = `"current"`; `%s` 3 = global `libcore_base.so` 0x92fc78 → **`conType`** = **`"local"`** [leído].
  - Plantilla literal: `{ "reqId" : "%s" , "reqType" : "%s" , "conType" : "%s"}` (con esos espacios).
  - Se envuelve con `LocalMQTTMessage::createDataMessage(<topic>, <json>)` y `DataMessage::getEncodeData()`.
- Topic **[leído]** (`BaseSecureSocketProtocolSerializer::kMessageTopicForLocalRrtpRequest`, 0x92fc28): **`req`**. Otros topics locales leídos: `cmd` (órdenes), `delta` (cambios de estado), `umi/req` (UMI), `deployment` (paquetes/OTA); respuesta UMI en `umi/resp` (`kUmiResponseTopic`); clave contenedora de la respuesta de posición: **`data`** (`kRobotPositionResponseTopic`).
- Nube (no local) **[leído]**: petición en `/things/%s/mission/rrtp/request`, respuesta en `/things/%s/mission/rrtp/report/update` (`ThingShadowConstants::kRobotPositionRequestTemplate` / `kRobotPositionSuffixTemplate`). Serializador `GetRobotPositionAwsIotRobotSerializer` (cuerpo JSON construido con json11; las claves exactas no se leyeron).
- Enums Java **[leído]** (`research/jadx-out`): `RobotCoordinatesType { Unknown, Current }` (→ `"current"`), `RobotPositionTypeEnum { Start, End }` y `OmapRobotPositionType { Start, End }` (posiciones de inicio/fin de misión, para el historial en la nube), `RequiredConnectionType { Remote, Local }` (→ `"local"` en la petición local; `Remote` sería la vía nube, **[inferido]**).
- `RobotPositionUIServiceCommand` solo tiene `RequestCurrentLocation`. **No existe** modo de suscripción/streaming: es una consulta puntual (la app la repite). No se encontró ninguna orden previa que active la telemetría.

## 2. Respuesta esperada (de fork A + lo anterior)
Clave contenedora `data`; campos que lee `RobotPositionDeserializer`: `ver`, `reqId`, `reportType`, `data` → `coords[]` → `type`, `xyt` ([x, y, theta]), `ts`, `pmap_id`, `pmapv_id` **[leído como nombres]**. Forma **[inferido]**: `{"ver":..,"reqId":"..","reportType":"..","data":{"coords":[{"type":"current","xyt":[x,y,t],"ts":..,"pmap_id":"..","pmapv_id":".."}]}}`. `core/robot.js:_maybePosition` ya acepta esa forma en cualquier topic.

## 3. Candidatos a probar, por probabilidad
Ninguno tiene mucha: la causa probable es la capacidad (§4). Todos son solo lectura. Probar con el robot en `run` (en la base ya no contestó).

| # | Qué | Payload exacto | Prob. de respuesta | Notas |
|---|---|---|---|---|
| 1 | Petición RRTP byte a byte como la app | topic `req`: `{ "reqId" : "ANDROID-<appId de la sesión>" , "reqType" : "current" , "conType" : "local"}` | baja | Es lo ya probado salvo espacios y `reqId`. Barato. Probar también `reqId` = BLID y `reqId` = texto fijo corto. |
| 2 | Lo mismo en bucle cada 2 s durante `phase: run` y escuchar `#` y `umi/resp` | igual que 1 | baja | Es lo que ya hace el servidor (`positionPolling`) con `reqId` numérico: nada llegó en la misión del 2026-10-28. |
| 3 | UMI heredado byte a byte | topic `umi/req`: `{"do": "get", "args": ["pose"], "id": 1}`; respuesta esperada en `umi/resp` | muy baja | `LegacyGetPose*` es el camino de la app de 2020 (v4.8.0, solo `LegacyGetPoseCommand`, sin RRTP): robots 900/anteriores. La i1+ ya no lo debería soportar. |
| 4 | RRTP por la nube mientras hay misión | publicar en `/things/<BLID>/mission/rrtp/request` (IoT) y leer `/things/<BLID>/mission/rrtp/report/update`; cuerpo probablemente las mismas 3 claves con `conType` remoto **[inferido, claves sin leer]** | muy baja y contraria al objetivo (depende de la nube) | Solo serviría para saber si el robot soporta RRTP en absoluto. Requiere cliente MQTT/IoT con la sesión; no implementado. |
| 5 | Posición al final de la misión en la nube | `RobotPositionUseCase.fetchPositionInfos(...)` y `tLine` (`/things/%s/mission/timeline/request|report`) | media (el robot sí declara `tLine: 2`) | No es en vivo ni local, pero daría inicio/fin y recorrido por misión sin el UMF. Fuera del alcance local. |

## 4. Por qué no contesta (evidencia)
- `AssetCapabilityRecord::pose()` (`libcore_base.so`, 0x5edbc0) lee la capacidad **`pose`** del `cap` del robot (clave leída: `"pose"`; otras claves de capacidad leídas: `maps`, `pmaps`, `tLine` = línea de tiempo de misión, `mc` = `midMission`, `pp`, `team`, `odoa`, `tileScan`, `bleDevLoc`, `wDevLoc`, `area`).
- Recursos de la app (`research/jadx-res/resources/res/raw/lewis_*`, robot simulado «Demo i7», sku i710020, `sw v2.2.9-1`): `cap = {"maps": 3, "pmaps": 5, "pose": 1, "team": 1, "wDevLoc": 2, "multiPass": 2, "5ghz": 1, ...}`.
- La i1+ real: `cap = {"maps": 2, "pmaps": null, "mc": null, "tLine": 2, "team": 0, "pp": 0, "5ghz": 0, "multiPass": 3, ...}`: **no hay clave `pose`** y `pmaps` es null. Las coordenadas RRTP van asociadas a `pmap_id`/`pmapv_id`, es decir, a un mapa persistente que la i1+ no tiene.
- Conclusión **[inferido]**: el firmware de la i1+ no implementa RRTP local (ni `umi get pose`); el robot no está roto, simplemente no lo soporta. Sería coherente con que `cap.pose` esté ausente y con que durante la misión solo hayan llegado 6 mensajes de `shadow/update`.

## 5. Qué sí sale en vivo por el canal local
- Nada más que `$aws/things/<BLID>/shadow/update` (estado de `cleanMissionStatus`) y `wifistat`; el robot no publica más durante la misión (captura del 2026-10-28). `missionTelemetry`/`mssnNavStats`/`bbnav` del shadow solo informan de qué informes y contadores existen (la app de iRobot no los usa; en el simulador «Demo i7» existen `bbnav` y `mssnNavStats` en el estado inicial).
- Para el mapa propio sin nube hace falta otra fuente de posición. Opciones sin RRTP: (a) reconstruir desde `bbmssn`/`mssnNavStats` (sin posición, no sirve), (b) odometría/estimación propia a partir de eventos de estado (muy limitada), (c) seguir usando los UMF de la nube por misión y guardarlos (ya hecho: `localmap.seed`), (d) una fuente externa de posición (p. ej. una baliza BLE/Wi-Fi propia). **[inferido]**.

## 6. Cómo reproducir las lecturas (arnés)
`research/tools/vm-harness` + sysroot (`research/native/android-sysroot`) + stubs `libEGL.so`/`libGLESv3.so` vacíos con los símbolos GL/EGL que pide `libcore_jni.so` (hay que generarlos con `nm -D --undefined-only` y compilarlos con `gcc -shared`; no están en el repo). Con `dlopen` en RTLD_LAZY se cargan `libcore_base.so` y `libcore_jni.so`; las constantes `std::string` globales (SSO de libc++ NDK: byte 0 = longitud×2, datos desde el byte 1; cadenas largas: puntero en +16) se leen en `base + dirección`, con `base = dlsym(símbolo) - dirección_del_símbolo` (`nm -D`). Direcciones usadas: `libcore_base.so` 0x92fc28 (`req`), 0x92fc78 (`local`), 0x92fb68/0x92fbe0/0x92fb80 (`cmd`, `umi/req`, `delta`), 0x92dd78/0x92dd90 (`umi/resp`, `data`), 0x92ca30 (cap `pose`); `libcore_jni.so` 0x6245bf8 (`current`).
