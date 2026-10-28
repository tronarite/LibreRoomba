# Códigos de error del robot (cleanMissionStatus.error): tabla de la app oficial
Generada con `node research/tools/extract-errors.js` a partir del APK iRobot Home 7.18.0 ya decompilado: `RobotErrorCode.java` (enum: nombre y número), `RobotStatusResolver.java` (número -> recurso `history_error_*`) y `strings.xml` en inglés y español (es-ES manda sobre es; lo que falta cae a inglés). Resultado en `app/core/error-table.json`; `app/core/errors.js` expone `describe(código, idioma, {robot})`.

## Qué recurso da cada texto
| Texto | Recurso | Ejemplo (código 1, es) |
|---|---|---|
| título corto | `history_error_<sufijo>` | Rueda izquierda separada del suelo |
| mensaje completo (causa + acción) | `notification_error_<sufijo>` (o `notification_error_<número>` si el sufijo lleva texto extra, p. ej. `2_extractor`) | {robot} está atascado. Coloca el robot sobre una superficie plana y pulsa «Reanudar»… |
| aviso push corto | `push_notification_error_<sufijo>` | {robot} está atascado. |

## Cobertura
- **161 códigos mapeados con evidencia** (enum + resolver). 90 tienen mensaje completo; 71 solo título (sobre todo la serie 1xx/2xx, de otros modelos: Braava, bases, etc.).
- En el enum pero **sin entrada en el resolver** (no se mapean): 74 MAX_SQFT_REACHED_ERROR, 85 BRIDGE_REACH_FAILURE, 86 BRIDGE_TRAVERSE_FAILURE.
- **`notReady` mapeado (2026-10-28)**: `cleanMissionStatus.notReady` = N corresponde al código **200 + N** (`STARTING_ERROR_*`). Dos evidencias del APK: `RobotStatusResolver` asocia cada `STARTING_ERROR_X(200+N)` a «Start-Refuse N» / `history_start_refuse_N`, y `MissionStatus.java` lee `notReady` y lo convierte al enum `RobotReadinessState` con el mismo orden (14 → InvalidCommand = 214, 16 → BinFull = 216…). Los textos completos salen de `notification_start_refuse_N` y `push_notification_start_refuse_N` (el extractor ya los recoge: 53 rechazos ganaron mensaje). `describeNotReady(N)` en `app/core/errors.js`. Sin confirmar en el robot (solo visto `notReady: 0`). `condNotReady` (lista, vista vacía) sigue sin mapear.
- Un código fuera de la tabla devuelve `known:false` y «Error N: sin descripción».
- **Base (`dock.state`)**: constantes de `com.irobot.core.DockState` (300 desconocido, **301 lista** —el valor que reporta la base real—, 302-305 vaciado, 350-355 y 360-365 errores). Textos de la app solo para 350-355 y 360 (`autoevac_history_failed_error_N` como título, `autoevac_history_complete_error_N` como mensaje); el resto lleva una etiqueta propia marcada `source: 'libreroomba'`. Sección `dock` de `error-table.json`; `describeDock()` en `errors.js`. Los 5xx (`common_error_dock_status_*`) son de bases con agua/almohadilla y no aparecen en `dock.state`: sin integrar.

## Aviso de uso
`error-table.json` contiene textos de la app de iRobot (copyright de iRobot). Está en un repo privado para uso personal; **revisar antes de hacer público el repositorio** (se puede regenerar con el extractor sin versionarla).

