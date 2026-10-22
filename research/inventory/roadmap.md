# Clon web de la app iRobot: inventario y plan

Fuentes: `native-commands.txt` (formatos de órdenes extraídos de `libcore_*.so`), `app-ui-titles.txt` y `strings.xml` de la app 7.18.0. Pendiente de verificar en el robot cada fila marcada "?".

## 1. Qué entiende el robot por MQTT local (probado o visto en el nativo)
| Función | Orden | Estado |
|---|---|---|
| Limpiar / parar / pausa / reanudar / base | `cmd` `{"command":X,"time":N,"initiator":"localApp"}` | Probado (start, dock) |
| Vaciar depósito en base (evac), buscar (find), etc. | mismo formato, más comandos | ? |
| Limpieza por zonas/habitaciones | `{"command":"clean","ordered":N,"regions":[..],"pmap_id","pmapv_id"}` | Requiere pmap (bloqueado) |
| Succión / alfombra | `{"carpetBoost":b,"vacHigh":b}` | Ignorado por la i1 (probado 2026-10-22) |
| Pasadas | `{"twoPass":b,"noAutoPasses":b}` | OK vía `delta` (probado, revertido) |
| Solapamiento | `{"rankOverlap":N}` | OK vía `delta` (valor actual 15) |
| Limpieza de bordes | `{"openOnly":b}` | ? |
| Pausa por depósito lleno | `{"binPause":b}` | OK vía `delta` |
| Bloqueo infantil | `{"childLock":b}` | ? |
| Luz del anillo | `{"dispLight":b}` | No reportado por la i1; sin probar |
| Idioma / hora local | `{"language":..}`, `{"utctime":..}`, `{"localtimeoffset":..}` | ? |
| Programación semanal | `{"cleanSchedule":{"cycle":[7 valores],..}}` (y `cleanSchedule2`) | ? |
| Wi-Fi, logs | `uap`, `wactivate`, `sendwifilog`, `logUpload` | No tocar |
| Aprendizaje de mapas | `{"pmapLearningAllowed":b}`, `{"pmapCL":b}`, `{"mapUploadAllowed":b}` | Ignorado hasta ahora |
Los ajustes se envían como `{"state":{"clave":valor}}` (topic `delta`) o `{"state":{"desired":{..}}}` (shadow update). Hay que ver cuál acepta cada uno.

## 2. Funciones de la app que dependen de la nube o de mapas
Mapas inteligentes (Imprint), editar mapa y habitaciones, zonas prohibidas (KOZ), zonas de limpieza, Dirt Detective, historial y estadísticas, recomendaciones (CBO), automatizaciones por ubicación, Alexa/Google/Siri/IFTTT/Matter, mantenimiento de la base (Pad Wash, Clean Base), actualizaciones de firmware, notificaciones push.

## 3. Fases
1. **Control completo local** (sin mapas): pantalla de inicio, modos, ajustes (tabla 1), programación, estado y mantenimiento (contadores `bbrun`, `bin`, `bbchg`), con prueba real de cada ajuste.
2. **Todo lo visible de la app que no requiere mapa**: historial local de misiones, notificaciones web, vista de salud del robot.
3. **Mapas**: ver qué activa `optFeats.pmaps` (análisis de `libcore_jni.so` y de la API `disc-*.iot.irobotapi.com`) y reconstruir el mapa con telemetría `vslam`.
4. **Más allá**: según lo que se descubra.

Reglas: cambios a `beta`, merge a `main` solo con tu confirmación; ninguna prueba cambia ajustes sin avisarte; guardar el valor previo para poder revertir.
