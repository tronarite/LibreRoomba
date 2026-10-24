# Pruebas pendientes con el robot real (hacer SOLO cuando el usuario confirme acceso)
Siempre: guardar valor previo, restaurar, parar la web app antes de scripts de research y dejarla parada al acabar.
- [ ] `evac` (`{"command":"evac",...}`): mueve el robot a la base de vaciado.
- [ ] `dispLight` (no se reporta; observar el anillo de luz a ojo).
- [ ] `odoaMode`, `chrgLrPtrn` (no reportados; observar efecto).
- [ ] `gentleMode`, `navStrategy` (sin plantilla JSON: probar `{"gentleMode":b}`, `{"navStrategy":N}`).
- [ ] `suctionLevel` (la i1 ignoró `vacHigh`; puede que tampoco).
- [ ] `ntphosts`, `language`/`langs2` (hueco `uLangs`, `aSlots:1`): pista para paquetes de voz.
- [ ] Historial con una misión real (`bbmssn`, `aMssnM`) y significado de `rankOverlap`.
- [ ] Telemetría `vslam_report`/`map_save` durante una misión (reconstrucción de mapa).
- [ ] Orden `clean` por regiones (requiere pmap; solo observar rechazo).

## Añadidas desde la sección "Experimental" del panel (app/, `LIBREROOMBA_EXPERIMENTAL=1`)
- [ ] `evac` desde el panel: comprobar que `cmd` `{"command":"evac"}` hace que el robot vaya a la base de vaciado y que `cleanMissionStatus.phase` pasa a `evac`.
- [ ] `dispLight` (bool) y `chrgLrPtrn` (0-3): ver si cambian la luz y si el robot los reporta; el rango 0-3 es una suposición.
- [ ] `suctionLevel` (0-3) y `odoaMode` (bool): comprobar si la i1+ los acepta; el rango y el tipo son suposiciones.
- [ ] Rellenar `info` real en el panel (idiomas, firmware de la base, `evacAllowed`) y comprobar que coincide con `research/dump-state.js`.
- [ ] Si algo de lo anterior funciona, moverlo de "Experimental" a "Ajustes de limpieza" y a la lista blanca `PREFS`.
