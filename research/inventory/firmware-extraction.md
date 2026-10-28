# Extracción del firmware de la i1+ (estado 2026-10-28)

## Cadena montada
| Pieza | Archivo | Estado |
|---|---|---|
| Petición `request-ota` (única escritura; prueba por defecto, `--send` + `LIBREROOMBA_CONFIRM_OTA=yes`, sin reintentos, guarda respuesta, `--download` con SHA256) | `research/cloud/request-ota.js` (+ `app/test/request-ota.test.js`) | hecha, probada con fetch simulado; SIN envío real |
| Foto previa y vigilancia (solo lectura, vía `/api/raw` de la web app) | `research/firmware-watch.js` `snapshot` / `watch` | hecha, probada contra `--mock` y el robot real (snapshot) |
| `app_id` guardado al iniciar sesión | `research/cloud/login.js` (`appId`) | hecho; hay que repetir el login |
| Análisis | VM: binwalk, unsquashfs, ubireader, jefferson, mtd-utils, lz4, zstd, openssl, xz, 7z, tcpdump, tshark; REA `extract_firmware` / `inspect_firmware_regions` | listo |
| Salida | `research/firmware/` (ignorada por git) | |

## Datos del robot (de `softwareVer` / `subModSwVer`)
- `softwareVer`: `daredevil+2.6.0+daredevil-release+163` (la cadena completa; probablemente es la que la app manda en `software_version`, NO el corto `daredevil+2.6.0`).
- El firmware es Linux (`subModSwVer.linux`, componentes `nav`, `mob`, `pwr`, `sft`, `mobBtl`, `con`), compilado con ubuntu.

## Huecos conocidos
- No se ve el tráfico del robot (PC solo en Ethernet; sin espejo en el router): si la nube no devuelve la URL, el robot descarga por su cuenta y no capturamos el paquete.
- La nube puede exigir que `app_id` coincida con el del login.
- Respuesta de `request-ota` desconocida; secureBoot PRODUCTION: un paquete propio no se instalaría.
- Si el robot se actualiza no hay vuelta atrás y puede cambiar la contraseña local (recuperar con `get-password.js`).

## Resultado de las pruebas (2026-10-28) y estado: PENDIENTE
- `request-ota` con la versión real (`daredevil+2.6.0+daredevil-release+163`) y con una falsa más antigua (`daredevil+2.5.0+daredevil-release+150`): ambas HTTP 200 `{"result":"success"}`, sin URL ni paquete; el robot no cambió (versión, `deploymentState` 0, en la base). La nube no devuelve el paquete por esta ruta; es solo un aviso al robot.
- La app no tiene ninguna ruta de consulta de actualización (solo `missionhistory`, `pmaps`, `maintenance`, `reset`, `request-ota`).
- Vías que quedan: (1) esperar a una versión nueva y registrar a qué servidor baja el robot (DNS por DHCP: el router Movistar Wi-Fi 7 puede no dejar; no se hace ARP spoofing) o capturar tráfico; (2) volcar la flash abriendo el robot (pinza SPI/serie, ~10 €). Decisión del usuario: se deja como tarea pendiente.
- La sesión de la nube ahora se renueva sola (`app/core/session-refresh.js`, `research/cloud/refresh.js`).
