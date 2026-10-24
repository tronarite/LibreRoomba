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

## Datos del robot
La IP, el BLID y la contraseña son datos privados y no están en el repositorio. La contraseña se obtiene con `research/get-password.js <ip>` (mantener HOME hasta que parpadee el icono Wi-Fi).

## Pruebas y funciones experimentales
- `npm test` ejecuta las pruebas (núcleo, historial, descubrimiento con un respondedor UDP en 127.0.0.1, arranque y servidor en `--mock`; puertos 3191-3193; no tocan el robot ni la red real). Con `--mock`, `MOCK_AUTH_FAIL=1` simula un robot que rechaza la contraseña.
- Funciones sin probar en el robot: `odoaMode`, `suctionLevel`, `chrgLrPtrn` (cerradas por defecto: el servidor responde 403 salvo con `LIBREROOMBA_EXPERIMENTAL=1`; en `--mock` están abiertas, salvo `LIBREROOMBA_EXPERIMENTAL=0`). `evac` ya está probado y es un botón normal con confirmación; `dispLight` no funciona en la i1+. Lista de pruebas pendientes: `research/inventory/pending-robot-tests.md`.
