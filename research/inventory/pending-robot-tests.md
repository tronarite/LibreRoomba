# Pruebas pendientes con el robot real (hacer SOLO cuando el usuario confirme acceso)
Siempre: guardar valor previo, restaurar, parar la web app antes de scripts de research y dejarla parada al acabar.
- [x] `evac`: probado 2026-10-24, funciona (ver protocol-notes.md). Promovido a botón normal con confirmación.
- [x] `dispLight`: probado 2026-10-24 con el robot (apagado 15 s y restaurado, 2 veces): no hace nada en la i1+ (el usuario confirmó que la luz no se apaga). Quitado del panel.
- [ ] `odoaMode`, `chrgLrPtrn` (no reportados; observar efecto).
- [ ] `gentleMode`, `navStrategy` (sin plantilla JSON: probar `{"gentleMode":b}`, `{"navStrategy":N}`).
- [ ] `suctionLevel` (la i1 ignoró `vacHigh`; puede que tampoco).
- [ ] `ntphosts`, `language`/`langs2` (hueco `uLangs`, `aSlots:1`): pista para paquetes de voz.
- [ ] Historial con una misión real (`bbmssn`, `aMssnM`) y significado de `rankOverlap`.
- [x] Telemetría de mapa durante una misión: probado 2026-10-24 (110 s), no llega nada por MQTT local.
- [ ] Orden `clean` por regiones (requiere pmap; solo observar rechazo).

## Añadidas desde la sección "Experimental" del panel (app/, `LIBREROOMBA_EXPERIMENTAL=1`)
- [x] `evac`: probado 2026-10-24, funciona (ver protocol-notes.md). Promovido a botón normal con confirmación.
- [ ] `chrgLrPtrn` (0-3): ver si cambian la luz y si el robot los reporta; el rango 0-3 es una suposición.
- [ ] `suctionLevel` (0-3) y `odoaMode` (bool): comprobar si la i1+ los acepta; el rango y el tipo son suposiciones.
- [ ] Rellenar `info` real en el panel (idiomas, firmware de la base, `evacAllowed`) y comprobar que coincide con `research/dump-state.js`.
- [ ] Si algo de lo anterior funciona, moverlo de "Experimental" a "Ajustes de limpieza" y a la lista blanca `PREFS`.