## Códigos < 100 (los que puede dar una i1+)
| Código | Nombre en la app | Título (es) | Mensaje completo | Recursos |
|---|---|---|---|---|
| 1 | ROBOT_STUCK_1 | Rueda izquierda separada del suelo | sí | history_error_1, notification_error_1 |
| 2 | CLEAR_DEBRIS_EXTRACTOR | Extractores de suciedad atascados | sí | history_error_2_extractor, notification_error_2 |
| 3 | ROBOT_STUCK_3 | Rueda derecha separada del suelo | sí | history_error_3, notification_error_3 |
| 4 | LEFT_WHEEL_STUCK | Rueda izquierda atascada | sí | history_error_4, notification_error_4 |
| 5 | RIGHT_WHEEL_STUCK | Rueda derecha atascada | sí | history_error_5, notification_error_5 |
| 6 | ROBOT_ON_CLIFF_6 | Atascado junto a un desnivel | sí | history_error_6, notification_error_6 |
| 7 | LEFT_WHEEL_ERROR | Error en rueda izquierda | sí | history_error_7, notification_error_7 |
| 8 | BIN_ERROR_8 | Error en depósito | sí | history_error_8, notification_error_8 |
| 9 | BUMPER_TROUBLE | Error en parachoques | sí | history_error_9, notification_error_9 |
| 10 | RIGHT_WHEEL_TROUBLE | Error en rueda derecha | sí | history_error_10, notification_error_10 |
| 11 | BIN_ERROR_11 | Error del recipiente de residuos | sí | history_error_11, notification_error_11 |
| 12 | ROBOT_ON_CLIFF_12 | Problema en sensor de desnivel | sí | history_error_12, notification_error_12 |
| 13 | ROBOT_STUCK_13 | Ambas ruedas separadas del suelo | sí | history_error_13, notification_error_13 |
| 14 | BIN_MISSING | Falta depósito | sí | history_error_14, notification_error_14 |
| 15 | MISC_ERROR_15 | Robot reiniciado | sí | history_error_15, notification_error_15 |
| 16 | MOTION_CALIBRATION | Golpe inesperado | sí | history_error_16, notification_error_16 |
| 17 | COULD_NOT_FINISH_CLEANING | Más información | sí | learn_more, notification_error_17 |
| 18 | DOCKING_TROUBLE_DEFAULT | Problema en acoplamiento | sí | history_error_18, notification_error_18 |
| 19 | UNDOCKING_FAILED | Problema en desacoplamiento | sí | history_error_19, notification_error_19 |
| 20 | DOCKING_TROUBLE_AERO | Problema en acoplamiento | sí | history_error_20, notification_error_20 |
| 21 | LEFT_WHEEL_STALL | Robot reiniciado | sí | history_error_21, notification_error_21 |
| 22 | RIGHT_WHEEL_STALL | Problema de navegación | sí | history_error_22, notification_error_22 |
| 23 | BATTERY_AUTH_ERROR | Problema de batería | sí | history_error_23, notification_error_23 |
| 24 | NEEDS_MAINTENANCE | Problema de navegación | sí | history_error_24, notification_error_24 |
| 25 | REBOOT_REQUIRED_ERROR_25 | Es necesario reiniciar | sí | history_error_25, notification_error_25 |
| 26 | VACUUM_PROBLEM_ERROR_26 | Problema de aspirado | sí | history_error_26, notification_error_26 |
| 27 | VACUUM_PROBLEM_ERROR_27 | Problema de aspirado | sí | history_error_27, notification_error_27 |
| 29 | SOFTWARE_UPDATE_NEEDED | Actualización de software necesaria | sí | history_error_29, notification_error_29 |
| 30 | VACUUM_PROBLEM_ERROR_30 | Problema de aspirado | sí | history_error_30, notification_error_30 |
| 31 | BUMPER_COMMS_ISSUE | Es necesario reiniciar | sí | history_error_31, notification_error_31 |
| 32 | SMART_MAP_PROBLEM | Problema con el mapa inteligente | sí | history_error_32, notification_error_32 |
| 33 | PATH_BLOCKED_ERROR_33 | Ruta bloqueada | sí | history_error_33, notification_error_33 |
| 34 | REBOOT_REQUIRED_ERROR_34 | Es necesario reiniciar | sí | history_error_34, notification_error_34 |
| 35 | UNRECOGNIZED_CLEANING_PAD_ERROR | No se puede fregar | sí | history_error_35, notification_error_35 |
| 36 | BIN_FULL | Es necesario limpiar el depósito y los sensores | sí | history_error_36, notification_error_36 |
| 37 | TANK_NEEDED_REFILLING_ERROR | El tanque necesitaba rellenarlo | sí | history_error_37, notification_error_37 |
| 38 | VACUUM_PROBLEM_ERROR_38 | Error de robot | sí | history_error_38, notification_error_38 |
| 39 | REBOOT_REQUIRED_ERROR_39 | Es necesario reiniciar | sí | history_error_39, notification_error_39 |
| 40 | NAVIGATION_PROBLEM_ERROR_40 | Problema de navegación | sí | history_error_40, notification_error_40 |
| 41 | TIMED_OUT | Se ha agotado el tiempo de espera | sí | history_error_41, notification_error_41 |
| 42 | LOCALIZATION_PROBLEM | Problema de localización | sí | history_error_42, notification_error_42 |
| 43 | NAVIGATION_PROBLEM_ERROR_43 | Problema de navegación | sí | history_error_43, notification_error_43 |
| 44 | PUMP_ISSUE | Problema con la bomba | sí | history_error_44, notification_error_44 |
| 45 | LID_OPEN_ERROR | Tapa abierta | sí | history_error_45, notification_error_45 |
| 46 | LOW_BATTERY | Batería baja | sí | history_error_46, notification_error_46 |
| 47 | REBOOT_REQUIRED_ERROR_47 | Es necesario reiniciar | sí | history_error_47, notification_error_47 |
| 48 | PATH_BLOCKED_ERROR_48 | Ruta bloqueada | sí | history_error_48, notification_error_48 |
| 52 | DUST_BUNNY_ERROR | Preste atención al paño | sí | history_error_52, notification_error_52 |
| 54 | BOTH_BLADES_STALLED | Cuchillas atascadas | sí | history_error_54, notification_error_54 |
| 55 | LEFT_BLADE_STALLED | Cuchillas izquierdas atascadas | sí | history_error_55, notification_error_55 |
| 56 | RIGHT_BLADE_STALLED | Cuchillas derechas atascadas | sí | history_error_56, notification_error_56 |
| 57 | DECK_OBSTRUCTION | Unidad de corte atascada | sí | history_error_57, notification_error_57 |
| 58 | SAFETY_FAULT_CONFINEMENT | Problema de navegación | sí | history_error_58, notification_error_58 |
| 59 | SAFETY_FAULT_TILT | Inclinación detectada | sí | history_error_59, notification_error_59 |
| 60 | SAFETY_FAULT_ROLLOVER | Enrollado | sí | history_error_60, notification_error_60 |
| 62 | SAFETY_FAULT_MSTOP | Botón de parada pulsado | sí | history_error_62, notification_error_62 |
| 63 | SAFETY_FAULT_HW | Error de hardware | sí | history_error_63, notification_error_63 |
| 65 | HARDWARE_PROBLEM_ERROR | Se ha detectado un problema de hardware | sí | history_error_65, notification_error_65 |
| 66 | LOW_MEMORY_ERROR | Memoria insuficiente | sí | history_error_66, notification_error_66 |
| 67 | SAFETY_FAULT_HANDLE_LIFT | Asa levantada | sí | history_error_67, notification_error_67 |
| 68 | CAMERA_HARDWARE_FAILURE | Problema con la cámara | sí | history_error_68, notification_error_68 |
| 69 | LOCALIZATION_FAILED | Problema de navegación | sí | history_error_69, notification_error_69 |
| 70 | LOW_BEACON_COUNT | Problema para detectar las balizas | sí | history_error_70, notification_error_70 |
| 73 | PAD_TYPE_ERROR | Tipo de paño cambiado | sí | history_error_73, notification_error_73 |
| 75 | NAVIGATION_PROBLEM_ERROR_75 | Problema de navegación | sí | history_error_75, notification_error_75 |
| 76 | HARDWARE_PROBLEM_ERROR_76 | Se ha detectado un problema de hardware | sí | history_error_76, notification_error_76 |
| 78 | SAFETY_FAULT_DRIVE_STALL_LEFT | Error en rueda izquierda | sí | history_error_78, notification_error_78 |
| 79 | SAFETY_FAULT_DRIVE_STALL_RIGHT | Error en rueda derecha | sí | history_error_79, notification_error_79 |
| 88 | BACKUP_REFUSED_ERROR | Problema de navegación | sí | history_error_88, notification_error_88 |
| 89 | MISSION_RUNTIME_TOO_LONG | Se ha agotado el tiempo de espera | no | history_error_89 |
| 91 | BRIDGE_NOT_CONFINED | Error de ruta del espacio de trabajo: Volver a intentar {robot} | sí | history_error_91, notification_error_91 |
| 92 | BRIDGE_DOES_NOT_REACH_DOCK | Error de ruta del espacio de trabajo: Volver a intentar {robot} | sí | history_error_92, notification_error_92 |
| 93 | BRIDGE_DOES_NOT_REACH_YARD | Error de ruta del espacio de trabajo: Volver a intentar {robot} | sí | history_error_93, notification_error_93 |
| 94 | WHEEL_MOTOR_OVERTEMP | Sobrecalentamiento del motor de la rueda | sí | history_error_94, notification_error_94 |
| 95 | WHEEL_MOTOR_UNDERTEMP | Infracalentamiento del motor de la rueda | sí | history_error_95, notification_error_95 |
| 96 | BLADE_MOTOR_OVERTEMP | Sobrecalentamiento del motor de la cuchilla | sí | history_error_96, notification_error_96 |
| 97 | BLADE_MOTOR_UNDERTEMP | Infracalentamiento del motor de la cuchilla | sí | history_error_97, notification_error_97 |
| 98 | FLEET_DISABLED | Error de software | sí | history_error_98, notification_error_98 |
| 99 | LOCALIZATION_FAILED_ON_DOCK | Problema de navegación | sí | history_error_99, notification_error_99 |

## Códigos ≥ 100
82 códigos (101-8986); ver `app/core/error-table.json`.
