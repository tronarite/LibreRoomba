# Pruebas pendientes con el robot real (hacer SOLO cuando el usuario confirme acceso)
Siempre: guardar valor previo, restaurar, parar la web app antes de scripts de research y dejarla parada al acabar.
- [x] `evac`: probado 2026-10-24, funciona (ver protocol-notes.md). Promovido a botón normal con confirmación.
- [x] `dispLight`: probado 2026-10-24 con el robot (apagado 15 s y restaurado, 2 veces): no hace nada en la i1+ (el usuario confirmó que la luz no se apaga). Quitado del panel.
- [ ] `odoaMode`, `chrgLrPtrn` (no reportados; observar efecto).
- [ ] `suctionLevel` (la i1 ignoró `vacHigh`; puede que tampoco).
- [ ] `ntphosts`, `language`/`langs2` (hueco `uLangs`, `aSlots:1`): pista para paquetes de voz.
- [ ] Historial con una misión real (`bbmssn`, `aMssnM`) y significado de `rankOverlap`.
- [x] Telemetría de mapa durante una misión: probado 2026-10-24 (110 s), no llega nada por MQTT local.
- [x] Orden `clean` por regiones (requiere pmap; solo observar rechazo). 2026-10-28: rechazada con error 224 (incompatibilidad de versión de mapa).
- [x] Modos extra (2026-10-28, `research/test-modes.js`): `quick` desconocida, `spot` aceptada pero sin efecto en la base, `train` funciona (`cycle: train`).
- [ ] `spot` con el robot fuera de la base (el usuario lo coloca donde quiera limpiar) y `train` completo: ¿aspira o solo recorre? ¿aparece en el historial de la nube y deja mapa UMF?

- [x] (2026-10-28, probado entero: ver abajo y protocol-notes.md) No molestar (`app/core/dnd-guard.js`): confirmar que una misión de la programación reporta `cleanMissionStatus.initiator: "schedule"` (solo visto `manual` en el robot; `schedule` es lo que lleva `cleanSchedule2.cmd`) y que `dock` la termina limpia (sin error ni misión "detenida" en el historial). Prueba sin cambiar la programación: crear una franja que empiece en 1-2 min durante una limpieza manual y observar. 2026-10-28: el aviso y la orden salieron a su hora, pero la i1+ ignoró `dock` en `run`; corregido con `stop` + espera a `notReady` 0 + `dock`: repetida y FUNCIONA (vuelve a la base, vacía y carga; avisos limpios). Arranque programado probado con una entrada temporal de `cleanSchedule2` (restaurada idéntica): el robot reporta `initiator: "schedule"` (antes que `phase: run`) y LibreRoomba lo corta en <1 s.
- [x] (2026-10-28: el `initiator` llega antes que `phase: run`, ver protocol-notes.md) No molestar: comprobar que el robot envía `cleanMissionStatus` entero (con `phase` e `initiator` en el mismo delta). Si `initiator` llegara después, un arranque programado se escaparía y un `initiator: "schedule"` viejo podría mandar a la base un arranque con el botón; en ese caso, detectar la misión nueva por `missionId`/`mssnStrtTm`.

- [x] (2026-10-28: 301 lista, 300 fuera de la base, 302 vaciando, 303 vaciado completo; notReady 6 + error 2 al atascarse los extractores, 39 al parar «guardando el mapa», 1-4 al levantar el robot) `notReady` y `dock.state`: anotar los valores reales que aparezcan (p. ej. robot fuera de la base o depósito quitado → `notReady` 7 = sin depósito; durante `evac` → `dock.state` 302/303) y comprobar que coinciden con `describeNotReady`/`describeDock`. Solo observar, sin provocar errores.

## Añadidas desde la sección "Experimental" del panel (app/, `LIBREROOMBA_EXPERIMENTAL=1`)
- [x] `evac`: probado 2026-10-24, funciona (ver protocol-notes.md). Promovido a botón normal con confirmación.
- [ ] `chrgLrPtrn` (0-3): ver si cambian la luz y si el robot los reporta; el rango 0-3 es una suposición.
- [ ] `suctionLevel` (0-3) y `odoaMode` (bool): comprobar si la i1+ los acepta; el rango y el tipo son suposiciones.
- [ ] Rellenar `info` real en el panel (idiomas, firmware de la base, `evacAllowed`) y comprobar que coincide con `research/dump-state.js`.
- [ ] Si algo de lo anterior funciona, moverlo de "Experimental" a "Ajustes de limpieza" y a la lista blanca `PREFS`.
- [x] `gentleMode`/`navStrategy`: descartados por análisis estático (la i1+ no declara la capacidad `gentle`); ver native-decomp.md.
