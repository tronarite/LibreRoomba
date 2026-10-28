# LibreRoomba

Aplicación web local para controlar una Roomba i1+ desde el navegador.

## Arranque de prueba (sin robot)

```powershell
npm install
node server.js --mock
```

Abre `http://127.0.0.1:3000`. El modo `--mock` no realiza ninguna conexión al robot y permite probar los botones y la API.

## Uso con el robot

Sin `--mock`, el servidor **exige** `ROBOT_IP` y `ROBOT_BLID` (variables de entorno, sin valor por defecto) y usa además `ROBOT_PASSWORD`, `PORT` y `HOST` (por defecto, `127.0.0.1`). Si no se define `ROBOT_PASSWORD`, la contraseña se lee de `../research/robot-password.txt`; nunca se muestra por la API ni en registros.

Forma cómoda: `npm run robot` (`node start.js`) toma `ROBOT_IP` y `ROBOT_BLID` del entorno o, si faltan, de `LOCAL-NOTES.md` (líneas `CLAVE=valor`, archivo ignorado por git) y arranca el servidor sin imprimir esos valores. Ejemplo manual: `node server.js`.

Opcional: `LIBREROOMBA_DISCOVER=1` hace que, si el robot deja de responder tras varios intentos, el servidor busque su IP nueva por UDP (puerto 5678, filtrando por BLID) y reconecte; está desactivado por defecto.

Si el robot rechaza la contraseña (p. ej. tras volver a emparejarlo), el panel lo indica con la ayuda para renovarla y el servidor reintenta con esperas largas (30 s hasta 5 min). `GET /api/health` devuelve el estado de salud (`ok`, `connected`, `authFailed`, `ageSeconds`, `version`) con 503 si no hay conexión.

## Nube de iRobot (solo lectura): historial y mapa
Con una sesión creada una vez por ti en tu terminal (`node research/cloud/login.js`; la contraseña la escribes tú y no se guarda) el panel muestra el historial real de la nube y un mapa de cobertura. Sin sesión, o con la sesión caducada, el panel dice cómo crearla. El servidor solo hace GET firmados (AWS SigV4) a rutas de una lista blanca y nunca registra credenciales; los mapas se guardan en `app/data/` (ignorado por git).
- `GET /api/cloud/status`: si hay sesión y cuándo caduca (sin credenciales).
- `GET /api/cloud/history`: misiones normalizadas (resultado, duración, m², vaciados), de la más reciente a la más antigua.
- `GET /api/cloud/map[?limit=N]`: mapa fusionado de las últimas N misiones (60 por defecto). Cada misión se alinea por la **pose y la orientación de la base**: el robot arranca con una orientación algo distinta cada vez (~0,1 rad en datos reales) y solo trasladar desenfoca varios metros. Devuelve rejilla en base64 (número de misiones por celda de 0,105 m), zonas con atascos repetidos y totales por tipo. Con `--mock` usa una nube simulada.

## Avisos y errores
- `app/core/errors.js`: `describe(código, idioma, {robot})` devuelve título, mensaje (causa y acción) y aviso corto con los **textos de la app oficial** (tabla `error-table.json` generada del APK con `node research/tools/extract-errors.js`; ver `research/inventory/error-codes.md`). Un código sin texto da «Error N: sin descripción» (`known:false`), nunca inventa.
- `app/core/notifier.js`: convierte los cambios del estado en avisos: depósito lleno, misión terminada (con duración) o detenida, error del robot (con su texto), robot atascado, batería baja (<15 % sin cargar, con rearme), robot desconectado/reconectado y contraseña rechazada/aceptada. Solo avisa de **transiciones**: el estado inicial no genera avisos; cada tipo lleva antirrebote y los cortes de menos de 5 s no se avisan.
- `GET /api/events`: últimos 50 avisos (el más reciente primero). Los avisos nuevos también viajan por el WebSocket como `{ "notification": {...} }`.
- Panel: tarjeta «Avisos» (lista accesible, `role="log"`, la gravedad va en el texto) y botón opcional «Activar avisos del navegador» (Notification API, sin sonido, solo con la pestaña oculta; se activa con un clic y se recuerda en `localStorage`).
- También avisa cuando el robot **no puede empezar** (`cleanMissionStatus.notReady` = N, texto del rechazo 200 + N de la app, p. ej. 16 = depósito lleno) y de los **errores de la Clean Base** (`dock.state` 350-365: falta la bolsa, obstrucción, bolsa llena…). El panel muestra esos textos en la tarjeta del robot y el estado de la base en Información (`/api/state`: `errorText`, `notReady`, `dock`). Sin resolver: `condNotReady` y los códigos 5xx de bases con agua.

