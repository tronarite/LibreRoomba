# Pantallas y funciones de iRobot Home 7.18.0 relevantes para la i1+

Fuente: `research/jadx-res/resources/res/values/strings.xml` (cadenas en inglés), `app-ui-titles.txt` y los nombres de comando de `commands-full.md` / `settings-json.md`. Es un inventario por títulos y textos: no se ha trazado el flujo real de cada pantalla. "Impl." se refiere a `app/` (panel LibreRoomba) a fecha de este archivo.

Leyenda de dependencias: **R** = necesita el robot (MQTT local), **N** = necesita la nube de iRobot, **M** = necesita mapa (pmap), **—** = solo cliente.

| Pantalla (texto de la app) | Datos que muestra | Ajuste / orden asociado | Impl. | Dependencia |
|---|---|---|---|---|
| Inicio: estado y botones (Clean, Pause, Resume, Stop, Dock, Find) | fase, batería, error, depósito lleno | `cmd` start/pause/resume/stop/dock/find | sí | R |
| Inicio: aviso Child Lock activo ("Child Lock is on") | bloqueo infantil | `childLock` | sí (ajuste) | R |
| Cleaning Preferences → Passes (One pass / Two pass) | pasadas | `twoPass`, `noAutoPasses` | sí (`twoPass`) | R |
| Cleaning Preferences → Cleaning Behaviors (Deep / Detail / Extended) | solapamiento | `rankOverlap` (15/25/67/85, correspondencia exacta sin confirmar) | sí | R |
| Cleaning Preferences → Power Boost (Automatic / Eco / Performance) | succión en alfombra | `carpetBoost`+`vacHigh` (la i1 los ignora), `suctionLevel` (sin probar) | no | R |
| Bin Behavior / Bin Full Behavior ("Keep cleaning when full" / "Do not clean when full") | comportamiento con depósito lleno | `binPause` | sí | R |
| Clean edges (borde abierto) | bordes | `openOnly` | sí | R |
| Dock Settings → Empty Bin Button / Clean Base (bolsa, "Empty Bin") | estado de la base, bolsa | `evac` (sin probar), `evacAllowed` (solo lectura), `binTypeDetect` | parcial (`binTypeDetect` sí; `evac` experimental; `evacAllowed` en Información) | R |
| Reduced Power Standby Mode | modo de bajo consumo | `ecoCharge` | sí | R |
| Robot Name ("What would you like to name your robot?") | nombre | `name` | sí | R |
| Schedules (Cleaning, Do Not Disturb, conflictos, máximo de eventos) | programación semanal | `cleanSchedule2` | sí (limpieza; sin DND) | R |
| Pausar programación | hold de programación | `schedHold` | sí | R |
| Do Not Disturb (Quiet time, Nap, Movie night…) | franjas sin molestar de la app | No es del robot: en la app es de la nube (`start_dnd`, `dndEnd` en `libcore_base.so`; `history_start_refuse_70`) | sí (en el servidor: termina misiones y bloquea la programación con `dock`; sin silenciar sonidos) | N (oficial) / R (propio) |
| History (Area / Dirt / Lifetime, "View All") | misiones, área, suciedad | `GetMissionHistory` (nube), `bbmssn`, telemetría | parcial (historial local propio, sin probar con misión real) | R (propio) / N (oficial) |
| Robot Health / Product Health (partes, "Did you replace the part?") | desgaste de piezas | `bbrun`, `bbchg`, `PreventativeMaintenance`, `GetRobotParts` | parcial (contadores en mantenimiento) | R |
| Maintenance (limpieza de la base, Pad Wash) | pasos guiados | solo textos de ayuda; Pad Wash no aplica a la i1+ | no | — |
| Language / Voice ("Additional Languages", "Download Language", "Changing Language", "Factory default", "Automatic") | idioma de voz y paquetes | `langs2` (`sLang`, `dLangs`, `uLangs`, `aSlots:1`), `SetRobotLanguageV2`, OTA de idioma | solo lectura (Información) | R + N (descarga de paquetes) |
| App Language | idioma de la app | — | n/a | — |
| Robot Software Update (comprobar/descargar/instalar) | versión, actualización | `StartOnDemandOta`, `softwareVer` | solo lectura de versión | R + N |
| Wi‑Fi / Advanced Wi‑Fi Settings | red, señal | `wifistat`, `netinfo`, `SetWifiConfig` (no tocar) | solo señal | R |
| Settings → Model / SKU / Country / Time zone | datos del robot | `sku`, `country`, `timezone` | sí (Información) | R |
| Notifications (push) | avisos de misión/errores | `GetNotifications`, push de la nube | no (posible con eventos locales) | N / R |
| Automations / Smart Home (Alexa, Google, Matter, IFTTT, ubicación) | integraciones | nube / `StartMatterCommissioning` | no | N |
| Smart Maps (Imprint), Edit Map, Rename Rooms, Clean Zones, Keep Out Zones | mapa y habitaciones | `pmaps`, `clean` con `regions` | no | M + N |
| Dirt Detective | recomendaciones por mapa | `clean-score` (nube) | no | M + N |
| Mapping Run / Mapping Tips | recorrido de mapeo | `pmapLearningAllowed`, `pmapCL` (ignorados) | no | M + N |
| Quick/Spot clean, Train | modos extra | `command` quick/spot/train (valores vistos como cadenas) | no | R |
| Pad Wash / Water amount / Dry pad | limpieza húmeda | no aplica a la i1+ (aspiradora) | no | — |

## Conclusiones
- Sin mapas ni nube, lo implementable en el panel ya está casi todo; lo que falta es **sin probar** (evac, dispLight, odoaMode, suctionLevel, chrgLrPtrn) y se ha puesto en la sección "Experimental" (cerrada por defecto).
- Candidatos para añadir cuando haya acceso al robot: quick/spot/train, `noAutoPasses`, DND propio (en LibreRoomba, no en el robot), notificaciones web a partir de eventos locales (error, depósito lleno, fin de misión).
- Idioma de voz: `langs2.uLangs` y `aSlots:1` indican un hueco para un paquete de usuario; la app descarga paquetes de la nube (textos "Downloading language to the robot" / "Installing language on the robot"). Investigar el formato del paquete antes de pensar en audio propio.
