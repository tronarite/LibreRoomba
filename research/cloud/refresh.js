// Renueva las credenciales de la nube (duran ~1 h) sin pedir la contraseña. Uso: node research/cloud/refresh.js
const path = require('path');
const { refreshSession } = require('../../app/core/session-refresh');
refreshSession({ sessionPath: path.join(__dirname, 'session.json') })
  .then((r) => console.log(`Sesión renovada. Caduca: ${r.expiresAt}`))
  .catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