## No molestar (Do Not Disturb)
Réplica de la función de la app oficial, que allí vive en la nube (en el nativo aparecen `start_dnd` como acción y `dndEnd` como motivo de fin de misión), no en el robot. Aquí la aplica el servidor (`core/dnd.js` lógica pura, `core/dnd-guard.js` vigilante):
- Franjas (máximo 10) con etiqueta de la app (Momento de tranquilidad, Hora de la siesta, Noche de películas, Reunión semanal o Personalizada con nombre), días y hora de inicio/fin; si el fin es anterior al inicio la franja acaba al día siguiente. Hora local del equipo que ejecuta el servidor. Se guardan en `app/data/dnd.json` (`LIBREROOMBA_DND_FILE` cambia la ruta, para pruebas).
- Al **empezar** una franja, la misión en curso termina (orden `dock`). Una misión de la **programación** del robot (`initiator: "schedule"`) que arranca desde la base durante una franja se manda a la base («Programación bloqueada por No molestar»). Las que inicia el usuario (botón, panel, app) se respetan; el panel pide confirmación al pulsar Limpiar, como la app.
- Solo actúa en transiciones: una misión que ya estaba en curso al arrancar el servidor, o al guardar una franja que cubre la hora actual, se respeta; un arranque de la programación visto por primera vez tras una reconexión sí se termina. Si la franja empieza con el robot desconectado (o la orden falla), se reintenta al reconectar mientras dure la franja. Antirrebote de 2 min tras cada `dock` enviado. La tarjeta Programación avisa al guardar una programación que choca con una franja.
- Límites: solo funciona con el servidor en marcha y conectado; la programación vive en el robot y no se puede impedir que empiece, solo terminarla; no hay forma conocida de silenciar los sonidos del robot. La app oficial desactiva las programaciones que chocan con una franja; aquí solo se avisa (`conflicts.schedule` en `/api/dnd` y `warnings` en `POST /api/schedule`).
- `GET /api/dnd` → `{ items, active, conflicts: { overlaps, schedule } }`; `POST /api/dnd {items}` guarda (400 si no es válido). `/api/state` incluye `dnd` (franja activa y hora de fin) para el aviso del panel; los cambios de franja se avisan (`dnd-started`, `dnd-ended`, `dnd-ended-mission`, `dnd-blocked-schedule`, `dnd-dock-failed`).

## Datos del robot
La IP, el BLID y la contraseña son datos privados y no están en el repositorio. La contraseña se obtiene con `research/get-password.js <ip>` (mantener HOME hasta que parpadee el icono Wi-Fi).

## Pruebas y funciones experimentales
- `npm test` ejecuta las pruebas (núcleo, historial, firma SigV4 con el vector oficial de AWS, cliente de la nube con `fetch` falso, fusión de mapas con datos sintéticos, descubrimiento con un respondedor UDP en 127.0.0.1, arranque, errores, avisos con secuencias del robot simulado y servidor en `--mock`; puertos 3191-3193; no tocan el robot ni la red real). Con `--mock`, `MOCK_AUTH_FAIL=1` simula un robot que rechaza la contraseña.
- Funciones sin probar en el robot: `odoaMode`, `suctionLevel`, `chrgLrPtrn` (cerradas por defecto: el servidor responde 403 salvo con `LIBREROOMBA_EXPERIMENTAL=1`; en `--mock` están abiertas, salvo `LIBREROOMBA_EXPERIMENTAL=0`). `evac` ya está probado y es un botón normal con confirmación; `dispLight` no funciona en la i1+. Lista de pruebas pendientes: `research/inventory/pending-robot-tests.md`.
