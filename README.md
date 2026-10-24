# LibreRoomba

Clon web local de la app de iRobot para controlar una **Roomba i1+** sin depender de la nube, y estudiar el robot a fondo. Proyecto personal de investigación sobre un dispositivo propio.

> Estado: trabajo en curso en la rama `beta`. La Roomba sigue funcionando con la app y la nube oficiales; LibreRoomba se construye en paralelo y no sustituye nada hasta darlo por definitivo.

## Qué hay

| Carpeta | Contenido |
|---|---|
| `app/` | Panel web (Node: express + ws + mqtt). Control, ajustes, programación, mantenimiento, historial propio. Ver `app/README.md`. |
| `research/` | Scripts de investigación del protocolo local, notas y inventarios. |
| `research/protocol-notes.md` | Protocolo local (UDP 5678, MQTT TLS 8883) y todo lo probado, con fecha. |
| `research/inventory/` | Órdenes y campos extraídos del nativo, formatos JSON, pantallas de la app oficial, pruebas pendientes con el robot. |
| `CLAUDE.md` | Guía para retomar el trabajo (estado, decisiones, flujo de trabajo). |

## Arranque rápido (sin robot)

```powershell
cd app
npm install
node server.js --mock     # http://127.0.0.1:3000, no se conecta a nada
npm test
```

Con el robot hacen falta `ROBOT_IP` y `ROBOT_BLID` en el entorno y la contraseña local en `research/robot-password.txt` (ver `app/README.md`). **Solo admite una conexión MQTT local a la vez**: mientras el panel está conectado, la app oficial no tiene el robot en modo local.

## Lo que se sabe (resumen)

- Protocolo local: MQTT sobre TLS (`AES128-SHA256` + `SSL_OP_LEGACY_SERVER_CONNECT`); órdenes por el topic `cmd`, ajustes por `delta`.
- Órdenes probadas: `start`, `stop`, `pause`, `resume`, `dock`, `find`, `evac`.
- Ajustes aceptados: `twoPass`, `rankOverlap`, `binPause`, `openOnly`, `childLock`, `ecoCharge`, `schedHold`, `binTypeDetect`, `name`, `cleanSchedule2`.
- Ignorados por la i1+: `carpetBoost`/`vacHigh`, `pmapCL`, `pmapLearningAllowed`, `noPP`, `dispLight`.
- Mapas: no hay datos de mapa por la conexión local (probado en una misión real). El interruptor que los habilita (`PMAP_CL_FSW`) es de la cuenta de iRobot, es decir, de la nube.

## Reglas del repositorio

- Nunca se versionan BLID, IP, MAC, contraseña, correo, el APK ni volcados del nativo o decompilados (ver `.gitignore`). Los datos reales viven en `LOCAL-NOTES.md`, que git ignora.
- Cualquier prueba que cambie algo en el robot guarda el valor previo y lo restaura.
- Rama de trabajo `beta`; `main` solo con confirmación.

## Aviso

Proyecto no afiliado a iRobot. Se investiga un dispositivo propio mediante su interfaz local; no se redistribuye código ni binarios de iRobot.
