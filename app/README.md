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

Ejemplo: `node server.js`

## Datos del robot
La IP, el BLID y la contraseña son datos privados y no están en el repositorio. La contraseña se obtiene con `research/get-password.js <ip>` (mantener HOME hasta que parpadee el icono Wi-Fi).

## Pruebas y funciones experimentales
- `npm test` ejecuta las pruebas del servidor en modo `--mock` (puertos 3191 y 3192; no tocan el robot).
- Las funciones sin probar en el robot (`evac`, `dispLight`, `odoaMode`, `suctionLevel`, `chrgLrPtrn`) están cerradas por defecto: el servidor responde 403 salvo con `LIBREROOMBA_EXPERIMENTAL=1` (en `--mock` están abiertas, salvo `LIBREROOMBA_EXPERIMENTAL=0`). Lista de pruebas pendientes: `research/inventory/pending-robot-tests.md`.
