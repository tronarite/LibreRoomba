# Plan: dejar de depender del servidor de iRobot (decisión del usuario, 2026-10-28)

Principio: LibreRoomba debe funcionar solo con el robot en la red local. La nube de iRobot pasa a ser un extra opcional (y, al final, desactivable en el robot). Cada pieza nueva debe funcionar sin sesión de nube.

## Estado por función
| Función | Hoy | Dependencia de nube | Alternativa local |
|---|---|---|---|
| Control, ajustes, programación, No molestar, avisos, errores | MQTT local | ninguna | — (hecho) |
| Historial de misiones | nube (`/api/cloud/history`) + historial propio (`/api/history`) | opcional | historial propio con `bbmssn`; ampliar con área/duración medidas en la misión |
| Salud de piezas | nube (`/v1/robots/<blid>/parts`) | **sí** | HECHO: contadores locales (`bbrun.hr`) con vida útil configurable (`app/core/localparts.js`, `/api/parts`) |
| Mapa de cobertura | nube (UMF por misión) | **sí** | mapa propio con la posición pedida al robot (`req` / `umi/req`, `core/localmap.js`); requiere confirmar RRTP con el robot |
| Habitaciones | rectángulos propios; cobertura usa el mapa | parcial | cobertura desde el mapa local |
| Firmware / OTA | nube de iRobot | **sí** | sin alternativa conocida (paquetes firmados); no bloquear la OTA hasta saberlo |
| Descubrimiento | UDP local | no | — |
| Conexión del robot a la nube | `cloudEnv`/`sdiscUrl` | sí | **vetado** hasta que el usuario diga que el sistema es definitivo; cuando llegue: bloquear la salida a internet del robot en el router (sin tocar el robot) como primera prueba reversible |

## Orden de trabajo
1. Piezas locales (sin robot): `localparts`.
2. Mapa local: acumulador de posiciones probado contra `fake-robot`; luego, con acceso al robot, validar el formato de `req`.
3. Que la interfaz muestre la nube solo si hay sesión (ya degrada con aviso) y priorice los datos locales.
4. Prueba final (con el usuario): robot sin acceso a internet durante unos días; anotar qué se rompe en la app oficial y en LibreRoomba.
