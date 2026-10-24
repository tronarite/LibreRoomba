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
